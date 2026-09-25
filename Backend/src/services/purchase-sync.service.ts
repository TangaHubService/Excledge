import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { isEbmEnabled, fix2, toRraDate, toRraDateTime } from './rra-ebm.service';
import { buildVsdcEnvelope, selectPurchases, savePurchase, validateVsdcEnvelope, toRraReqDt } from './vsdc-api.service';
import { receiveStockOnBranch, resolveActiveBranchId } from './inventory-ledger.service';
import { allocateItemCd, getOriginNationCode, DEFAULT_PKG_UNIT_CD } from './item-code.service';
import { TaxService } from './tax.service';
import { getTaxationTypes } from './rra-code.service';
import { syncProductToRra } from './product-sync.service';
import logger from '../utils/logger';

/**
 * RRA B2B purchases (RRA checklist §70, §71).
 *
 *  §70  syncRraPurchases()   — pull the B2B sales issued to this taxpayer
 *                              (/trnsPurchase/selectTrnsPurchaseSales) and
 *                              cache them for review.
 *  §71  confirmRraPurchase() — record/confirm a received purchase
 *                              (/trnsPurchase/savePurchases, pchsSttsCd='02'),
 *                              which also books the stock-in at RRA.
 */

const CURSOR_RESOURCE = 'purchases';

async function getCursor(organizationId: number): Promise<string> {
  const row = await prisma.rraSyncCursor.findUnique({
    where: { organizationId_resource: { organizationId, resource: CURSOR_RESOURCE } },
  });
  return row?.lastReqDt ?? '20200101000000';
}

async function saveCursor(organizationId: number, lastReqDt: string, result: string): Promise<void> {
  await prisma.rraSyncCursor.upsert({
    where: { organizationId_resource: { organizationId, resource: CURSOR_RESOURCE } },
    create: { organizationId, resource: CURSOR_RESOURCE, lastReqDt, lastRunAt: new Date(), lastResult: result },
    update: { lastReqDt, lastRunAt: new Date(), lastResult: result },
  });
}

// ── §70: pull received purchases ─────────────────────────────

export async function syncRraPurchases(
  organizationId: number,
  branchId?: number | null,
): Promise<{ ok: boolean; fetched: number; cached: number; error?: string }> {
  if (!isEbmEnabled()) return { ok: false, fetched: 0, cached: 0, error: 'EBM is not enabled' };

  const since = await getCursor(organizationId);
  const runAt = toRraReqDt(new Date());
  const envelope = await buildVsdcEnvelope(organizationId, branchId ?? null);
  const res = await selectPurchases(envelope, since);
  if (!res.success) {
    await saveCursor(organizationId, since, `FAILED: ${res.resultMsg}`);
    return { ok: false, fetched: 0, cached: 0, error: `${res.resultCd}: ${res.resultMsg}` };
  }

  // The sandbox returns the list under `saleList` (per TrnsPurchaseSalesRes).
  const list = (res.data as any)?.saleList ?? (res.data as any)?.trnsPurchaseSalesList ?? [];
  let cached = 0;
  for (const p of list) {
    const spplrInvcNo = BigInt(p.spplrInvcNo ?? 0);
    await prisma.rraPurchase.upsert({
      where: {
        organizationId_spplrTin_spplrInvcNo: {
          organizationId,
          spplrTin: p.spplrTin ?? '',
          spplrInvcNo,
        },
      },
      create: {
        organizationId,
        spplrTin: p.spplrTin ?? '',
        spplrNm: p.spplrNm ?? null,
        spplrBhfId: p.spplrBhfId ?? null,
        spplrInvcNo,
        rcptTyCd: p.rcptTyCd ?? null,
        pmtTyCd: p.pmtTyCd ?? null,
        salesDt: p.salesDt ?? null,
        totItemCnt: p.totItemCnt ?? null,
        totTaxblAmt: p.totTaxblAmt ?? null,
        totTaxAmt: p.totTaxAmt ?? null,
        totAmt: p.totAmt ?? null,
        remark: p.remark ?? null,
        rawResponse: p as Prisma.InputJsonValue,
        items: {
          create: (p.itemList ?? []).map((it: any, idx: number) => ({
            itemSeq: it.itemSeq ?? idx + 1,
            itemCd: it.itemCd ?? null,
            itemClsCd: it.itemClsCd ?? null,
            itemNm: it.itemNm ?? null,
            bcd: it.bcd ?? null,
            pkgUnitCd: it.pkgUnitCd ?? null,
            pkg: it.pkg ?? null,
            qtyUnitCd: it.qtyUnitCd ?? null,
            qty: it.qty ?? 0,
            prc: it.prc ?? 0,
            splyAmt: it.splyAmt ?? 0,
            dcRt: it.dcRt ?? null,
            dcAmt: it.dcAmt ?? null,
            taxTyCd: it.taxTyCd ?? null,
            taxblAmt: it.taxblAmt ?? null,
            taxAmt: it.taxAmt ?? null,
            totAmt: it.totAmt ?? null,
          })),
        },
      },
      update: {
        // Do not clobber a purchase the operator has already actioned.
        rawResponse: p as Prisma.InputJsonValue,
        spplrNm: p.spplrNm ?? null,
      },
    });
    cached += 1;
  }

  await saveCursor(organizationId, runAt, `OK: ${cached} purchases`);
  return { ok: true, fetched: list.length, cached };
}

