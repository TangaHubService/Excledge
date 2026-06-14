import { prisma } from '../lib/prisma';
import { config } from '../config';
import {
  type SaleWithRelations,
  postToGateway,
  parseGatewayResponse,
  buildSaleGatewayPayload,
  generateInvoiceNumber,
  isEbmEnabled,
  gatewayErrorMessage,
} from './rra-ebm.service';

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
  const invoiceNumber = await generateInvoiceNumber(organizationId);

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
    const http = await postToGateway(statusPath, { idempotencyKey: outboxEntry.idempotencyKey });
    if (http.ok && http.json) {
      const normalized = parseGatewayResponse(http.json);
      if (normalized.ebmInvoiceNumber) {
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
        saleItems: { include: { product: true } },
        customer: true,
        branch: true,
      },
    })) as SaleWithRelations | null;

    if (!sale) {
      await prisma.ebmOutbox.update({
        where: { id: row.id },
        data: { status: 'DEAD_LETTER', lastError: 'Sale not found' },
      });
      failed += 1;
      continue;
    }

    // Skip if the sale has been refunded or cancelled since enqueueing
    if (sale.status === 'REFUNDED' || sale.status === 'CANCELLED') {
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

    // Build gateway payload and inject idempotencyKey
    const payload = buildSaleGatewayPayload(sale, org);
    payload.idempotencyKey = row.idempotencyKey;

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
      const path = config.ebm.salePath;
      const http = await postToGateway(path, payload);
      const normalized = parseGatewayResponse(http.json ?? http.rawText);

      if (!http.ok || !normalized.ebmInvoiceNumber) {
        const msg = gatewayErrorMessage(http, `Gateway HTTP ${http.status}`);
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

      // ── Success: persist VSDC response ──
      const sdcDateTime: Date | null = normalized.sdcDateTime ? new Date(normalized.sdcDateTime) : null;

      await prisma.$transaction([
        prisma.ebmTransaction.update({
          where: { id: txRow.id },
          data: {
            submissionStatus: 'SUCCESS',
            ebmInvoiceNumber: normalized.ebmInvoiceNumber,
            submittedAt: new Date(),
            sdcDateTime: sdcDateTime as any,
            responseData: { raw: http.json ?? http.rawText, normalized, requestPayload: payload } as any,
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


