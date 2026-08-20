import { prisma } from '../lib/prisma';
import { config } from '../config';
import {
  type SaleWithRelations,
  buildRraSendReceiptPayload,
  generateInvoiceNumber,
  consumeAnyOrgPurchaseCode,
  isEbmEnabled,
  gatewayErrorMessage,
} from './rra-ebm.service';
import {
  buildVsdcEnvelope,
  saveInvc,
  parseVsdcResponse,
  vsdcHeartbeat,
} from './vsdc-api.service';
import { buildElectronicJournal } from './electronic-journal.service';
import logger from '../utils/logger';

export { isEbmEnabled };
import { TaxService } from './tax.service';
import { getCurrentStockInTransaction, removeStock } from './inventory-ledger.service';
import type { Decimal } from '@prisma/client/runtime/library';
import type {
  EbmOperation,
  SalePaymentType,
  RraTaxCode,
  MeasurementUnit,
} from '@prisma/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SaleOutboxInput {
  organizationId: number;
  branchId: number;
  userId: number;
  customerId: number;
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
    measurementUnit: MeasurementUnit;
    exemptionReference?: string | null;
  }>;
  paymentType: SalePaymentType;
  cashAmount: number;
  insuranceAmount: number;
  debtAmount: number;
  shiftId?: number;
}

type OutboxPayloadV1 = {
  version: 1;
  saleId: number;
  organizationId: number;
  operation: EbmOperation;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function generateIdempotencyKey(orgId: number, operation: EbmOperation, saleId: number): string {
  return `ebm-${operation}-${orgId}-${saleId}`;
}

// ──────────────────────────────────────────────
// Module 2: Atomic Checkout with Transactional Outbox
// ──────────────────────────────────────────────

/**
 * Create a sale and write an EBM outbox entry in a single atomic transaction.
 *
 * Guarantees:
 *  - Inventory deduction, balance update, and outbox write are ACID.
 *  - Idempotency key is unique at the DB level, preventing double-submission
 *    even if the outbox worker crashes and restarts.
 *  - Sale is always completed; VSDC submission is async via the outbox.
 */
export async function createSaleWithOutbox(input: SaleOutboxInput) {
  const {
    organizationId, branchId, userId, customerId,
    items, paymentType, cashAmount, insuranceAmount, debtAmount, shiftId,
  } = input;

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const saleNumber = `SALE-${Date.now()}`;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { vatRegistered: true },
  });
  const vatRegistered = org?.vatRegistered ?? false;

  const operation: EbmOperation = 'SALE';

  const sale = await prisma.$transaction(async (tx) => {
    // 1. Validate stock with row-level locking
    for (const item of items) {
      const [locked] = await tx.$queryRaw<Array<{ id: number; name: string }>>`
        SELECT id, name FROM products
        WHERE id = ${item.productId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (!locked) {
        throw new Error(`Product ID ${item.productId} not found`);
      }

      const stock = await getCurrentStockInTransaction(tx, organizationId, item.productId, branchId);
      if (stock < item.quantity) {
        const prod = await tx.product.findUnique({ where: { id: item.productId }, select: { name: true } });
        throw new Error(`Insufficient stock for ${prod?.name ?? `#${item.productId}`}. Available: ${stock}, requested: ${item.quantity}`);
      }
    }

    // 2. Calculate tax (forced to code D for non-VAT-registered taxpayers)
    const taxSummary = await TaxService.calculateSaleTax(
      organizationId,
      items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      vatRegistered,
    );

    // 3. Create sale + items
    const saleItemsData = items.map((item, idx) => {
      const t = taxSummary.items[idx];
      return {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        costPrice: 0,
        profit: 0,
        taxRate: t.taxRate,
        taxAmount: t.taxAmount,
        taxCode: t.taxCode,
        measurementUnit: item.measurementUnit,
        exemptionReference: item.exemptionReference ?? null,
        product: { connect: { id: item.productId } },
      };
    });

    // Allocate the RRA invoice sequence inside the transaction so a rollback
    // (bad stock, tax mismatch, etc.) also rolls back the sequence increment.
    const { invoiceNumber, vsdcInvcNo } = await generateInvoiceNumber(organizationId, branchId, tx);

    const newSale = await tx.sale.create({
      data: {
        saleNumber,
        invoiceNumber,
        vsdcInvcNo,
        customerId,
        userId,
        organizationId,
        branchId,
        paymentType,
        cashAmount,
        insuranceAmount,
        debtAmount,
        shiftId,
        totalAmount,
        vatAmount: taxSummary.vatAmount,
        taxableAmount: taxSummary.taxableAmount,
        status: 'COMPLETED',
        saleItems: { create: saleItemsData as any },
      },
      include: {
        saleItems: { include: { product: true } },
        customer: true,
      },
    });

    // 4. Deduct inventory (ledger entries)
    for (const item of items) {
      await removeStock({
        organizationId,
        productId: item.productId,
        userId,
        quantity: item.quantity,
        movementType: 'SALE',
        branchId,
        reference: saleNumber,
        referenceType: 'SALE',
        note: `Sale #${saleNumber}`,
        tx,
      });
    }

    // 5. Update customer balance for debt
    const remainingDebt = totalAmount - cashAmount - insuranceAmount;
    if (remainingDebt > 0) {
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { increment: remainingDebt } },
      });
    }

    // 6. Write transactional outbox (atomic with the sale)
    const outboxPayload: OutboxPayloadV1 = {
      version: 1,
      saleId: newSale.id,
      organizationId,
      operation,
    };

    await tx.ebmOutbox.create({
      data: {
        organizationId,
        saleId: newSale.id,
        operation,
        idempotencyKey: generateIdempotencyKey(organizationId, operation, newSale.id),
        payload: outboxPayload as any,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
    });

    return newSale;
  }, {
    maxWait: 30_000,
    timeout: 60_000,
  });

  return sale;
}