// ── §71: confirm / record a received purchase ────────────────

const A_D = ['A', 'B', 'C', 'D'] as const;
const TAX_RATES: Record<string, number> = { A: 0, B: 18, C: 0, D: 0 };

const QTY_UNIT_TO_MEASUREMENT: Record<string, string> = {
  U: 'PCS', KG: 'KG', LTR: 'LTR', MTR: 'MTR', BX: 'BOX', PR: 'PAIR', DZ: 'DOZEN', GRM: 'GRAM',
};

/** Per-line overrides sent when the operator confirms a purchase. */
export type PurchaseItemOverride = {
  itemId?: number;
  itemSeq?: number;
  /** Buyer's catalog name — sent to VSDC as `itemNm`; supplier name stays on `spplrItemNm`. */
  itemNm?: string;
  /** Existing local product to receive this line's stock. */
  linkProductId?: number;
};

type PurchaseLine = {
  id: number;
  itemSeq: number;
  itemCd: string | null;
  itemClsCd: string | null;
  itemNm: string | null;
  bcd: string | null;
  pkgUnitCd: string | null;
  qtyUnitCd: string | null;
  taxTyCd: string | null;
  prc: { toNumber: () => number };
};

type ResolvedProduct = { id: number; name: string; itemCd: string | null };

function overrideFor(it: PurchaseLine, items?: PurchaseItemOverride[]): PurchaseItemOverride | undefined {
  if (!items?.length) return undefined;
  return items.find((o) =>
    (o.itemId != null && o.itemId === it.id) || (o.itemSeq != null && o.itemSeq === it.itemSeq),
  );
}

function localNameFor(it: PurchaseLine, ov?: PurchaseItemOverride): string {
  const named = ov?.itemNm?.trim();
  return named || it.itemNm?.trim() || 'Item';
}

