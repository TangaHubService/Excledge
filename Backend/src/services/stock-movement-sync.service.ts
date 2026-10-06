import { prisma } from '../lib/prisma';
import type { InventoryMovementType, InventoryDirection } from '@prisma/client';
import { isEbmEnabled, fix2, toRraDate } from './rra-ebm.service';
import { buildVsdcEnvelope, saveStockItems, saveStockMaster, validateVsdcEnvelope } from './vsdc-api.service';
import { getCurrentStock } from './inventory-ledger.service';
import { getTaxRateForCode } from './rra-code.service';
import logger from '../utils/logger';

/**
 * RRA Stock In/Out + Stock Master sync (RRA VSDC v1.0.5, S8).
 *
 * Every inventory movement — including SALE (sarTyCd 11, positive qty) — is
 * reported via /stock/saveStockItems, then the remaining quantity via
 * /stockMaster/saveStockMaster. saveSales is the sales transaction; it never
 * replaces the stock movement API. Order per sale: invoice ack first, then
 * stock in/out, then stock master (gated below).
 */

/** VSDC §4.19 Stock In/Out (`sarTyCd`) — mapped from our movement type + direction. */
export function sarTyCdFor(
  movementType: InventoryMovementType,
  direction: InventoryDirection,
  referenceType?: string | null,
): string | null {
  if (direction === 'IN') {
    // An approved import declaration books its stock-in as an Import (01),
    // not a Purchase (02) — see rra-import.service.ts.
    if (referenceType === 'RRA_IMPORT') return '01';
    switch (movementType) {
      case 'PURCHASE':          return '02'; // Purchase
      case 'RETURN_CUSTOMER':   return '03'; // Return
      case 'TRANSFER_IN':       return '04'; // Stock Movement
      case 'PRODUCTION_OUTPUT': return '05'; // Processing (finished goods)
      case 'INITIAL_STOCK':
      case 'ADJUSTMENT_IN':
      case 'ADJUSTMENT':
      case 'CORRECTION':        return '06'; // Adjustment (incremental)
      default:                  return '06';
    }
  }
  switch (movementType) {
    case 'SALE':          return '11';  // Sale / Outgoing (after saveSales ack — S8)
    case 'TRANSFER_OUT':  return '13';  // Stock Movement
    case 'PRODUCTION_CONSUME': return '14'; // Processing (raw materials)
    case 'DAMAGE':
    case 'EXPIRED':       return '15';  // Discarding
    case 'ADJUSTMENT_OUT':
    case 'ADJUSTMENT':
    case 'CORRECTION':    return '16';  // Adjustment (decremental)
    default:              return '16';
  }
}

/** Whether an inventory movement needs to be reported to RRA as a stock adjustment. */
export function stockMovementNeedsEbm(movementType: InventoryMovementType): boolean {
  return true;
}

async function allocateSarNo(organizationId: number): Promise<number> {
  const row = await prisma.inventoryLedger.aggregate({
    where: { organizationId, ebmSarNo: { not: null } },
    _max: { ebmSarNo: true },
  });
  return (row._max.ebmSarNo ?? 0) + 1;
}

/**
 * Submit one InventoryLedger entry to RRA (/stock/saveStockItems) and then
 * push the item's new remaining quantity (/stockMaster/saveStockMaster).
 * Idempotent: a row already SYNCED is skipped; a persisted `ebmSarNo` is reused
 * on retry so RRA does not reject a duplicate SAR number.
 */
