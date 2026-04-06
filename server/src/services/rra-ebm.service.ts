import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { Decimal } from '@prisma/client/runtime/library';

type SaleWithRelations = {
  id: number;
  saleNumber: string;
  invoiceNumber: string | null;
  createdAt: Date;
  paymentType: string;
  cashAmount: Decimal;
  debtAmount: Decimal;
  insuranceAmount: Decimal;
  totalAmount: Decimal;
  taxableAmount: Decimal;
  vatAmount: Decimal;
  branchId: number;
  branch: { id: number; name: string; code: string } | null;
  customer: {
    name: string;
    phone: string;
    TIN: string | null;
    customerType: string;
    email: string | null;
  };
  saleItems: Array<{
    productId: number;
    quantity: number;
    unitPrice: Decimal;
    totalPrice: Decimal;
    taxRate: Decimal;
    taxAmount: Decimal;
    taxCode: string | null;
    product: { name: string };
  }>;
};

export type NormalizedEbmResponse = {
  ebmInvoiceNumber?: string;
  receiptQrPayload?: string;
  verificationCode?: string;
  sdcDateTime?: string;
};

/** Queue payload shape (v2) — worker reloads sale from DB */
export type EbmQueuePayloadV2 = {
  version: 2;
  saleId: number;
  organizationId: number;
};

function gatewayErrorMessage(http: { json: unknown | null; status: number }, fallback: string): string {
  if (http.json && typeof http.json === 'object') {
    const rec = http.json as Record<string, unknown>;
    if (rec.message != null && String(rec.message).length > 0) {
      return String(rec.message);
    }
  }
  return fallback;
}

function isQueuePayloadV2(p: unknown): p is EbmQueuePayloadV2 {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as EbmQueuePayloadV2).version === 2 &&
    typeof (p as EbmQueuePayloadV2).saleId === 'number' &&
    typeof (p as EbmQueuePayloadV2).organizationId === 'number'
  );
}

export function isEbmEnabled(): boolean {
  return config.ebm.enabled === true;
}

function authHeader(): string | undefined {
  const { apiKey, apiSecret } = config.ebm;
  if (apiKey && apiSecret) {
    const token = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }
  if (apiKey) {
    return `Bearer ${apiKey}`;
  }
  return undefined;
}

export function parseGatewayResponse(raw: unknown): NormalizedEbmResponse {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;

  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = o[k] ?? data[k];
      if (v !== undefined && v !== null && String(v).length > 0) {
        return String(v);
      }
    }
    return undefined;
  };

  return {
    ebmInvoiceNumber: pick(
      'ebmInvoiceNumber',
      'ebm_invoice_number',
      'receiptNumber',
      'receipt_number',
      'invoiceNumber',
      'fiscalInvoiceNumber',
      'sdcInvoiceNo'
    ),
    receiptQrPayload: pick('qrCode', 'qr_code', 'qrPayload', 'qr_payload', 'qrData', 'receiptQr'),
    verificationCode: pick('verificationCode', 'verification_code', 'internalData', 'rcptSign'),
    sdcDateTime: pick('sdcDateTime', 'sdc_date_time', 'issuedAt', 'timestamp'),
  };
}

async function postToGateway(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; json: unknown | null; rawText: string }> {
  const base = config.ebm.apiUrl;
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.ebm.requestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const auth = authHeader();
    if (auth) {
      headers.Authorization = auth;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let json: unknown | null = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    return { ok: res.ok, status: res.status, json, rawText };
  } finally {
    clearTimeout(t);
  }
}