async function createProductFromPurchaseLine(
  organizationId: number,
  it: PurchaseLine,
  localNm: string,
): Promise<ResolvedProduct> {
  const pkgUnitCd = it.pkgUnitCd?.trim() || DEFAULT_PKG_UNIT_CD;
  const qtyUnitCd = it.qtyUnitCd?.trim() || 'U';
  const origin = await getOriginNationCode(organizationId);
  const taxTyCd = (it.taxTyCd ?? '').trim().toUpperCase();
  const types = await getTaxationTypes(organizationId);
  const cachedTax = types.find((t) => t.code.toUpperCase() === taxTyCd);
  const taxCode = (cachedTax?.code ?? (types.find((t) => t.rate === 0)?.code) ?? taxTyCd) as 'A' | 'B' | 'C' | 'D';
  if (!taxCode) {
    throw new Error('Cannot create a product from this purchase line: no taxation type on the line and none cached (class 04)');
  }
  const prc = Math.abs(it.prc.toNumber());
  const itemCd = origin
    ? await allocateItemCd(organizationId, 'PRODUCT', pkgUnitCd, qtyUnitCd, origin)
    : null;
  const product = await prisma.product.create({
    data: {
      name: localNm,
      organizationId,
      unitPrice: prc,
      purchasePrice: prc,
      quantity: 0,
      taxCode,
      taxCategory: TaxService.getTaxCategory(taxCode),
      measurementUnit: (QTY_UNIT_TO_MEASUREMENT[qtyUnitCd] ?? 'PCS') as 'PCS' | 'KG' | 'LTR' | 'MTR' | 'BOX' | 'PAIR' | 'DOZEN' | 'GRAM' | 'OTHER',
      itemType: 'PRODUCT',
      itemCd,
      itemClsCd: it.itemClsCd ?? null,
      pkgUnitCd,
      qtyUnitCd,
      barcode: it.bcd?.trim() || null,
      origin,
    },
    select: { id: true, name: true, itemCd: true },
  });
  if (it.itemClsCd) {
    const sync = await syncProductToRra(product.id);
    if (!sync.success) {
      logger.warn(`[EBM] new product #${product.id} from purchase confirm did not sync to RRA: ${sync.error}`);
    }
  }
  return product;
}

async function resolvePurchaseLineProduct(
  organizationId: number,
  it: PurchaseLine,
  ov?: PurchaseItemOverride,
): Promise<{ product: ResolvedProduct; localNm: string } | { error: string }> {
  const localNm = localNameFor(it, ov);
  const select = { id: true, name: true, itemCd: true } as const;
  let product: ResolvedProduct | null = null;

  if (ov?.linkProductId != null) {
    product = await prisma.product.findFirst({
      where: { id: ov.linkProductId, organizationId, deletedAt: null },
      select,
    });
    if (!product) return { error: `Linked product ${ov.linkProductId} was not found` };
  }

  if (!product && it.itemCd) {
    product = await prisma.product.findFirst({
      where: { organizationId, itemCd: it.itemCd, deletedAt: null },
      select,
    });
  }

  if (!product) {
    product = await prisma.product.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        isActive: true,
        name: { equals: localNm, mode: 'insensitive' },
      },
      select,
    });
  }

  if (!product) {
    product = await createProductFromPurchaseLine(organizationId, it, localNm);
  } else if (localNm !== product.name) {
    product = await prisma.product.update({
      where: { id: product.id },
      data: { name: localNm },
      select,
    });
  }

  return { product, localNm };
}

