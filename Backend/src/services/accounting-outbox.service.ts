import { randomUUID } from "crypto";
import { AccountingOutboxStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const ACCOUNTING_API_URL = (
  process.env.ACCOUNTING_API_URL ||
  "http://localhost:4600"
).replace(/\/$/, "");
const ACCOUNTING_INTEGRATION_API_KEY =
  process.env.ACCOUNTING_INTEGRATION_API_KEY || "dev-integration-key";

export function isAccountingIntegrationEnabled(): boolean {
  const flag = process.env.ACCOUNTING_INTEGRATION_ENABLED;
  if (flag === "false" || flag === "0") return false;
  return true;
}

export async function enqueueSaleCompletedAccountingEvent(input: {
  organizationId: number;
  branchId: number;
  saleId: number;
  saleNumber?: string | null;
  invoiceNumber?: string | null;
  customerId?: number | null;
  currencyCode?: string;
  totalAmount: number;
  taxableAmount: number;
  vatAmount: number;
  paymentType?: string | null;
  splitPayments?: Array<{ paymentMethod: string; amount: number }>;
  cogs?: number;
  occurredAt?: Date;
}): Promise<void> {
  if (!isAccountingIntegrationEnabled()) return;

  const idempotencyKey = [
    input.organizationId,
    "POS",
    "Sale",
    input.saleId,
    "SALE_COMPLETED",
    "1",
  ].join("|");

  const payload = {
    eventId: randomUUID(),
    idempotencyKey,
    externalOrganizationId: String(input.organizationId),
    externalBranchId: String(input.branchId),
    eventType: "SALE_COMPLETED",
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    sourceModule: "POS",
    sourceDocumentType: "Sale",
    sourceDocumentId: String(input.saleId),
    sourceDocumentNumber: input.invoiceNumber || input.saleNumber || undefined,
    currencyCode: input.currencyCode || "RWF",
    amountTotals: {
      gross: String(input.totalAmount),
      net: String(input.taxableAmount),
      tax: String(input.vatAmount),
    },
    parties: input.customerId
      ? { externalCustomerId: String(input.customerId) }
      : undefined,
    paymentSplits: input.splitPayments,
    metadata: {
      paymentType: input.paymentType,
      cogs: input.cogs ?? 0,
    },
  };

  await prisma.erpAccountingOutbox.upsert({
    where: { idempotencyKey },
    create: {
      organizationId: input.organizationId,
      saleId: input.saleId,
      eventType: "SALE_COMPLETED",
      idempotencyKey,
      payload: payload as Prisma.InputJsonValue,
      status: AccountingOutboxStatus.PENDING,
      nextAttemptAt: new Date(),
    },
    update: {},
  });
}

type InventoryLedgerRow = {
  id: number;
  organizationId: number;
  productId: number;
  branchId: number | null;
  movementType: string;
  direction: string;
  quantity: number;
  runningBalance: number;
  unitCost?: Prisma.Decimal | number | null;
  reference?: string | null;
  referenceType?: string | null;
  batchNumber?: string | null;
  note?: string | null;
  createdAt: Date;
};

/** Batch-weighted average cost at a branch, read through the caller's transaction. */
async function branchAverageCost(tx: Prisma.TransactionClient, organizationId: number, productId: number, branchId: number | null) {
  if (branchId == null) return null;
  const batches = await tx.batch.findMany({
    where: { organizationId, productId, branchId, isActive: true, quantity: { gt: 0 } },
    select: { unitCost: true, quantity: true },
  });
  const quantity = batches.reduce((sum, b) => sum + b.quantity, 0);
  if (quantity <= 0) return null;
  return batches.reduce((sum, b) => sum + Number(b.unitCost) * b.quantity, 0) / quantity;
}

/**
 * Queues one stock movement for Accounting in the same transaction that wrote the ledger row, so the
 * valuation subledger sees every movement exactly once. The cost is the row's own cost, the cost the
 * caller used (e.g. the batch a sale drew from), or the branch's batch average.
 */
export async function enqueueInventoryMovementAccountingEvent(
  tx: Prisma.TransactionClient,
  row: InventoryLedgerRow,
  options: { unitCost?: number | null } = {},
): Promise<void> {
  if (!isAccountingIntegrationEnabled()) return;

  const [product, branch] = await Promise.all([
    tx.product.findUnique({ where: { id: row.productId }, select: { name: true, sku: true, category: true, qtyUnitCd: true } }),
    row.branchId ? tx.branch.findUnique({ where: { id: row.branchId }, select: { name: true } }) : null,
  ]);
  const ownCost = row.unitCost == null ? 0 : Number(row.unitCost);
  const unitCost =
    ownCost > 0
      ? ownCost
      : options.unitCost && options.unitCost > 0
        ? options.unitCost
        : await branchAverageCost(tx, row.organizationId, row.productId, row.branchId);

  const idempotencyKey = [row.organizationId, "INVENTORY", "InventoryLedger", row.id, "INVENTORY_MOVEMENT", "1"].join("|");
  const payload = {
    eventId: randomUUID(),
    idempotencyKey,
    externalOrganizationId: String(row.organizationId),
    externalBranchId: row.branchId ? String(row.branchId) : undefined,
    eventType: "INVENTORY_MOVEMENT",
    occurredAt: row.createdAt.toISOString(),
    sourceModule: "INVENTORY",
    sourceDocumentType: "InventoryLedger",
    sourceDocumentId: String(row.id),
    sourceDocumentNumber: row.reference || undefined,
    currencyCode: "RWF",
    amountTotals: { gross: "0", net: "0", tax: "0" },
    metadata: {
      ledgerId: row.id,
      movementType: row.movementType,
      direction: row.direction,
      productId: row.productId,
      productName: product?.name,
      sku: product?.sku,
      category: product?.category,
      unit: product?.qtyUnitCd,
      branchId: row.branchId,
      branchName: branch?.name,
      quantity: row.quantity,
      runningBalance: row.runningBalance,
      unitCost: unitCost ?? null,
      reference: row.reference,
      referenceType: row.referenceType,
      batchNumber: row.batchNumber,
      note: row.note,
    },
  };

  await tx.erpAccountingOutbox.upsert({
    where: { idempotencyKey },
    create: {
      organizationId: row.organizationId,
      eventType: "INVENTORY_MOVEMENT",
      idempotencyKey,
      payload: payload as Prisma.InputJsonValue,
      status: AccountingOutboxStatus.PENDING,
      nextAttemptAt: new Date(),
    },
    update: {},
  });
}

/**
 * Queues the organization's current stock by branch, valued at each branch's batch average, as
 * Accounting's opening inventory. Accounting applies it once per item and branch.
 */
export async function enqueueInventoryOpeningSnapshot(organizationId: number) {
  const [latest, batches, branches] = await Promise.all([
    prisma.inventoryLedger.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["productId", "branchId"],
      select: { productId: true, branchId: true, runningBalance: true },
    }),
    prisma.batch.findMany({
      where: { organizationId, isActive: true, quantity: { gt: 0 } },
      select: { productId: true, branchId: true, unitCost: true, quantity: true },
    }),
    prisma.branch.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);

  const costs = new Map<string, { cost: number; quantity: number }>();
  for (const b of batches) {
    const key = `${b.productId}:${b.branchId}`;
    const row = costs.get(key) ?? { cost: 0, quantity: 0 };
    row.cost += Number(b.unitCost) * b.quantity;
    row.quantity += b.quantity;
    costs.set(key, row);
  }
  const onHand = latest.filter((l) => l.branchId != null && l.runningBalance > 0);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(onHand.map((l) => l.productId))] } },
    select: { id: true, name: true, sku: true, category: true, qtyUnitCd: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const lines = onHand.map((l) => {
    const cost = costs.get(`${l.productId}:${l.branchId}`);
    const product = productById.get(l.productId);
    return {
      productId: l.productId,
      productName: product?.name,
      sku: product?.sku,
      category: product?.category,
      unit: product?.qtyUnitCd,
      branchId: l.branchId,
      branchName: branchName.get(l.branchId as number),
      quantity: l.runningBalance,
      unitCost: cost && cost.quantity > 0 ? cost.cost / cost.quantity : 0,
    };
  });
  const uncosted = lines.filter((l) => !(l.unitCost > 0)).length;
  if (!lines.length) return { queued: false, lines: 0, uncosted: 0 };

  const snapshotAt = new Date();
  const idempotencyKey = [organizationId, "INVENTORY", "OpeningSnapshot", snapshotAt.getTime(), "INVENTORY_OPENING", "1"].join("|");
  await prisma.erpAccountingOutbox.create({
    data: {
      organizationId,
      eventType: "INVENTORY_OPENING",
      idempotencyKey,
      payload: {
        eventId: randomUUID(),
        idempotencyKey,
        externalOrganizationId: String(organizationId),
        eventType: "INVENTORY_OPENING",
        occurredAt: snapshotAt.toISOString(),
        sourceModule: "INVENTORY",
        sourceDocumentType: "OpeningSnapshot",
        sourceDocumentId: String(snapshotAt.getTime()),
        currencyCode: "RWF",
        amountTotals: { gross: "0", net: "0", tax: "0" },
        lines,
        metadata: { snapshotAt: snapshotAt.toISOString() },
      } as Prisma.InputJsonValue,
      status: AccountingOutboxStatus.PENDING,
      nextAttemptAt: new Date(),
    },
  });
  return { queued: true, lines: lines.length, uncosted };
}