function buildSaleGatewayPayload(sale: SaleWithRelations, org: { TIN: string | null; ebmDeviceId: string | null; ebmSerialNo: string | null; name: string }) {
  return {
    environment: config.ebm.environment,
    operation: 'SALE',
    seller: {
      tin: org.TIN ?? null,
      deviceId: org.ebmDeviceId ?? null,
      serialNo: org.ebmSerialNo ?? null,
      name: org.name,
    },
    branch: sale.branch
      ? {
          id: sale.branch.id,
          code: sale.branch.code,
          name: sale.branch.name,
        }
      : null,
    invoice: {
      internalNumber: sale.invoiceNumber,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      issuedAt: sale.createdAt.toISOString(),
      customer: {
        name: sale.customer.name,
        phone: sale.customer.phone,
        email: sale.customer.email ?? null,
        tin: sale.customer.TIN ?? null,
        customerType: sale.customer.customerType,
      },
      payment: {
        type: sale.paymentType,
        cashAmount: sale.cashAmount.toNumber(),
        debtAmount: sale.debtAmount.toNumber(),
        insuranceAmount: sale.insuranceAmount.toNumber(),
      },
      totals: {
        totalAmount: sale.totalAmount.toNumber(),
        taxableAmount: sale.taxableAmount.toNumber(),
        vatAmount: sale.vatAmount.toNumber(),
      },
      lines: sale.saleItems.map((si) => ({
        productName: si.product.name,
        productId: si.productId,
        quantity: si.quantity,
        unitPrice: si.unitPrice.toNumber(),
        totalPrice: si.totalPrice.toNumber(),
        taxCode: si.taxCode,
        taxRate: si.taxRate.toNumber(),
        taxAmount: si.taxAmount.toNumber(),
      })),
    },
  };
}

async function enqueueSaleRetry(params: {
  organizationId: number;
  saleId: number;
  invoiceNumber: string | null;
  lastError: string;
  retryCount?: number;
}): Promise<void> {
  const nextRetryMs = Math.min(60 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, params.retryCount ?? 0));
  await prisma.ebmQueue.create({
    data: {
      organizationId: params.organizationId,
      saleId: params.saleId,
      invoiceNumber: params.invoiceNumber,
      payload: {
        version: 2,
        saleId: params.saleId,
        organizationId: params.organizationId,
      } as object,
      lastError: params.lastError,
      nextRetryAt: new Date(Date.now() + nextRetryMs),
      submissionStatus: 'PENDING',
    },
  });
}

/**
 * Atomically allocate next invoice sequence for an organization (PostgreSQL upsert).
 */
export async function generateInvoiceNumber(organizationId: number): Promise<string> {
  const rows = await prisma.$queryRaw<[{ nextSequence: number }]>`
    INSERT INTO "organization_invoice_counters" ("organizationId", "nextSequence", "updatedAt")
    VALUES (${organizationId}, 1, NOW())
    ON CONFLICT ("organizationId") DO UPDATE
    SET "nextSequence" = "organization_invoice_counters"."nextSequence" + 1,
        "updatedAt" = NOW()
    RETURNING "nextSequence"
  `;
  const sequence = Number(rows[0]?.nextSequence ?? 0).toString().padStart(6, '0');

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { TIN: true },
  });

  const orgCode = organization?.TIN?.replace(/\D/g, '').slice(-4) || 'ORG';
  const year = new Date().getFullYear();

  return `INV-${orgCode}-${year}-${sequence}`;
}

/**
 * Submit a completed sale to the VSDC/EBM gateway (or mock). Idempotent if already SUCCESS.
 */