export async function confirmRraPurchase(
  organizationId: number,
  rraPurchaseId: number,
  opts: {
    branchId?: number | null;
    userId?: number;
    reject?: boolean;
    prcOrdCd?: string;
    items?: PurchaseItemOverride[];
  } = {},
): Promise<{ success: boolean; error?: string }> {
  const rp = await prisma.rraPurchase.findFirst({
    where: { id: rraPurchaseId, organizationId },
    include: { items: { orderBy: { itemSeq: 'asc' } } },
  });
  if (!rp) return { success: false, error: 'Purchase not found' };
  if (rp.status !== 'PENDING') return { success: false, error: `Purchase already ${rp.status.toLowerCase()}` };

  if (opts.reject) {
    await prisma.rraPurchase.update({ where: { id: rraPurchaseId }, data: { status: 'REJECTED' } });
    return { success: true };
  }

  if (!isEbmEnabled()) return { success: false, error: 'EBM is not enabled' };

  const envelope = await buildVsdcEnvelope(organizationId, opts.branchId ?? null);
  const envErr = validateVsdcEnvelope(envelope);
  if (envErr) return { success: false, error: envErr };

  const user = opts.userId
    ? await prisma.user.findUnique({ where: { id: opts.userId }, select: { id: true, name: true } })
    : null;
  const regr = { id: String(user?.id ?? 'system'), name: user?.name ?? 'System' };

  const taxblByBand: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const taxByBand: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

  const resolved: Array<{ product: ResolvedProduct; localNm: string }> = [];
  for (const it of rp.items) {
    const mapped = await resolvePurchaseLineProduct(organizationId, it, overrideFor(it, opts.items));
    if ('error' in mapped) return { success: false, error: mapped.error };
    resolved.push(mapped);
  }

  const itemList = rp.items.map((it, idx) => {
    const band = (it.taxTyCd ?? '').toUpperCase();
    const slot = A_D.includes(band as any) ? band : 'A';
    const qty = Math.abs(it.qty.toNumber());
    const prc = Math.abs(it.prc.toNumber());
    const splyAmt = fix2(it.splyAmt != null ? Math.abs(it.splyAmt.toNumber()) : qty * prc);
    const taxAmt = it.taxAmt != null ? Math.abs(it.taxAmt.toNumber()) : 0;
    // RRA TrnsPurchaseSaveReq sample (§3.3.7.2): tax-inclusive — taxblAmt == splyAmt == totAmt
    // with taxAmt extracted inside the gross (e.g. totTaxblAmt=10500, totTaxAmt=1890, totAmt=10500).
    const lineTot = it.totAmt != null ? Math.abs(it.totAmt.toNumber()) : splyAmt;
    const taxblAmt = fix2(lineTot);
    taxblByBand[slot] = fix2(taxblByBand[slot] + taxblAmt);
    taxByBand[slot] = fix2(taxByBand[slot] + taxAmt);
    const local = resolved[idx];
    // `itemNm` / `itemCd` are the buyer's catalog values; `spplr*` keep the
    // supplier's original name and code from the pulled sale.
    return {
      itemSeq: it.itemSeq ?? idx + 1,
      itemCd: local.product.itemCd ?? it.itemCd ?? undefined,
      itemClsCd: it.itemClsCd ?? undefined,
      itemNm: local.localNm,
      bcd: it.bcd ?? undefined,
      spplrItemClsCd: it.itemClsCd ?? undefined,
      spplrItemCd: it.itemCd ?? undefined,
      spplrItemNm: it.itemNm ?? undefined,
      pkgUnitCd: it.pkgUnitCd ?? 'CT',
      pkg: it.pkg != null ? it.pkg.toNumber() : qty,
      qtyUnitCd: it.qtyUnitCd ?? 'U',
      qty,
      prc,
      splyAmt: taxblAmt,
      dcRt: it.dcRt != null ? it.dcRt.toNumber() : 0,
      dcAmt: it.dcAmt != null ? it.dcAmt.toNumber() : 0,
      taxblAmt,
      taxTyCd: slot,
      taxAmt,
      totAmt: taxblAmt,
      itemExprDt: null,
    };
  });

  const totTaxblAmt = fix2(A_D.reduce((s, b) => s + taxblByBand[b], 0));
  const totTaxAmt = fix2(A_D.reduce((s, b) => s + taxByBand[b], 0));
  // Spec sample: totAmt equals totTaxblAmt (do NOT add totTaxAmt).
  const totAmt = totTaxblAmt;
  const now = new Date();

  // The pull side (syncRraPurchases above) caches rcptTyCd straight from RRA's
  // *Sales* Receipt Type code list (S=Sale, R=Refund after Sale) — that's the
  // vocabulary `/trnsPurchase/selectTrnsPurchaseSales` returns, since it's the
  // supplier's own sale record. `/trnsPurchase/savePurchases` validates this
  // field against the distinct *Purchase* Receipt Type list (P=Purchase,
  // R=Refund after Purchase) instead; forwarding the sales code unmapped gets
  // rejected with `resultCd 913: Code value error ... [<rcptTyCd>]`.
  const PURCHASE_RCPT_TY_CD_BY_SALES_RCPT_TY_CD: Record<string, string> = { S: 'P', R: 'R' };
  const rcptTyCd = PURCHASE_RCPT_TY_CD_BY_SALES_RCPT_TY_CD[(rp.rcptTyCd ?? '').toUpperCase()] ?? 'P';

  const payload: Record<string, unknown> = {
    invcNo: Number(rp.spplrInvcNo),
    orgInvcNo: 0,
    spplrTin: rp.spplrTin,
    spplrBhfId: rp.spplrBhfId ?? '00',
    spplrNm: rp.spplrNm ?? '',
    spplrInvcNo: Number(rp.spplrInvcNo),
    regTyCd: 'M',
    pchsTyCd: 'N',
    // §38: the RRA purchase order code for this incoming purchase, when the
    // operator provides one (the select-purchases pull does not return it).
    ...((opts.prcOrdCd?.trim() || (rp as { prcOrdCd?: string }).prcOrdCd || (rp.rawResponse as { prcOrdCd?: string } | null)?.prcOrdCd)
      ? { prcOrdCd: (opts.prcOrdCd?.trim() || (rp as { prcOrdCd?: string }).prcOrdCd || (rp.rawResponse as { prcOrdCd?: string }).prcOrdCd || '').trim() }
      : {}),
    rcptTyCd,
    pmtTyCd: rp.pmtTyCd ?? '01',
    pchsSttsCd: '02', // §4.x — 02 Approved (records the purchase + stock-in)
    cfmDt: toRraDateTime(now),
    pchsDt: toRraDate(now),
    wrhsDt: toRraDateTime(now),
    totItemCnt: itemList.length,
    taxblAmtA: taxblByBand.A, taxblAmtB: taxblByBand.B, taxblAmtC: taxblByBand.C, taxblAmtD: taxblByBand.D,
    taxRtA: TAX_RATES.A, taxRtB: TAX_RATES.B, taxRtC: TAX_RATES.C, taxRtD: TAX_RATES.D,
    taxAmtA: taxByBand.A, taxAmtB: taxByBand.B, taxAmtC: taxByBand.C, taxAmtD: taxByBand.D,
    totTaxblAmt,
    totTaxAmt,
    totAmt,
    remark: rp.remark ?? '',
    regrId: regr.id,
    regrNm: regr.name,
    modrId: regr.id,
    modrNm: regr.name,
    itemList,
  };

  try {
    const res = await savePurchase(envelope, payload);
    if (!res.success) {
      return { success: false, error: res.error ?? 'savePurchases failed' };
    }

    await prisma.rraPurchase.update({
      where: { id: rraPurchaseId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    // §74: a confirmed purchase must affect local stock in real time. RRA has
    // already booked the stock-in from /trnsPurchase/savePurchases (pchsSttsCd
    // 02), so these ledger rows are written with skipEbmSync — re-sending them
    // via /stock/saveStockItems would double-count the same receipt at the VSDC.
    // receiveStockOnBranch also upserts the branch batch POS/inventory read.
    const stockBranchId = await resolveActiveBranchId(organizationId, opts.branchId);
    let stockBooked = 0;
    if (stockBranchId != null) {
      for (let i = 0; i < rp.items.length; i++) {
        const it = rp.items[i];
        const qty = Math.round(Math.abs(it.qty.toNumber()));
        if (qty <= 0) continue;
        const reference = `RRA-PURCHASE-${rp.spplrTin}-${rp.spplrInvcNo}`;
        await receiveStockOnBranch({
          organizationId,
          productId: resolved[i].product.id,
          userId: opts.userId ?? 0,
          quantity: qty,
          movementType: 'PURCHASE',
          branchId: stockBranchId,
          unitCost: Math.abs(it.prc.toNumber()),
          reference,
          referenceType: 'RRA_PURCHASE',
          batchNumber: reference,
          note: `Confirmed RRA purchase from ${rp.spplrNm ?? rp.spplrTin}`,
          skipEbmSync: true,
        });
        stockBooked += 1;
      }
    } else {
      logger.warn(`[EBM] confirm RRA purchase #${rraPurchaseId}: no active branch — local stock not booked`);
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { lastSuccessfulVdsContact: new Date() },
    });
    logger.info(`[EBM] confirmed RRA purchase #${rraPurchaseId} — ${stockBooked} item(s) booked into branch ${stockBranchId ?? '-'} stock`);
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Purchase confirmation failed';
    logger.error(`[EBM] confirm RRA purchase #${rraPurchaseId} failed`, e);
    return { success: false, error: message };
  }
}