export async function processAccountingOutboxBatch(limit = 40): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (!isAccountingIntegrationEnabled()) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  const rows = await prisma.erpAccountingOutbox.findMany({
    where: {
      status: { in: [AccountingOutboxStatus.PENDING, AccountingOutboxStatus.FAILED] },
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    await prisma.erpAccountingOutbox.update({
      where: { id: row.id },
      data: { status: AccountingOutboxStatus.PROCESSING },
    });

    try {
      const res = await fetch(`${ACCOUNTING_API_URL}/api/v1/integration/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-integration-key": ACCOUNTING_INTEGRATION_API_KEY,
        },
        body: JSON.stringify(row.payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || body.success === false) {
        throw new Error(body.error || `Accounting ingest HTTP ${res.status}`);
      }

      await prisma.erpAccountingOutbox.update({
        where: { id: row.id },
        data: {
          status: AccountingOutboxStatus.SUCCEEDED,
          lastError: null,
        },
      });
      succeeded += 1;
    } catch (e) {
      const retryCount = row.retryCount + 1;
      const dead = retryCount >= 8;
      await prisma.erpAccountingOutbox.update({
        where: { id: row.id },
        data: {
          status: dead
            ? AccountingOutboxStatus.DEAD_LETTER
            : AccountingOutboxStatus.FAILED,
          retryCount,
          lastError: (e as Error).message,
          nextAttemptAt: new Date(Date.now() + Math.min(retryCount, 10) * 60_000),
        },
      });
      failed += 1;
    }
  }

  return { processed: rows.length, succeeded, failed };
}
