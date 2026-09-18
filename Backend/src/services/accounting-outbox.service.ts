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