// ──────────────────────────────────────────────
// payDebt — now inside a transaction
// ──────────────────────────────────────────────

export async function payDebtWithTransaction(
  saleId: number,
  organizationId: number,
  amount: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, organizationId },
      select: { id: true, debtAmount: true, customerId: true, status: true },
    });

    if (!sale) throw new Error('Sale not found');
    if (sale.status === 'REFUNDED' || sale.status === 'CANCELLED') {
      throw new Error(`Cannot process payment for ${sale.status.toLowerCase()} sale`);
    }

    const currentDebt = Number(sale.debtAmount);
    if (amount > currentDebt) {
      throw new Error('Payment amount exceeds remaining debt');
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        debtAmount: { decrement: amount },
        cashAmount: { increment: amount },
      },
    });

    await tx.customer.update({
      where: { id: sale.customerId },
      data: { balance: { decrement: amount } },
    });
  });
}

// ──────────────────────────────────────────────
// Module 4: Resilient Outbox Worker & Reconciler
// ──────────────────────────────────────────────

/**
 * Resolve an orphan outbox entry stuck in PROCESSING state.
 * Queries the VSDC status endpoint; marks SUCCEEDED if already fiscalized.
 */
async function resolveOrphanedSubmission(outboxEntry: {
  id: number;
  idempotencyKey: string;
  organizationId: number;
}): Promise<'SUCCEEDED' | 'FAILED' | 'RETRY'> {
  const statusPath = config.ebm.statusCheckPath;
  if (!statusPath) return 'RETRY';

  try {
    const envelope = await buildVsdcEnvelope(outboxEntry.organizationId);
    const result = await vsdcHeartbeat(envelope);
    if (result.success && result.data) {
      const normalized = parseVsdcResponse(result.rawBody);
      if (normalized.rcptNo) {
        await prisma.ebmOutbox.update({
          where: { id: outboxEntry.id },
          data: {
            status: 'SUCCEEDED',
            sdcDateTime: normalized.sdcDateTime ? new Date(normalized.sdcDateTime) : null,
            lastError: null,
          },
        });
        return 'SUCCEEDED';
      }
    }
    return 'FAILED';
  } catch {
    return 'RETRY';
  }
}