export async function submitInvoiceToEbm(params: {
  saleId: number;
  organizationId: number;
  /** When false, failures do not create a new ebm_queue row (used by the queue worker). Default true. */
  queueRetryOnFailure?: boolean;
}): Promise<{ success: boolean; ebmInvoiceNumber?: string; error?: string }> {
  const queueRetryOnFailure = params.queueRetryOnFailure !== false;

  if (!isEbmEnabled()) {
    return { success: true };
  }

  const sale = (await prisma.sale.findFirst({
    where: { id: params.saleId, organizationId: params.organizationId },
    include: {
      saleItems: { include: { product: true } },
      customer: true,
      branch: true,
    },
  })) as SaleWithRelations | null;

  if (!sale) {
    return { success: false, error: 'Sale not found' };
  }

  const already = await prisma.ebmTransaction.findFirst({
    where: {
      saleId: sale.id,
      operation: 'SALE',
      submissionStatus: 'SUCCESS',
      ebmInvoiceNumber: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (already?.ebmInvoiceNumber) {
    return { success: true, ebmInvoiceNumber: already.ebmInvoiceNumber };
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
  });

  if (!org) {
    return { success: false, error: 'Organization not found' };
  }

  const payload = buildSaleGatewayPayload(sale, org);

  let txRow = await prisma.ebmTransaction.findFirst({
    where: {
      saleId: sale.id,
      operation: 'SALE',
      submissionStatus: { in: ['PENDING', 'FAILED', 'RETRYING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!txRow) {
    txRow = await prisma.ebmTransaction.create({
      data: {
        organizationId: params.organizationId,
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        operation: 'SALE',
        submissionStatus: 'PENDING',
      },
    });
  } else {
    txRow = await prisma.ebmTransaction.update({
      where: { id: txRow.id },
      data: {
        submissionStatus: 'RETRYING',
        errorMessage: null,
      },
    });
  }

  const persistFailure = async (message: string, responseData?: object) => {
    await prisma.ebmTransaction.update({
      where: { id: txRow!.id },
      data: {
        submissionStatus: 'FAILED',
        errorMessage: message,
        responseData: responseData ? (responseData as object) : undefined,
        retryCount: { increment: 1 },
      },
    });
    if (!queueRetryOnFailure) {
      return;
    }
    const existingPending = await prisma.ebmQueue.findFirst({
      where: {
        saleId: sale.id,
        submissionStatus: 'PENDING',
      },
    });
    if (existingPending) {
      return;
    }
    await enqueueSaleRetry({
      organizationId: params.organizationId,
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      lastError: message,
      retryCount: txRow!.retryCount,
    });
  };

  if (config.ebm.useMock) {
    const mockRef = `MOCK-EBM-${txRow.id}`;
    await prisma.ebmTransaction.update({
      where: { id: txRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: mockRef,
        submittedAt: new Date(),
        responseData: {
          mock: true,
          environment: config.ebm.environment,
          requestPayload: payload,
          normalized: { ebmInvoiceNumber: mockRef },
        } as object,
      },
    });
    return { success: true, ebmInvoiceNumber: mockRef };
  }

  if (!config.ebm.apiUrl) {
    await persistFailure('EBM_API_URL is not configured');
    return { success: false, error: 'EBM_API_URL is not configured' };
  }

  await prisma.ebmTransaction.update({
    where: { id: txRow.id },
    data: { submissionStatus: 'SUBMITTED' },
  });

  try {
    const http = await postToGateway(config.ebm.salePath, payload);
    const normalized = parseGatewayResponse(http.json ?? http.rawText);

    if (!http.ok || !normalized.ebmInvoiceNumber) {
      const msg = gatewayErrorMessage(http, `Gateway HTTP ${http.status}`);
      await persistFailure(msg, {
        httpStatus: http.status,
        responseBody: http.json ?? http.rawText,
        requestPayload: payload,
      });
      return { success: false, error: msg };
    }

    await prisma.ebmTransaction.update({
      where: { id: txRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: normalized.ebmInvoiceNumber,
        submittedAt: new Date(),
        responseData: {
          raw: http.json ?? http.rawText,
          normalized,
          requestPayload: payload,
        } as object,
      },
    });

    return { success: true, ebmInvoiceNumber: normalized.ebmInvoiceNumber };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'EBM request failed';
    await persistFailure(message, { requestPayload: payload });
    return { success: false, error: message };
  }
}

/**
 * Report a full refund to the gateway (credit note) when the original sale was fiscalized.
 */
export async function submitRefundToEbm(params: {
  organizationId: number;
  originalSaleId: number;
  refundSaleId: number;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isEbmEnabled()) {
    return { success: true };
  }

  const origTx = await prisma.ebmTransaction.findFirst({
    where: {
      saleId: params.originalSaleId,
      operation: 'SALE',
      submissionStatus: 'SUCCESS',
      ebmInvoiceNumber: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!origTx?.ebmInvoiceNumber) {
    return { success: true };
  }

  const [originalSale, refundSale, org] = await Promise.all([
    prisma.sale.findFirst({
      where: { id: params.originalSaleId, organizationId: params.organizationId },
      select: { invoiceNumber: true, saleNumber: true, totalAmount: true },
    }),
    prisma.sale.findFirst({
      where: { id: params.refundSaleId, organizationId: params.organizationId },
      select: { saleNumber: true, totalAmount: true },
    }),
    prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
    }),
  ]);

  if (!originalSale || !refundSale || !org) {
    return { success: false, error: 'Refund EBM: missing sale or organization' };
  }

  const refundRow = await prisma.ebmTransaction.create({
    data: {
      organizationId: params.organizationId,
      saleId: params.refundSaleId,
      invoiceNumber: refundSale.saleNumber,
      operation: 'REFUND',
      submissionStatus: 'PENDING',
    },
  });

  const body = {
    environment: config.ebm.environment,
    operation: 'REFUND',
    seller: {
      tin: org.TIN ?? null,
      deviceId: org.ebmDeviceId ?? null,
      serialNo: org.ebmSerialNo ?? null,
      name: org.name,
    },
    originalInvoiceNumber: originalSale.invoiceNumber,
    originalEbmInvoiceNumber: origTx.ebmInvoiceNumber,
    refundSaleId: params.refundSaleId,
    refundSaleNumber: refundSale.saleNumber,
    refundTotalAmount: refundSale.totalAmount.toNumber(),
    reason: params.reason ?? null,
  };

  if (config.ebm.useMock) {
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: `MOCK-REFUND-${refundRow.id}`,
        submittedAt: new Date(),
        responseData: { mock: true, requestPayload: body } as object,
      },
    });
    return { success: true };
  }

  if (!config.ebm.apiUrl) {
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: {
        submissionStatus: 'FAILED',
        errorMessage: 'EBM_API_URL is not configured',
      },
    });
    return { success: false, error: 'EBM_API_URL is not configured' };
  }

  try {
    const http = await postToGateway(config.ebm.refundPath, body);
    const normalized = parseGatewayResponse(http.json ?? http.rawText);
    if (!http.ok) {
      const msg = gatewayErrorMessage(http, `Refund gateway HTTP ${http.status}`);
      await prisma.ebmTransaction.update({
        where: { id: refundRow.id },
        data: {
          submissionStatus: 'FAILED',
          errorMessage: msg,
          responseData: { raw: http.json ?? http.rawText, requestPayload: body } as object,
        },
      });
      return { success: false, error: msg };
    }

    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: normalized.ebmInvoiceNumber ?? `REFUND-ACK-${refundRow.id}`,
        submittedAt: new Date(),
        responseData: { raw: http.json ?? http.rawText, normalized, requestPayload: body } as object,
      },
    });
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Refund EBM failed';
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: { submissionStatus: 'FAILED', errorMessage: message },
    });
    return { success: false, error: message };
  }
}

