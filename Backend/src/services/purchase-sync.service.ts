import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { isEbmEnabled, fix2, toRraDate, toRraDateTime } from './rra-ebm.service';
import { buildVsdcEnvelope, selectPurchases, savePurchase, validateVsdcEnvelope, toRraReqDt } from './vsdc-api.service';
import { DEFAULT_ITEM_CLASSIFICATION_CD } from './item-code.service';
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

export async function confirmRraPurchase(
  organizationId: number,
  rraPurchaseId: number,
  opts: { branchId?: number | null; userId?: number; reject?: boolean; prcOrdCd?: string } = {},
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

  const itemList = rp.items.map((it, idx) => {
    const band = (it.taxTyCd ?? 'B').toUpperCase();
    const slot = A_D.includes(band as any) ? band : 'B';
    const qty = Math.abs(it.qty.toNumber());
    const prc = Math.abs(it.prc.toNumber());
    const splyAmt = fix2(qty * prc);
    const taxAmt = it.taxAmt != null ? Math.abs(it.taxAmt.toNumber()) : 0;
    const taxblAmt = it.taxblAmt != null ? Math.abs(it.taxblAmt.toNumber()) : fix2(splyAmt - taxAmt);
    taxblByBand[slot] = fix2(taxblByBand[slot] + taxblAmt);
    taxByBand[slot] = fix2(taxByBand[slot] + taxAmt);
    return {
      itemSeq: it.itemSeq ?? idx + 1,
      itemCd: it.itemCd ?? undefined,
      itemClsCd: it.itemClsCd ?? DEFAULT_ITEM_CLASSIFICATION_CD,
      itemNm: it.itemNm ?? 'Item',
      bcd: it.bcd ?? undefined,
      spplrItemCd: it.itemCd ?? undefined,
      spplrItemNm: it.itemNm ?? undefined,
      pkgUnitCd: it.pkgUnitCd ?? 'CT',
      pkg: it.pkg != null ? it.pkg.toNumber() : qty,
      qtyUnitCd: it.qtyUnitCd ?? 'U',
      qty,
      prc,
      splyAmt,
      dcRt: it.dcRt != null ? it.dcRt.toNumber() : 0,
      dcAmt: it.dcAmt != null ? it.dcAmt.toNumber() : 0,
      taxblAmt,
      taxTyCd: slot,
      taxAmt,
      totAmt: splyAmt,
    };
  });

  const totTaxblAmt = fix2(A_D.reduce((s, b) => s + taxblByBand[b], 0));
  const totTaxAmt = fix2(A_D.reduce((s, b) => s + taxByBand[b], 0));
  const totAmt = fix2(totTaxblAmt + totTaxAmt);
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
    ...(opts.prcOrdCd?.trim() ? { prcOrdCd: opts.prcOrdCd.trim() } : {}),
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
    await prisma.$transaction([
      prisma.rraPurchase.update({
        where: { id: rraPurchaseId },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      }),
      prisma.organization.update({
        where: { id: organizationId },
        data: { lastSuccessfulVdsContact: new Date() },
      }),
    ]);
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Purchase confirmation failed';
    logger.error(`[EBM] confirm RRA purchase #${rraPurchaseId} failed`, e);
    return { success: false, error: message };
  }
}