export async function submitStockLedgerEntryToEbm(ledgerId: number): Promise<{ success: boolean; error?: string }> {
  if (!isEbmEnabled()) return { success: true };

  const entry = await prisma.inventoryLedger.findUnique({
    where: { id: ledgerId },
    include: {
      product: { select: { id: true, name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true, barcode: true, taxCode: true, unitPrice: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!entry) return { success: false, error: 'Ledger entry not found' };
  if (entry.ebmSyncStatus === 'SYNCED') return { success: true };

  if (!stockMovementNeedsEbm(entry.movementType)) {
    await prisma.inventoryLedger.update({ where: { id: ledgerId }, data: { ebmSyncStatus: null } });
    return { success: true };
  }

  const sarTyCd = sarTyCdFor(entry.movementType, entry.direction, entry.referenceType);
  if (!sarTyCd) {
    await prisma.inventoryLedger.update({ where: { id: ledgerId }, data: { ebmSyncStatus: null } });
    return { success: true };
  }

  // S8 order: a SALE stock-out (11) must never be sent before its sales
  // invoice. Defer (leave PENDING, no FAILED) until the linked sale's invoice
  // is fiscalized. Linkage: ledger reference = saleNumber.
  if (entry.movementType === 'SALE' && entry.reference) {
    const linkedSale = await prisma.sale.findFirst({
      where: { saleNumber: entry.reference, organizationId: entry.organizationId },
      select: { id: true },
    });
    if (linkedSale) {
      const invoiced = await prisma.ebmTransaction.findFirst({
        where: { saleId: linkedSale.id, operation: 'SALE', submissionStatus: 'SUCCESS', ebmInvoiceNumber: { not: null } },
        select: { id: true },
      });
      if (!invoiced) {
        return { success: false, error: 'Original invoice not yet fiscalized — deferring stock 11' };
      }
    }
  }

  const product = entry.product;
  if (!product?.itemCd) {
    await prisma.inventoryLedger.update({
      where: { id: ledgerId },
      data: { ebmSyncStatus: 'FAILED', ebmError: 'Product has no itemCd — register it with RRA first' },
    });
    return { success: false, error: 'Product has no itemCd' };
  }
  if (!product.itemClsCd?.trim()) {
    await prisma.inventoryLedger.update({
      where: { id: ledgerId },
      data: { ebmSyncStatus: 'FAILED', ebmError: 'Product has no itemClsCd — select an RRA item classification first' },
    });
    return { success: false, error: 'Product has no itemClsCd' };
  }

  const envelope = await buildVsdcEnvelope(entry.organizationId, entry.branchId);
  const envErr = validateVsdcEnvelope(envelope);
  if (envErr) {
    await prisma.inventoryLedger.update({ where: { id: ledgerId }, data: { ebmSyncStatus: 'FAILED', ebmError: envErr } });
    return { success: false, error: envErr };
  }

  const qty = Math.abs(Number(entry.quantity));
  const prc = entry.unitCost != null ? Math.abs(entry.unitCost.toNumber()) : Math.abs(product.unitPrice.toNumber());
  const splyAmt = fix2(qty * prc);
  const taxTyCd = product.taxCode?.trim().toUpperCase() || '';
  if (!taxTyCd) {
    await prisma.inventoryLedger.update({
      where: { id: ledgerId },
      data: { ebmSyncStatus: 'FAILED', ebmError: 'Product has no taxCode — pick a taxation type from RRA codes (class 04)' },
    });
    return { success: false, error: 'Product has no taxCode' };
  }
  const rate = await getTaxRateForCode(entry.organizationId, taxTyCd);
  const taxAmt = sarTyCd === '02' && rate > 0 ? fix2(splyAmt - splyAmt / (1 + rate / 100)) : 0;
  const taxblAmt = fix2(splyAmt - taxAmt);

  const sarNo = entry.ebmSarNo ?? (await allocateSarNo(entry.organizationId));
  // orgSarNo: original SAR number for refund/return rows (new sarNo + link to
  // the original 11). Resolved from the original SALE ledger row for the same
  // product/branch; NULL when there is no original (never assume 0 — the
  // numbering rule awaits VSDC provider confirmation).
  let orgSarNo: number | null = (entry as any).ebmOrgSarNo ?? null;
  if (orgSarNo == null && entry.movementType === 'RETURN_CUSTOMER') {
    const meta = (entry as any).metadata as { originalSaleNumber?: string } | null;
    const originalRef = meta?.originalSaleNumber
      ?? (entry.referenceType === 'SALE_REFUND' || entry.referenceType === 'SALE_CANCELLATION' ? undefined : undefined);
    if (originalRef) {
      const orig = await prisma.inventoryLedger.findFirst({
        where: {
          organizationId: entry.organizationId,
          productId: product.id,
          branchId: entry.branchId,
          movementType: 'SALE',
          reference: originalRef,
          ebmSarNo: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        select: { ebmSarNo: true },
      });
      if (orig?.ebmSarNo != null) {
        orgSarNo = orig.ebmSarNo;
        await prisma.inventoryLedger.update({ where: { id: ledgerId }, data: { ebmOrgSarNo: orgSarNo } as any });
      }
    }
  }
  const regr = { id: String(entry.user?.id ?? 'system'), name: entry.user?.name ?? 'System' };
  const now = entry.createdAt;

  const payload = {
    sarNo,
    orgSarNo,
    regTyCd: 'M', // Manual
    // StockIOSaveReq sample uses null customer fields for non-transfer movements.
    // Only inter-branch transfers should populate the counterparty TIN/bhfId.
    custTin: null as string | null,
    custNm: null as string | null,
    custBhfId: null as string | null,
    sarTyCd,
    ocrnDt: toRraDate(now),
    totItemCnt: 1,
    totTaxblAmt: taxblAmt,
    totTaxAmt: taxAmt,
    totAmt: splyAmt,
    remark: entry.note ?? entry.movementType,
    regrId: regr.id,
    regrNm: regr.name,
    modrId: regr.id,
    modrNm: regr.name,
    itemList: [
      {
        itemSeq: 1,
        itemCd: product.itemCd,
        itemClsCd: product.itemClsCd,
        itemNm: product.name,
        bcd: product.barcode ?? null,
        pkgUnitCd: product.pkgUnitCd ?? 'CT',
        pkg: qty,
        qtyUnitCd: product.qtyUnitCd ?? 'U',
        qty,
        itemExprDt: null,
        prc,
        splyAmt,
        totDcAmt: 0,
        taxblAmt,
        taxTyCd,
        taxAmt,
        totAmt: splyAmt,
      },
    ],
  };

  try {
    // S14: header totals must equal the sums of the item lines (single-item
    // payload today — validated explicitly so a future multi-line change fails
    // loudly instead of sending inconsistent totals).
    const lineSums = (payload.itemList as Array<{ taxblAmt: number; taxAmt: number; totAmt: number }>)
      .reduce((a, l) => ({ taxbl: a.taxbl + l.taxblAmt, tax: a.tax + l.taxAmt, tot: a.tot + l.totAmt }), { taxbl: 0, tax: 0, tot: 0 });
    if (
      payload.totItemCnt !== (payload.itemList as unknown[]).length ||
      Math.abs(payload.totTaxblAmt as number - lineSums.taxbl) > 0.005 ||
      Math.abs(payload.totTaxAmt as number - lineSums.tax) > 0.005 ||
      Math.abs(payload.totAmt as number - lineSums.tot) > 0.005
    ) {
      await prisma.inventoryLedger.update({
        where: { id: ledgerId },
        data: { ebmSyncStatus: 'FAILED', ebmError: 'Stock payload header/line totals mismatch' },
      });
      return { success: false, error: 'Stock payload header/line totals mismatch' };
    }
    await prisma.inventoryLedger.update({
      where: { id: ledgerId },
      data: { ebmSyncStatus: 'PENDING', ebmSarNo: sarNo, ebmError: null },
    });

    const io = await saveStockItems(envelope, payload);
    if (!io.success) {
      await prisma.inventoryLedger.update({
        where: { id: ledgerId },
        data: { ebmSyncStatus: 'FAILED', ebmError: io.error ?? 'saveStockItems failed' },
      });
      return { success: false, error: io.error };
    }

    // §73 — push the item's new on-hand quantity to the stock master.
    const onHand = await getCurrentStock(entry.organizationId, product.id, entry.branchId);
    const master = await saveStockMaster(envelope, product.itemCd, onHand, regr);
    if (!master.success) {
      // The IO record went through; flag the master push for retry but do not lose the IO.
      await prisma.inventoryLedger.update({
        where: { id: ledgerId },
        data: { ebmSyncStatus: 'FAILED', ebmError: `stock master push failed: ${master.error}` },
      });
      return { success: false, error: master.error };
    }

    await prisma.$transaction([
      prisma.inventoryLedger.update({
        where: { id: ledgerId },
        data: { ebmSyncStatus: 'SYNCED', ebmSyncedAt: new Date(), ebmError: null },
      }),
      prisma.organization.update({
        where: { id: entry.organizationId },
        data: { lastSuccessfulVdsContact: new Date() },
      }),
    ]);
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Stock sync error';
    await prisma.inventoryLedger.update({
      where: { id: ledgerId },
      data: { ebmSyncStatus: 'FAILED', ebmError: message },
    });
    return { success: false, error: message };
  }
}

/** Fire-and-forget wrapper — called from the write paths that create a ledger row. */
export function submitStockLedgerEntryToEbmAsync(ledgerId: number): void {
  submitStockLedgerEntryToEbm(ledgerId).catch((err) =>
    logger.error(`[EBM] stock ledger #${ledgerId} sync failed`, err),
  );
}

/** Process PENDING/FAILED stock ledger rows in batch (cron job). */
export async function processStockSyncBatch(limit = 25): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (!isEbmEnabled()) return { processed: 0, succeeded: 0, failed: 0 };

  const rows = await prisma.inventoryLedger.findMany({
    where: { ebmSyncStatus: { in: ['PENDING', 'FAILED'] } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await submitStockLedgerEntryToEbm(row.id);
    if (r.success) succeeded += 1;
    else failed += 1;
  }
  return { processed: rows.length, succeeded, failed };
}

/**
 * Mark every not-yet-synced ledger row for this org PENDING so the
 * next batch picks them up. Used by the "sync stock now" endpoint.
 */
export async function queuePendingStockForOrg(organizationId: number): Promise<number> {
  const res = await prisma.inventoryLedger.updateMany({
    where: {
      organizationId,
      OR: [{ ebmSyncStatus: null }, { ebmSyncStatus: 'FAILED' }],
    },
    data: { ebmSyncStatus: 'PENDING' },
  });
  return res.count;
}
