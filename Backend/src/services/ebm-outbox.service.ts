import { prisma } from '../lib/prisma';
import { config } from '../config';
import {
  type SaleWithRelations,
  buildRraSendReceiptPayload,
  generateInvoiceNumber,
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
    items, paymentType, cashAmount, insuranceAmount, debtAmount,
  } = input;

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const saleNumber = `SALE-${Date.now()}`;
  const invoiceNumber = await generateInvoiceNumber(organizationId, branchId);

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

    // 2. Calculate tax
    const taxSummary = await TaxService.calculateSaleTax(
      organizationId,
      items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
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

    const newSale = await tx.sale.create({
      data: {
        saleNumber,
        invoiceNumber,
        customerId,
        userId,
        organizationId,
        branchId,
        paymentType,
        cashAmount,
        insuranceAmount,
        debtAmount,
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
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const rows = await prisma.ebmOutbox.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
      nextAttemptAt: { lte: new Date() },
      retryCount: { lt: config.ebm.maxQueueRetries },
    },
    orderBy: [{ retryCount: 'asc' }, { createdAt: 'asc' }],
    take: limit,
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    processed += 1;

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
      },
    })) as (SaleWithRelations & { originalSaleId?: number | null }) | null;

    if (!sale) {
      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: 'Sale not found' },
      });
      failed += 1;
      continue;
    }

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
      select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
    });

    if (!org) {
      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: 'Organization not found' },
      });
      failed += 1;
      continue;
    }

    // Build gateway payload based on operation type
    let payload: Record<string, unknown>;
    if (row.operation === 'SALE') {
      payload = buildRraSendReceiptPayload(sale, org);
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
            nextAttemptAt: isDead ? null : (nextRetry as any),
          },
        });
        if (isDead) failed += 1;
        continue;
      }
      const originalSale = originalSaleId
        ? await prisma.sale.findFirst({ where: { id: originalSaleId }, select: { invoiceNumber: true, totalAmount: true } })
        : null;
      payload = {
        environment: config.ebm.environment,
        operation: 'REFUND',
        idempotencyKey: row.idempotencyKey,
        seller: { tin: org.TIN ?? null, deviceId: org.ebmDeviceId ?? null, serialNo: org.ebmSerialNo ?? null, name: org.name },
        originalInvoiceNumber: originalSale?.invoiceNumber ?? null,
        originalEbmInvoiceNumber: origTx.ebmInvoiceNumber,
        refundSaleId: sale.id,
        refundSaleNumber: sale.saleNumber,
        refundTotalAmount: Math.abs(Number(sale.totalAmount)),
        reason: (row.payload as { reason?: string })?.reason ?? null,
      };
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
      payload = {
        environment: config.ebm.environment,
        operation: 'VOID',
        idempotencyKey: row.idempotencyKey,
        seller: { tin: org.TIN ?? null, deviceId: org.ebmDeviceId ?? null, serialNo: org.ebmSerialNo ?? null, name: org.name },
        originalInvoiceNumber: sale.invoiceNumber,
        originalEbmInvoiceNumber: origTx.ebmInvoiceNumber,
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        reason: (row.payload as { reason?: string })?.reason ?? null,
      };
    }

    // ── Mark in-flight ──
    await prisma.ebmOutbox.update({
      where: { id: row.id },
      data: { status: 'PROCESSING' },
    });

    // ── Record attempt in EbmTransaction (audit trail) ──
    const txRow = await prisma.ebmTransaction.create({
      data: {
        organizationId: row.organizationId,
        saleId: row.saleId,
        invoiceNumber: sale.invoiceNumber,
        operation: row.operation,
        submissionStatus: 'SUBMITTED',
        idempotencyKey: row.idempotencyKey,
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
      const result = await saveInvc(envelope, payload);

      if (!result.success || !result.data?.rcptNo) {
        const msg = result.error ?? 'VSDC gateway error';
        await failSubmission(txRow.id, msg);

        const nextRetry = scheduleNextRetry(row.retryCount);
        const isDead = row.retryCount + 1 >= (config.ebm.maxQueueRetries ?? 10);

        await prisma.ebmOutbox.update({
          where: { id: row.id },
          data: {
            status: isDead ? 'DEAD_LETTER' : 'FAILED',
            retryCount: { increment: 1 },
            lastError: msg,
            nextAttemptAt: isDead ? null : (nextRetry as any),
          },
        });

        if (isDead) failed += 1;
        continue;
      }

      const { data: vsdc } = result;
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
            // B1 dedicated columns
            sdcRcptNo: vsdc.rcptNo ? parseInt(vsdc.rcptNo, 10) || null : null,
            internalData: vsdc.intrlData || null,
            receiptSignature: vsdc.vsdcSignature || null,
            qrPayload: vsdc.qrPayload || null,
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'EBM request failed';
      await failSubmission(txRow.id, message);

      const nextRetry = scheduleNextRetry(row.retryCount);
      const isDead = row.retryCount + 1 >= (config.ebm.maxQueueRetries ?? 10);

      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: {
          status: isDead ? 'DEAD_LETTER' : 'FAILED',
          retryCount: { increment: 1 },
          lastError: message,
          nextAttemptAt: isDead ? null : (nextRetry as any),
        },
      });

      if (isDead) failed += 1;
    }
  }

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