/**
 * Process pending EBM outbox entries in batch.
 *
 * 1. Orphan reconciliaition: entries in PROCESSING are probed via status endpoint.
 * 2. Idempotent dispatch: every VSDC payload carries the idempotencyKey.
 * 3. Cursor persistence: on success, saves sdcDateTime and updates organization sync state.
 */
export async function processEbmOutboxBatch(limit = 25): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (!isEbmEnabled()) {
    logger.info('[EBM-OUTBOX] processEbmOutboxBatch skipped: EBM disabled');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // A VSDC call can take up to the configured request timeout. Do not let the
  // cron job (or another checkout) reclaim a row that is still being sent by a
  // live worker. Only genuinely stale PROCESSING rows are reconciled.
  const staleProcessingBefore = new Date(
    Date.now() - Math.max(config.ebm.requestTimeoutMs * 2, 60_000),
  );
  const rows = await prisma.ebmOutbox.findMany({
    where: {
      nextAttemptAt: { lte: new Date() },
      retryCount: { lt: config.ebm.maxQueueRetries },
      OR: [
        { status: { in: ['PENDING', 'FAILED'] } },
        { status: 'PROCESSING', updatedAt: { lte: staleProcessingBefore } },
      ],
    },
    orderBy: [{ retryCount: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  logger.info(`[EBM-OUTBOX] processEbmOutboxBatch: fetched ${rows.length} due row(s) (limit=${limit})`);

  for (const row of rows) {
    // Claim the row before building its payload or calling VSDC. The previous
    // implementation selected then updated it, allowing simultaneous requests
    // from the immediate checkout worker and the cron worker to both submit the
    // same fiscal receipt. `updatedAt` makes this conditional update a lease for
    // stale PROCESSING rows as well.
    const claim = await prisma.ebmOutbox.updateMany({
      where: { id: row.id, status: row.status, updatedAt: row.updatedAt },
      data: { status: 'PROCESSING' },
    });
    if (claim.count !== 1) {
      logger.warn(`[EBM-OUTBOX] row ${row.id} (op=${row.operation}) not claimed (concurrent worker) — skipping`);
      continue;
    }

    processed += 1;
    logger.info(`[EBM-OUTBOX] row ${row.id} (op=${row.operation}, saleId=${row.saleId}, org=${row.organizationId}) claimed — processing (status=${row.status}, retry=${row.retryCount})`);

    // ── Orphan reconciliaition ──
    if (row.status === 'PROCESSING') {
      const resolution = await resolveOrphanedSubmission(row);
      if (resolution === 'SUCCEEDED') {
        succeeded += 1;
        continue;
      }
      if (resolution === 'RETRY') {
        continue; // leave for next cycle
      }
      // resolution === 'FAILED' — fall through to re-submit below
    }

    // ── Reload sale & build payload ──
    const sale = (await prisma.sale.findFirst({
      where: { id: row.saleId, organizationId: row.organizationId },
      include: {
        saleItems: {
          include: {
            product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true } },
          },
        },
        customer: true,
        branch: true,
        user: { select: { id: true, name: true } },
      },
    })) as (SaleWithRelations & { originalSaleId?: number | null }) | null;

    if (!sale) {
      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: 'Sale not found' },
      });
      logger.error(`[EBM-OUTBOX] row ${row.id}: sale ${row.saleId} not found — DEAD_LETTER`);
      failed += 1;
      continue;
    }

    logger.info(`[EBM-OUTBOX] row ${row.id}: sale ${sale.id} loaded (invoice=${sale.invoiceNumber}, vsdcInvcNo=${sale.vsdcInvcNo ?? 'N/A'}, custTin=${sale.customer?.TIN ?? 'N/A'}, cust prcOrdCd=${sale.customer?.prcOrdCd ?? 'N/A'}, sale prcOrdCd=${sale.prcOrdCd ?? 'N/A'})`);

    // For SALE operations only: skip if the sale was voided/refunded before we submitted it.
    // For REFUND/VOID operations the sale status is *expected* to be REFUNDED/CANCELLED.
    if (row.operation === 'SALE' && (sale.status === 'REFUNDED' || sale.status === 'CANCELLED')) {
      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: `Sale ${sale.status.toLowerCase()} before VSDC processing` },
      });
      failed += 1;
      continue;
    }

    const org = await prisma.organization.findUnique({
      where: { id: row.organizationId },
      select: { TIN: true, name: true, address: true },
    });

    if (!org) {
      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: 'Organization not found' },
      });
      failed += 1;
      continue;
    }

    // ── Auto-allocate an RRA purchase code when the sale has none on record ──
    // The sandbox rejects every sale without a real single-use code (882), and
    // purchase codes were historically only pooled for business TINs. For
    // fiscalization we draw any unconsumed code from the org pool regardless of
    // buyer TIN, falling back to the legacy per-customer code when the pool is
    // exhausted. Only persists when an allocation is actually made, so retries
    // reuse the same code (a consumed code cannot be re-submitted: 883).
    if (row.operation === 'SALE') {
      const needsCode = !(sale.prcOrdCd?.trim())
        && !(sale.customer?.prcOrdCd?.trim());
      logger.info(`[EBM-OUTBOX] row ${row.id}: SALE code check — needsCode=${needsCode}`);
      if (needsCode) {
        const allocated = await consumeAnyOrgPurchaseCode(
          row.organizationId,
          sale.id,
          prisma,
          sale.customer?.TIN?.trim() ?? undefined,
        )
          ?? (sale.customer?.prcOrdCd ?? null);
        logger.info(`[EBM-OUTBOX] row ${row.id}: allocated purchase code = ${allocated ?? 'NONE (pool empty, no customer fallback)'}`);
        if (allocated) {
          await prisma.sale.update({
            where: { id: sale.id },
            data: { prcOrdCd: allocated },
          });
          (sale as SaleWithRelations & { prcOrdCd?: string | null }).prcOrdCd = allocated;
        }
      }
    }

    // Build gateway payload based on operation type
    let payload: Record<string, unknown>;
    if (row.operation === 'SALE') {
      try {
        payload = buildRraSendReceiptPayload(sale, org);
      } catch (e: unknown) {
        // A bad tax code on this sale should not block the rest of the batch —
        // dead-letter this row only, it will never succeed on retry either.
        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: { status: 'DEAD_LETTER', lastError: e instanceof Error ? e.message : 'Invalid sale payload' },
        });
        failed += 1;
        continue;
      }
      payload['idempotencyKey'] = row.idempotencyKey;
    } else if (row.operation === 'REFUND') {
      // For REFUND: find the original SALE's EBM invoice number
      const outboxPayload = row.payload as { originalSaleId?: number };
      const originalSaleId = outboxPayload?.originalSaleId ?? sale.originalSaleId;
      const origTx = originalSaleId
        ? await prisma.ebmTransaction.findFirst({
            where: { saleId: originalSaleId, operation: 'SALE', submissionStatus: 'SUCCESS', ebmInvoiceNumber: { not: null } },
            orderBy: { createdAt: 'desc' },
          })
        : null;
      if (!origTx?.ebmInvoiceNumber) {
        // Original invoice not fiscalized yet — defer this refund to retry later
        const nextRetry = scheduleNextRetry(row.retryCount);
        const isDead = row.retryCount + 1 >= (config.ebm.maxQueueRetries ?? 10);
        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: {
            status: isDead ? 'DEAD_LETTER' : 'FAILED',
            retryCount: { increment: 1 },
            lastError: 'Original invoice not yet fiscalized — deferring refund',
            nextAttemptAt: isDead ? deadLetterAttemptAt() : nextRetry,
          },
        });
        if (isDead) failed += 1;
        continue;
      }
      const originalSale = originalSaleId
        ? await prisma.sale.findFirst({ where: { id: originalSaleId }, select: { invoiceNumber: true, vsdcInvcNo: true, totalAmount: true } })
        : null;
      try {
        // §4.16 Refund Reason Code: '06' = Refund (generic — the free-text
        // reason from the outbox row payload goes into `remark` instead).
        //
        // A refund is a fresh fiscal document (new invcNo, salesSttsCd=05),
        // so it needs its own unconsumed purchase code for the customer TIN —
        // the '000000' placeholder or a code already consumed by the original
        // sale is rejected (882/883).
        const refundCustTin = sale.customer?.TIN?.trim() ?? '';
        const refundCode = await consumeAnyOrgPurchaseCode(
          row.organizationId,
          sale.id,
          prisma,
          refundCustTin || undefined,
        );
        if (refundCode) {
          await prisma.sale.update({ where: { id: sale.id }, data: { prcOrdCd: refundCode } });
          (sale as SaleWithRelations & { prcOrdCd?: string | null }).prcOrdCd = refundCode;
        }
        payload = buildRraSendReceiptPayload(sale, org, {
          orgInvcNo: originalSale?.vsdcInvcNo ?? undefined,
          rfdDt: new Date(),
          rfdRsnCd: '06',
        });
        payload.remark = (row.payload as { reason?: string })?.reason ?? '';
        payload.idempotencyKey = row.idempotencyKey;
      } catch (e: unknown) {
        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: { status: 'DEAD_LETTER', lastError: e instanceof Error ? e.message : 'Invalid refund payload' },
        });
        failed += 1;
        continue;
      }
    } else {
      // VOID: only fire if original was fiscalized
      const origTx = await prisma.ebmTransaction.findFirst({
        where: { saleId: row.saleId, operation: 'SALE', submissionStatus: 'SUCCESS', ebmInvoiceNumber: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
      if (!origTx?.ebmInvoiceNumber) {
        // Sale was never fiscalized — nothing to void at RRA
        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: { status: 'SUCCEEDED', lastError: 'Original invoice never fiscalized — void skipped' },
        });
        succeeded += 1;
        continue;
      }
      try {
        // A cancellation is a NEW sales-transaction document (fresh invcNo)
        // with cnclDt/cnclReqDt set and salesSttsCd='04' — the sandbox
        // rejects a resubmitted invcNo (924) and rejects orgInvcNo on a void
        // (910: orgInvcNo is refund-only). Confirmed against the RRA VSDC
        // sandbox 2026-08-10.
        //
        // A void is a fresh submission, so it needs a fresh unconsumed
        // purchase code too: reusing the original sale's (already consumed)
        // code is rejected with 883. Allocate a new valid one for the buyer.
        const voidCustTin = sale.customer?.TIN?.trim() ?? '';
        const voidCode = await consumeAnyOrgPurchaseCode(
          row.organizationId,
          sale.id,
          prisma,
          voidCustTin || undefined,
        );
        if (voidCode) {
          await prisma.sale.update({ where: { id: sale.id }, data: { prcOrdCd: voidCode } });
          (sale as SaleWithRelations & { prcOrdCd?: string | null }).prcOrdCd = voidCode;
        }
        const { vsdcInvcNo: voidInvcNo } = await generateInvoiceNumber(row.organizationId, sale.branchId);
        payload = buildRraSendReceiptPayload(sale, org, { cnclDt: new Date(), invcNoOverride: voidInvcNo });
        payload.remark = (row.payload as { reason?: string })?.reason ?? '';
        payload.idempotencyKey = row.idempotencyKey;
      } catch (e: unknown) {
        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: { status: 'DEAD_LETTER', lastError: e instanceof Error ? e.message : 'Invalid void payload' },
        });
        failed += 1;
        continue;
      }
    }

    // ── Record attempt in EbmTransaction (audit trail) ──
    // Retries re-use the transaction row created on the first attempt
    // (idempotencyKey is unique), resetting it to SUBMITTED instead of failing
    // the duplicate insert.
    const txRow = await prisma.ebmTransaction.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: {
        organizationId: row.organizationId,
        saleId: row.saleId,
        invoiceNumber: sale.invoiceNumber,
        operation: row.operation,
        submissionStatus: 'SUBMITTED',
        idempotencyKey: row.idempotencyKey,
      },
      update: {
        submissionStatus: 'SUBMITTED',
        ebmInvoiceNumber: null,
        errorMessage: null,
        sdcRcptNo: null,
        totalRcptNo: null,
        sdcId: null,
        internalData: null,
        receiptSignature: null,
      },
    });

    try {
      // Check training mode — log but do not hit the live VSDC endpoint.
      // Mark SUCCEEDED so the entry doesn't pile up as failures.
      const orgCheck = await prisma.organization.findUnique({
        where: { id: row.organizationId },
        select: { trainingMode: true },
      });
      if (orgCheck?.trainingMode) {
        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: { status: 'SUCCEEDED', lastError: 'Training mode — VSDC submission skipped' },
        });
        succeeded += 1;
        continue;
      }

      const envelope = await buildVsdcEnvelope(row.organizationId, sale.branchId);
      logger.info(`[EBM-OUTBOX] row ${row.id}: calling saveInvc (${config.ebm.apiUrl ?? ''}/trnsSales/saveSales) — prcOrdCd=${payload.prcOrdCd ?? 'N/A'}, custTin=${(payload.receipt as any)?.custTin ?? 'N/A'}, invcNo=${(payload as any).invcNo ?? 'N/A'}`);
      let result = await saveInvc(envelope, payload);
      logger.info(`[EBM-OUTBOX] row ${row.id}: saveInvc returned success=${result.success} error=${result.error ?? 'none'} rawStatus=${result.rawStatus} rawBody=${JSON.stringify(result.rawBody)?.slice(0, 500)}`);

      if (!result.success || !result.data?.rcptNo) {
        const msg = result.error ?? 'VSDC gateway error';

        // Idempotency: resultCd 924 ("Invoice number already exists.") means
        // this invcNo was already fiscalized by a prior attempt (or a manual
        // re-submission) — treat it as a success, not a failure.
        const raw = result.rawBody as Record<string, unknown> | null;
        const replayed = raw && String(raw.resultCd) === '924';
        const replayedVsdc = replayed ? parseVsdcResponse(raw) : null;
        if (replayedVsdc?.rcptNo) {
          result = { ...result, success: true, data: replayedVsdc };
          logger.info(`[EBM-OUTBOX] row ${row.id}: already fiscalized (924) — treating as SUCCEEDED rcptNo=${replayedVsdc.rcptNo}`);
        } else {
          logger.warn(`[EBM-OUTBOX] row ${row.id}: submission FAILED — ${msg}`);

          // 882/883 = the purchase code itself is bad (invalid checksum, or
          // already burned in the sandbox ledger by a prior probe). Burning it
          // in the pool prevents every future allocation from re-drawing the
          // same poisoned code. Also clear it from the sale so the next retry
          // allocates a fresh valid one instead of re-sending the same code.
          if (/VSDC error (882|883):/.test(msg)) {
            const usedCode = (sale as SaleWithRelations & { prcOrdCd?: string | null }).prcOrdCd?.trim();
            if (usedCode) {
              await prisma.organizationPurchaseCode.updateMany({
                where: { organizationId: row.organizationId, code: usedCode, consumed: false },
                data: { consumed: true, consumedSaleId: sale.id, consumedAt: new Date() },
              });
              await prisma.sale.update({
                where: { id: sale.id },
                data: { prcOrdCd: null },
              });
              logger.warn(`[EBM-OUTBOX] row ${row.id}: burned purchase code ${usedCode} (${msg}) — cleared from sale for re-allocation`);
            }
          }

          await failSubmission(txRow.id, msg);

          const nextRetry = scheduleNextRetry(row.retryCount);
          const isDead = row.retryCount + 1 >= (config.ebm.maxQueueRetries ?? 10);

          await prisma.ebmOutbox.update({
            where: { id: row.id },
            data: {
              status: isDead ? 'DEAD_LETTER' : 'FAILED',
              retryCount: { increment: 1 },
              lastError: msg,
              nextAttemptAt: isDead ? deadLetterAttemptAt() : nextRetry,
            },
          });

          failed += 1;
          continue;
        }
      }

      const vsdc = result.data!;
      const sdcDateTime: Date | null = vsdc.sdcDateTime ? new Date(vsdc.sdcDateTime) : null;

      // C8: build electronic journal text
      const rcptLabel = (sale as any).rcptLabel ?? (row.operation === 'REFUND' ? 'NR' : 'NS');
      const ejText = row.operation === 'SALE'
        ? buildElectronicJournal(sale as SaleWithRelations, rcptLabel, {
            sdcId: envelope.sdcId,
            mrcNo: envelope.mrcNo,
            sdcRcptNo: vsdc.rcptNo ? parseInt(vsdc.rcptNo, 10) || 0 : 0,
            internalData: vsdc.intrlData,
            receiptSignature: vsdc.vsdcSignature,
            sdcDateTime: sdcDateTime ?? new Date(),
          })
        : null;

      // C5: write SDC dedicated columns alongside the JSON blob
      await prisma.$transaction([
        prisma.ebmTransaction.update({
          where: { id: txRow.id },
          data: {
            submissionStatus: 'SUCCESS',
            ebmInvoiceNumber: vsdc.rcptNo,
            submittedAt: new Date(),
            sdcDateTime: sdcDateTime as any,
            // B1 dedicated columns — sdcRcptNo/totalRcptNo are the "A"/"B" halves
            // of the required A/B RT receipt counter (§7.24.4/7.25); VSDC does not
            // return a QR payload — the CIS builds the QR string itself (qrCode.ts).
            sdcRcptNo: vsdc.rcptNo ? parseInt(vsdc.rcptNo, 10) || null : null,
            totalRcptNo: vsdc.totRcptNo ? parseInt(vsdc.totRcptNo, 10) || null : null,
            sdcId: vsdc.sdcId || null,
            internalData: vsdc.intrlData || null,
            receiptSignature: vsdc.vsdcSignature || null,
            rcptLabel: rcptLabel as any,
            // C8 electronic journal
            journalText: ejText,
            ejSent: !!ejText,
            responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: payload } as any,
          },
        }),
        prisma.ebmOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SUCCEEDED',
            sdcDateTime: sdcDateTime as any,
            lastError: null,
          },
        }),
        prisma.organization.update({
          where: { id: row.organizationId },
          data: {
            lastSyncCursor: new Date(),
            lastSuccessfulVdsContact: new Date(),
          },
        }),
      ]);

      succeeded += 1;
      logger.info(`[EBM-OUTBOX] row ${row.id}: SUCCEEDED — rcptNo=${vsdc.rcptNo}, sdcId=${vsdc.sdcId ?? 'N/A'}, sdcDateTime=${sdcDateTime?.toISOString() ?? 'N/A'}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'EBM request failed';
      logger.error(`[EBM-OUTBOX] row ${row.id}: EXCEPTION during submission — ${message}`);
      await failSubmission(txRow.id, message);

      const nextRetry = scheduleNextRetry(row.retryCount);
      const isDead = row.retryCount + 1 >= (config.ebm.maxQueueRetries ?? 10);

      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: {
          status: isDead ? 'DEAD_LETTER' : 'FAILED',
          retryCount: { increment: 1 },
          lastError: message,
          nextAttemptAt: isDead ? deadLetterAttemptAt() : nextRetry,
        },
      });

      failed += 1;
    }
  }

  logger.info(`[EBM-OUTBOX] processEbmOutboxBatch done: processed=${processed} succeeded=${succeeded} failed=${failed}`);
  return { processed, succeeded, failed };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

async function failSubmission(ebmTransactionId: number, message: string): Promise<void> {
  await prisma.ebmTransaction.update({
    where: { id: ebmTransactionId },
    data: {
      submissionStatus: 'FAILED',
      errorMessage: message,
      retryCount: { increment: 1 },
    },
  });
}

function scheduleNextRetry(currentRetryCount: number): Date {
  const delayMs = Math.min(60 * 60 * 1000, 2 * 60 * 1000 * Math.pow(2, currentRetryCount));
  return new Date(Date.now() + delayMs);
}

/**
 * Sentinel `nextAttemptAt` for a DEAD_LETTER row. `nextAttemptAt` is a
 * non-nullable `DateTime`, so instead of `null` we store a far-future timestamp
 * meaning "never retry" — the worker only selects PENDING/PROCESSING/FAILED
 * rows whose `nextAttemptAt` is in the past, so DEAD_LETTER entries stay put.
 */
function deadLetterAttemptAt(): Date {
  return new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
}