/**
 * Void/cancel a fiscalized sale at the gateway when supported by RRA spec.
 */
export async function submitVoidToEbm(params: {
  organizationId: number;
  saleId: number;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isEbmEnabled()) {
    return { success: true };
  }

  const origTx = await prisma.ebmTransaction.findFirst({
    where: {
      saleId: params.saleId,
      operation: 'SALE',
      submissionStatus: 'SUCCESS',
      ebmInvoiceNumber: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!origTx?.ebmInvoiceNumber) {
    return { success: true };
  }

  const sale = await prisma.sale.findFirst({
    where: { id: params.saleId, organizationId: params.organizationId },
    select: { invoiceNumber: true, saleNumber: true },
  });

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
  });

  if (!sale || !org) {
    return { success: false, error: 'Void EBM: missing sale or organization' };
  }

  const voidRow = await prisma.ebmTransaction.create({
    data: {
      organizationId: params.organizationId,
      saleId: params.saleId,
      invoiceNumber: sale.invoiceNumber,
      operation: 'VOID',
      submissionStatus: 'PENDING',
    },
  });

  const body = {
    environment: config.ebm.environment,
    operation: 'VOID',
    seller: {
      tin: org.TIN ?? null,
      deviceId: org.ebmDeviceId ?? null,
      serialNo: org.ebmSerialNo ?? null,
      name: org.name,
    },
    internalInvoiceNumber: sale.invoiceNumber,
    saleNumber: sale.saleNumber,
    ebmInvoiceNumber: origTx.ebmInvoiceNumber,
    reason: params.reason ?? null,
  };

  if (config.ebm.useMock) {
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: `MOCK-VOID-${voidRow.id}`,
        submittedAt: new Date(),
        responseData: { mock: true, requestPayload: body } as object,
      },
    });
    return { success: true };
  }

  if (!config.ebm.apiUrl) {
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: {
        submissionStatus: 'FAILED',
        errorMessage: 'EBM_API_URL is not configured',
      },
    });
    return { success: false, error: 'EBM_API_URL is not configured' };
  }

  try {
    const http = await postToGateway(config.ebm.voidPath, body);
    const normalized = parseGatewayResponse(http.json ?? http.rawText);
    if (!http.ok) {
      const msg = gatewayErrorMessage(http, `Void gateway HTTP ${http.status}`);
      await prisma.ebmTransaction.update({
        where: { id: voidRow.id },
        data: {
          submissionStatus: 'FAILED',
          errorMessage: msg,
          responseData: { raw: http.json ?? http.rawText, requestPayload: body } as object,
        },
      });
      return { success: false, error: msg };
    }

    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: normalized.ebmInvoiceNumber ?? `VOID-ACK-${voidRow.id}`,
        submittedAt: new Date(),
        responseData: { raw: http.json ?? http.rawText, normalized, requestPayload: body } as object,
      },
    });
    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Void EBM failed';
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: { submissionStatus: 'FAILED', errorMessage: message },
    });
    return { success: false, error: message };
  }
}

/**
 * @deprecated Prefer submitInvoiceToEbm({ saleId, organizationId }) — queue stores v2 payload only.
 */
export async function queueInvoiceForEbm(
  _data: { saleId: number; organizationId: number; invoiceNumber?: string | null },
  priority = 0
): Promise<void> {
  await prisma.ebmQueue.create({
    data: {
      organizationId: _data.organizationId,
      saleId: _data.saleId,
      invoiceNumber: _data.invoiceNumber ?? null,
      payload: {
        version: 2,
        saleId: _data.saleId,
        organizationId: _data.organizationId,
      } as object,
      priority,
      nextRetryAt: new Date(),
      submissionStatus: 'PENDING',
    },
  });
}

/**
 * Process pending EBM queue rows (called from cron job).
 */
export async function processEbmQueueBatch(limit = 25): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const rows = await prisma.ebmQueue.findMany({
    where: {
      submissionStatus: 'PENDING',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      retryCount: { lt: config.ebm.maxQueueRetries },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: limit,
  });

  for (const row of rows) {
    processed += 1;
    const p = row.payload;

    if (!isQueuePayloadV2(p)) {
      await prisma.ebmQueue.update({
        where: { id: row.id },
        data: {
          submissionStatus: 'FAILED',
          lastError: 'Unsupported queue payload (expected version 2)',
          retryCount: { increment: 1 },
        },
      });
      failed += 1;
      continue;
    }

    const result = await submitInvoiceToEbm({
      saleId: p.saleId,
      organizationId: p.organizationId,
      queueRetryOnFailure: false,
    });

    if (result.success) {
      await prisma.ebmQueue.update({
        where: { id: row.id },
        data: { submissionStatus: 'SUCCESS', lastError: null },
      });
      succeeded += 1;
    } else {
      const nextRetry = Math.min(
        60 * 60 * 1000,
        2 * 60 * 1000 * Math.pow(2, row.retryCount)
      );
      await prisma.ebmQueue.update({
        where: { id: row.id },
        data: {
          retryCount: { increment: 1 },
          lastError: result.error ?? 'Unknown error',
          nextRetryAt: new Date(Date.now() + nextRetry),
          submissionStatus: row.retryCount + 1 >= config.ebm.maxQueueRetries ? 'FAILED' : 'PENDING',
        },
      });
      if (row.retryCount + 1 >= config.ebm.maxQueueRetries) {
        failed += 1;
      }
    }
  }

  return { processed, succeeded, failed };
}
