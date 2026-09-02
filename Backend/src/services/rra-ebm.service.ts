import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { buildVsdcEnvelope, saveInvc, parseVsdcResponse, validateVsdcEnvelope } from './vsdc-api.service';
import { submitSalesToOsdc } from './rra-osdc.service';
import { isValidPurchaseCode } from './purchase-code.checksum';
import { DEFAULT_ITEM_CLASSIFICATION_CD } from './item-code.service';
import { isValidCustomerPhone } from '../validations/customers.validation';

/** Any Prisma client capable of running queries — the top-level client or a $transaction callback's `tx`. */
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export type SaleWithRelations = {
  id: number;
  saleNumber: string;
  invoiceNumber: string | null;
  vsdcInvcNo: number | null;
  prcOrdCd?: string | null;
  rcptLabel: string | null;
  createdAt: Date;
  status?: string;
  paymentType: string;
  cashAmount: Decimal;
  debtAmount: Decimal;
  insuranceAmount: Decimal;
  totalAmount: Decimal;
  taxableAmount: Decimal;
  vatAmount: Decimal;
  branchId: number;
  branch: { id: number; name: string; code: string; bhfId: string | null; ebmDeviceId: string | null; ebmSerialNo: string | null } | null;
  customer: {
    id: number;
    name: string;
    phone: string;
    TIN: string | null;
    customerType: string;
    email: string | null;
    prcOrdCd?: string | null;
  };
  user: { id: number; name: string };
  saleItems: Array<{
    productId: number | null;
    quantity: number;
    unitPrice: Decimal;
    totalPrice: Decimal;
    taxRate: Decimal;
    taxAmount: Decimal;
    taxCode: string | null;
    dcRate: Decimal;
    dcAmt: Decimal;
    product: { name: string; itemCd: string | null; itemClsCd: string | null; pkgUnitCd: string | null; qtyUnitCd: string | null; packagingQty: number | null } | null;
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

type InvoiceSequenceMode = 'unknown' | 'per_device' | 'per_org' | 'legacy_sequence';

let invoiceSequenceMode: InvoiceSequenceMode = 'unknown';
let loggedLegacyInvoiceFallback = false;

export function gatewayErrorMessage(http: { json: unknown | null; status: number }, fallback: string): string {
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

  // Handle RRA canonical structure: { RESPONSE: { MESSAGE: { ... }, QR_CODE, ... } }
  const responseBlock =
    o.RESPONSE && typeof o.RESPONSE === 'object'
      ? (o.RESPONSE as Record<string, unknown>)
      : null;
  const messageBlock =
    responseBlock?.MESSAGE && typeof responseBlock.MESSAGE === 'object'
      ? (responseBlock.MESSAGE as Record<string, unknown>)
      : null;

  // Also support existing gateway format: o.data
  const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;

  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v =
        o[k] ??
        data[k] ??
        (messageBlock ? messageBlock[k] : undefined) ??
        (responseBlock ? responseBlock[k] : undefined);
      if (v !== undefined && v !== null && String(v).length > 0) {
        return String(v);
      }
    }
    return undefined;
  };

  return {
    // RRA field: "num" in MESSAGE block holds the invoice number
    ebmInvoiceNumber: pick(
      'ebmInvoiceNumber',
      'ebm_invoice_number',
      'num',
      'receiptNumber',
      'receipt_number',
      'invoiceNumber',
      'fiscalInvoiceNumber',
      'sdcInvoiceNo'
    ),
    // RRA field: "QR_CODE" in RESPONSE block holds the encrypted QR payload
    receiptQrPayload: pick('QR_CODE', 'qrCode', 'qr_code', 'qrPayload', 'qr_payload', 'qrData', 'receiptQr'),
    // RRA field: "ysdcregsig" in MESSAGE block holds the fiscal signature
    verificationCode: pick('ysdcregsig', 'verificationCode', 'verification_code', 'ysdcintdata', 'internalData', 'rcptSign'),
    // RRA fields: "ysdcmrctim" or "ysdctime" in MESSAGE block hold the SDC timestamp
    sdcDateTime: pick('ysdcmrctim', 'ysdctime', 'sdcDateTime', 'sdc_date_time', 'issuedAt', 'timestamp'),
  };
}

function isMissingDatabaseObjectError(error: unknown, objectName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const prismaError = error as {
    code?: string;
    meta?: { code?: string; message?: string };
  };

  if (prismaError.code !== 'P2010') {
    return false;
  }

  const postgresCode = prismaError.meta?.code;
  const message = prismaError.meta?.message ?? '';

  return (
    (postgresCode === '42P01' || postgresCode === '42704') &&
    message.includes(`"${objectName}"`)
  );
}

async function nextInvoiceSequenceFromCounterTable(organizationId: number, branchId: number, client: PrismaClientOrTx = prisma): Promise<number> {
  const rows = await client.$queryRaw<Array<{ nextSequence: number }>>`
    INSERT INTO "organization_invoice_counters" ("organizationId", "branchId", "nextSequence", "updatedAt")
    VALUES (${organizationId}, ${branchId}, 1, NOW())
    ON CONFLICT ("organizationId", "branchId") DO UPDATE
    SET "nextSequence" = "organization_invoice_counters"."nextSequence" + 1,
        "updatedAt" = NOW()
    RETURNING "nextSequence"
  `;

  return Number(rows[0]?.nextSequence ?? 0);
}

async function nextInvoiceSequenceFromLegacySequence(client: PrismaClientOrTx = prisma): Promise<number> {
  const rows = await client.$queryRaw<Array<{ nextSequence: bigint | number }>>`
    SELECT nextval('invoice_seq')::bigint AS "nextSequence"
  `;

  return Number(rows[0]?.nextSequence ?? 0);
}

async function allocateNextInvoiceSequence(organizationId: number, branchId: number, client: PrismaClientOrTx = prisma): Promise<number> {
  // VSDC `invcNo` must be unique per DEVICE (org + bhfId), not per branch —
  // several branches may share one VSDC device and would otherwise collide.
  const branch = await client.branch.findUnique({
    where: { id: branchId },
    select: { bhfId: true },
  });
  const deviceKey = branch?.bhfId ? `bhf:${branch.bhfId}` : `branch:${branchId}`;

  // Seed the first row past the highest number ever used by this org so we never
  // re-emit an invcNo the device has already accepted (avoids VSDC 924). The
  // atomic UPSERT below makes concurrent first-initializations safe.
  const maxRow = await client.sale.aggregate({
    where: { organizationId },
    _max: { vsdcInvcNo: true },
  });
  const seed = (maxRow._max.vsdcInvcNo ?? 0) + 1;

  const rows = await client.$queryRaw<Array<{ nextSequence: number }>>`
    INSERT INTO "vsdc_device_counters" ("organizationId", "deviceKey", "nextSequence", "updatedAt")
    VALUES (${organizationId}, ${deviceKey}, ${seed}, NOW())
    ON CONFLICT ("organizationId", "deviceKey") DO UPDATE
      SET "nextSequence" = "vsdc_device_counters"."nextSequence" + 1,
          "updatedAt"    = NOW()
    RETURNING "nextSequence"
  `;

  const allocated = Number(rows[0]?.nextSequence ?? 0);
  if (allocated > 0) {
    invoiceSequenceMode = 'per_device';
    return allocated;
  }

  // Fallbacks for DBs where vsdc_device_counters doesn't exist yet.
  if (invoiceSequenceMode === 'per_org') {
    return nextInvoiceSequenceFromCounterTable(organizationId, branchId, client);
  }

  if (invoiceSequenceMode === 'legacy_sequence') {
    return nextInvoiceSequenceFromLegacySequence(client);
  }

  try {
    const sequence = await nextInvoiceSequenceFromCounterTable(organizationId, branchId, client);
    invoiceSequenceMode = 'per_org';
    return sequence;
  } catch (error) {
    if (!isMissingDatabaseObjectError(error, 'organization_invoice_counters')) {
      throw error;
    }
  }

  try {
    const sequence = await nextInvoiceSequenceFromLegacySequence(client);
    invoiceSequenceMode = 'legacy_sequence';
    return sequence;
  } catch (error) {
    if (isMissingDatabaseObjectError(error, 'invoice_seq')) {
      throw new Error(
        'Invoice numbering database objects are missing. Run `npm run prisma:deploy` in `Backend/` to apply the latest Prisma migrations.'
      );
    }

    throw error;
  }
}

/**
 * Consume the next unused RRA purchase code from the organization's pool for a
 * given buyer TIN, atomically (within the sale transaction when `client` is a tx).
 * Only codes that pass the sandbox checksum for `buyerTin` are handed out — the
 * pool may still contain legacy invalid codes, and allocating one would be
 * rejected by the device with 882. Returns the code, or null when no valid
 * unconsumed code remains (caller falls back to the legacy per-customer
 * `prcOrdCd`).
 */
export async function consumeOrgPurchaseCode(
  organizationId: number,
  buyerTin: string,
  saleId: number,
  client: PrismaClientOrTx = prisma,
): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { TIN: true } });
  const sellerTin = org?.TIN?.trim() ?? '';

  const candidates = await client.organizationPurchaseCode.findMany({
    where: { organizationId, buyerTin, consumed: false },
    orderBy: { id: 'asc' },
    take: 100,
  });

  for (const next of candidates) {
    if (sellerTin && !isValidPurchaseCode(next.code, buyerTin, sellerTin)) {
      continue;
    }
    await client.organizationPurchaseCode.update({
      where: { id: next.id },
      data: { consumed: true, consumedSaleId: saleId, consumedAt: new Date() },
    });
    return next.code;
  }

  return null;
}

/**
 * Consume the next unused RRA purchase code from the organization's pool
 * regardless of buyer TIN. The sandbox rejects every sale without a real
 * single-use code, and codes are pooled at the org level, so fiscalization
 * draws any unconsumed code when the sale has none on record.
 *
 * `buyerTin` is the sale's actual custTin: only codes that pass the checksum
 * for it are returned, since a code pooled under a different buyer TIN would be
 * rejected by the device with 882.
 */
export async function consumeAnyOrgPurchaseCode(
  organizationId: number,
  saleId: number,
  client: PrismaClientOrTx = prisma,
  buyerTin?: string,
): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { TIN: true } });
  const sellerTin = org?.TIN?.trim() ?? '';

  // Prefer codes pooled for this exact buyer TIN — regenerated codes sit at high
  // ids while stale legacy codes (lower ids, other buyers) would otherwise crowd
  // out a scan window. Fall back to any unconsumed code when the buyer's own
  // pool is empty.
  const targetTin = buyerTin?.trim() || '';
  const buyerScoped = targetTin
    ? await client.organizationPurchaseCode.findMany({
        where: { organizationId, buyerTin: targetTin, consumed: false },
        orderBy: { id: 'asc' },
        take: 100,
      })
    : [];

  let candidates = buyerScoped;
  if (!buyerScoped.length) {
    candidates = await client.organizationPurchaseCode.findMany({
      where: { organizationId, consumed: false },
      orderBy: { id: 'asc' },
      take: 500,
    });
  }

  for (const next of candidates) {
    const tin = targetTin || next.buyerTin;
    if (sellerTin && tin && !isValidPurchaseCode(next.code, tin, sellerTin)) {
      continue;
    }
    await client.organizationPurchaseCode.update({
      where: { id: next.id },
      data: { consumed: true, consumedSaleId: saleId, consumedAt: new Date() },
    });
    return next.code;
  }

  return null;
}

export async function postToGateway(
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
    if (config.ebm.securityKey) {
      headers['security_key'] = config.ebm.securityKey;
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

// ──────────────────────────────────────────────
// C4: RRA-canonical date/amount helpers (CIS/VSDC spec §3.2)
// ──────────────────────────────────────────────

export function toRraDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function toRraTime(d: Date): string {
  return [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
}

export function toRraDateTime(d: Date): string {
  return `${toRraDate(d)}${toRraTime(d)}`;
}

export function fix2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp a free-text field to the max length the RRA reference WAR accepts. */
export function clampField(value: string | null | undefined, maxLength: number): string {
  if (!value) return '';
  return value.trim().slice(0, maxLength);
}

/**
 * VSDC §4.9 Sales Receipt Type only has two values: 'S' (Sale) and 'R' (Refund
 * after Sale). The CIS-level NS/NR/CS/CR/TS/TR/PS distinction (rcptLabel) is
 * used for the printed A/B/RT counter, not for this field — every label ends
 * in 'S' or 'R', which is exactly the axis VSDC cares about here.
 */
function rcptTyCdFromLabel(label: string | null): 'S' | 'R' {
  return label?.endsWith('R') ? 'R' : 'S';
}

/** VSDC §4.10 Payment Method codes. */
function pmtTypeCd(paymentType: string): string {
  switch (paymentType) {
    case 'CASH':         return '01'; // CASH
    case 'CREDIT_CARD':  return '05'; // DEBIT&CREDIT CARD
    case 'MOBILE_MONEY': return '06'; // MOBILE MONEY
    case 'INSURANCE':    return '07'; // OTHER
    default:             return '03'; // CASH/CREDIT
  }
}

/** VSDC §4.1 Tax Type rates — static, RRA-defined: A 0%, B 18%, C 0%, D 0%. */
export const TAX_RATE_BY_SLOT: [number, number, number, number] = [0, 18, 0, 0];

/**
 * Build the RRA VSDC API v1.0.5 `/trnsSales/saveSales` payload
 * (`TrnsSalesSaveWrReq`, §3.3.6.1). `tin`/`bhfId` are added by the caller from
 * the VSDC envelope, not here.
 *
 * `opts` lets the same builder produce a refund submission: a refund is not a
 * separate endpoint, it's another sales-transaction record referencing the
 * original invoice via `orgInvcNo` with `rfdDt`/`rfdRsnCd` set.
 */
export function buildRraSendReceiptPayload(
  sale: SaleWithRelations,
  org: { TIN: string | null; name: string; address: string | null },
  opts: {
    orgInvcNo?: number;
    rfdDt?: Date | null;
    rfdRsnCd?: string | null;
    cnclDt?: Date | null;
    /**
     * VOID must be submitted as a brand-new sales-transaction document — the
     * VSDC sandbox rejects a resubmitted `invcNo` with resultCd 924
     * ("Invoice number already exists"), and rejects `orgInvcNo` on a void
     * with resultCd 910 ("Original invoice number ... only provided for
     * refunds"). Callers building a void payload must allocate a fresh
     * `invcNo` (e.g. via `generateInvoiceNumber()`) and pass it here instead
     * of letting this function fall back to the original sale's `vsdcInvcNo`.
     */
    invcNoOverride?: number;
  } = {},
): Record<string, unknown> {
  const rcptTyCd = rcptTyCdFromLabel(sale.rcptLabel);
  const isRefund = rcptTyCd === 'R';
  const isVoid = !!opts.cnclDt;

  // Per-tax-code accumulators: slot 0=A(exempt), 1=B(VAT18%), 2=C(zero-rated), 3=D(non-taxable)
  const taxblAmt: [number, number, number, number] = [0, 0, 0, 0];
  const taxAmt:   [number, number, number, number] = [0, 0, 0, 0];
  const codeToSlot: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

  const itemList = sale.saleItems.map((si, idx) => {
    const rawCode = (si.taxCode ?? 'A').toUpperCase();
    const slot = codeToSlot[rawCode];
    if (slot === undefined) {
      throw new Error(
        `Cannot build Sale ${sale.saleNumber ?? sale.id} to RRA: sale item ${idx + 1} has an invalid tax code "${rawCode}". Only A, B, C, D are valid for line items.`
      );
    }
    // VSDC (RRA reference implementation) uses tax-inclusive quantities: the
    // supply/taxable amount is the gross unit price × quantity, and the VAT is
    // extracted from it (taxAmt = grossAmount × rate/(100+rate)).
    //
    // Refunds store negative amounts (the controller mirrors the original sale
    // with negated totals), but the RRA sandbox validates each line as
    // `dcAmt <= splyAmt` etc. against POSITIVE amounts and rejects negative
    // supply amounts with resultCd 910. A refund document is a fresh positive
    // sales-transaction record marked `salesSttsCd=05` (see §4.11/§4.16), so
    // abs() every amount and quantity when building a refund payload.
    const qty = Math.abs(Number(si.quantity));
    const prc = Math.abs(si.unitPrice.toNumber());
    const splyAmt = fix2(qty * prc);
    const tAmt = Math.abs(fix2(si.taxAmount.toNumber()));
    taxblAmt[slot] = fix2(taxblAmt[slot] + splyAmt);
    taxAmt[slot]   = fix2(taxAmt[slot] + tAmt);

    // Sales are always rung up per individual unit (qty), never per whole
    // package. `pkg` is RRA's package count for the line, so when the product
    // declares how many units make up one package, convert; a partial package
    // still rounds up to 1, since RRA has no concept of a fractional package.
    // Products without packagingQty (most of the catalog today) fall back to
    // the historical 1 pkg == 1 unit behavior.
    const packagingQty = si.product?.packagingQty ?? null;
    const pkg = packagingQty && packagingQty > 0 ? Math.ceil(qty / packagingQty) : qty;

    return {
      itemSeq:    idx + 1,
      itemCd:     si.product?.itemCd ?? `P${si.productId ?? idx + 1}`,
      itemClsCd:  si.product?.itemClsCd ?? DEFAULT_ITEM_CLASSIFICATION_CD,
      itemNm:     si.product?.name ?? 'Item',
      pkg,
      pkgUnitCd:  si.product?.pkgUnitCd ?? 'CT',
      qty,
      qtyUnitCd:  si.product?.qtyUnitCd ?? 'U',
      prc,
      splyAmt:    fix2(splyAmt),
      dcRt:       fix2(Math.abs(si.dcRate.toNumber())),
      dcAmt:      fix2(Math.abs(si.dcAmt.toNumber())),
      taxTyCd:    rawCode,
      taxblAmt:   fix2(splyAmt),
      taxAmt:     fix2(tAmt),
      totAmt:     fix2(splyAmt),
    };
  });

  const totTaxAmt   = fix2(taxAmt.reduce((s, v) => s + v, 0));
  const totTaxblAmt = fix2(taxblAmt.reduce((s, v) => s + v, 0));
  const totAmt      = fix2(Math.abs(sale.totalAmount.toNumber()));
  const now         = sale.createdAt;

  // RRA requires a customer TIN on every fiscal receipt. When the customer has
  // no registered TIN (e.g. walk-in retail), we do NOT fall back to the seller's
  // own TIN — that org TIN is usually a business (non-7-prefix) TIN, which would
  // silently convert the sale into a B2B transaction demanding a RRA purchase
  // code. Retail plants issue receipts to individuals, so we synthesize an
  // individual TIN from the customer id (§4.6 custTin/custNm).
  // NOTE: 1-prefix (not 7) — the RRA sandbox WAR v3.0.2 validates receipt
  // custTin against `^[1,9]\d{8}$`, rejecting 7-prefix with resultCd 910.
  const customerTin = sale.customer?.TIN?.trim() ?? '';
  const synthesizeTin = (id: number): string => `1${String(id).padStart(8, '0')}`.slice(0, 9);
  const isValidRraTin = (tin: string): boolean => /^[1,9]\d{8}$/.test(tin);
  const custTin = isValidRraTin(customerTin)
    ? customerTin
    : sale.customer
      ? synthesizeTin(sale.customer.id)
      : (isValidRraTin(org.TIN ?? '') ? org.TIN! : synthesizeTin(1));
  const custNm  = sale.customer?.name ?? org.name;
  // §4.6 custMblNo: only send a real, correctly-shaped phone number — never a
  // raw unvalidated value, and never the TIN (a pre-fix swapped/duplicate
  // record could otherwise leak the TIN into the mobile-number field).
  const customerPhone = sale.customer?.phone?.trim() ?? '';
  const custMblNo = customerPhone && isValidCustomerPhone(customerPhone) && customerPhone !== custTin
    ? customerPhone
    : '';
  const invcNo      = opts.invcNoOverride ?? sale.vsdcInvcNo ?? sale.id;
  const regrNm      = sale.user?.name ?? 'System';
  const regrId      = sale.user ? String(sale.user.id) : 'system';

  return {
    invcNo,
    orgInvcNo: opts.orgInvcNo ?? 0,
    custTin,
    // RRA purchase order code: the sandbox WAR rejects any sale without a real
    // single-use code (resultCd 882 — even individual sales). The outbox
    // processor auto-allocates an unconsumed org-pool code onto the sale before
    // building this payload; we simply forward whatever is on record. `000000`
    // is kept only as a last-resort placeholder when the pool is exhausted.
    prcOrdCd: (sale.prcOrdCd ?? sale.customer?.prcOrdCd ?? '000000'),
    custNm: custNm ?? '',
    salesTyCd: 'N', // spec: "Send only 'N' type"
    rcptTyCd,
    pmtTyCd: pmtTypeCd(sale.paymentType),
    salesSttsCd: isVoid ? '04' : isRefund ? '05' : '02', // §4.11: 04 Canceled, 05 Refunded, 02 Approved
    cfmDt: toRraDateTime(now),
    salesDt: toRraDate(now),
    stockRlsDt: toRraDateTime(now),
    cnclReqDt: opts.cnclDt ? toRraDateTime(opts.cnclDt) : null,
    cnclDt: opts.cnclDt ? toRraDateTime(opts.cnclDt) : null,
    rfdDt: opts.rfdDt ? toRraDateTime(opts.rfdDt) : null,
    rfdRsnCd: opts.rfdRsnCd ?? null,
    totItemCnt: itemList.length,
    taxblAmtA: taxblAmt[0],
    taxblAmtB: taxblAmt[1],
    taxblAmtC: taxblAmt[2],
    taxblAmtD: taxblAmt[3],
    taxRtA: TAX_RATE_BY_SLOT[0],
    taxRtB: TAX_RATE_BY_SLOT[1],
    taxRtC: TAX_RATE_BY_SLOT[2],
    taxRtD: TAX_RATE_BY_SLOT[3],
    // Mandatory combined fields required by the RRA reference implementation
    // (validated as taxRtF / taxRtTt in the sandbox WAR).
    taxRtF: TAX_RATE_BY_SLOT[1],
    taxRtTt: 3,
    taxAmtA: taxAmt[0],
    taxAmtB: taxAmt[1],
    taxAmtC: taxAmt[2],
    taxAmtD: taxAmt[3],
    totTaxblAmt,
    totTaxAmt,
    totAmt,
    prchrAcptcYn: 'N',
    remark: '',
    regrNm,
    regrId,
    modrNm: regrNm,
    modrId: regrId,
    receipt: {
      custTin,
      custMblNo,
      rptNo: invcNo,
      // RRA WAR rejects `trdeNm` longer than 20 chars with resultCd 910
      // ("length must be between 0 and 20") — clamp the trade name.
      trdeNm: clampField(org.name, 20),
      adrs: clampField(org.address, 40),
      topMsg: '',
      // The VSDC request contract limits this to 20 characters. Sending the
      // longer friendly message caused valid sales to be rejected with 910 by
      // the local RRA sandbox before fiscalisation could complete.
      btmMsg: clampField('Thank you for your business', 20),
      prchrAcptcYn: 'N',
    },
    itemList,
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
 * Atomically allocate next invoice sequence for a branch (PostgreSQL upsert).
 * RRA requires per-branch (per-device) sequences, not per-organization.
 *
 * Returns both the human-readable, CIS-side invoice number (printed on the
 * receipt, purely cosmetic) and the raw numeric sequence — VSDC's `invcNo` /
 * `orgInvcNo` fields are typed NUMBER and must never receive the formatted
 * string.
 */
export async function generateInvoiceNumber(
  organizationId: number,
  branchId: number,
  client: PrismaClientOrTx = prisma,
): Promise<{ invoiceNumber: string; vsdcInvcNo: number }> {
  const vsdcInvcNo = await allocateNextInvoiceSequence(organizationId, branchId, client);
  const sequence = vsdcInvcNo.toString().padStart(6, '0');

  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { TIN: true },
  });

  // TIN-derived code is cosmetic only — it is NOT guaranteed unique across
  // organizations (many orgs have no TIN yet and all fall back to the same
  // literal), and the sequence above resets per (organizationId, branchId).
  // branchId is a global PK, so folding it in makes the whole string globally
  // unique by construction, independent of TIN state or branch count per org.
  const orgCode = organization?.TIN?.replace(/\D/g, '').slice(-4) || 'ORG';
  const year = new Date().getFullYear();

  return { invoiceNumber: `INV-${orgCode}-B${branchId}-${year}-${sequence}`, vsdcInvcNo };
}

/**
 * Allocate a local, non-fiscal receipt number pair for PROFORMA (and future
 * local-only types), which per the CIS spec (§6.3.6) must never be assigned a
 * VSDC-signed invoice number — they never draw from the real gapless RRA
 * sequence (allocateNextInvoiceSequence). Mirrors the spec's own "A/B RT"
 * counter shape (§7.25) with two independent, atomically-incremented values:
 *  - typeSeq: this branch's count of this specific receipt type only
 *    (BranchReceiptCounter, keyed by rcptLabel)
 *  - totalSeq: this branch's running count across EVERY locally-numbered
 *    receipt type combined (Branch.localReceiptTotalSeq)
 * Both increment together so the pair is never `<n>/<n>` by construction.
 */
export async function allocateLocalReceiptSequence(
  branchId: number,
  rcptLabel: string,
  client: PrismaClientOrTx = prisma,
): Promise<{ typeSeq: number; totalSeq: number }> {
  const [typeRows, totalRows] = await Promise.all([
    client.$queryRaw<Array<{ nextSeq: number }>>`
      INSERT INTO "branch_receipt_counters" ("branchId", "rcptLabel", "nextSeq", "updatedAt")
      VALUES (${branchId}, ${rcptLabel}::"RcptLabel", 1, NOW())
      ON CONFLICT ("branchId", "rcptLabel") DO UPDATE
        SET "nextSeq" = "branch_receipt_counters"."nextSeq" + 1,
            "updatedAt" = NOW()
      RETURNING "nextSeq"
    `,
    client.$queryRaw<Array<{ local_receipt_total_seq: number }>>`
      UPDATE "branches"
      SET "local_receipt_total_seq" = "local_receipt_total_seq" + 1
      WHERE "id" = ${branchId}
      RETURNING "local_receipt_total_seq"
    `,
  ]);
  return {
    typeSeq: Number(typeRows[0]?.nextSeq ?? 1),
    totalSeq: Number(totalRows[0]?.local_receipt_total_seq ?? 1),
  };
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
      saleItems: {
        include: {
          product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true, packagingQty: true } },
        },
      },
      customer: true,
      branch: true,
      user: { select: { id: true, name: true } },
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

  // Pre-validate totalAmount vs line-item breakdown (RRA compliance)
  const computedTotal = sale.saleItems.reduce(
    (sum, item) => sum + Number(item.totalPrice),
    0,
  );
  const submittedTotal = Number(sale.totalAmount);
  if (Math.abs(computedTotal - submittedTotal) > 0.01) {
    return {
      success: false,
      error: `Total amount mismatch: submitted ${submittedTotal}, computed from lines ${computedTotal}`,
    };
  }

  // Pre-validate totalVat vs line-item VAT (RRA compliance)
  const computedVat = sale.saleItems.reduce(
    (sum, item) => sum + Number(item.taxAmount),
    0,
  );
  const submittedVat = Number(sale.vatAmount);
  if (Math.abs(computedVat - submittedVat) > 0.01) {
    return {
      success: false,
      error: `VAT amount mismatch: submitted ${submittedVat}, computed from lines ${computedVat}`,
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { TIN: true, name: true, address: true },
  });

  if (!org) {
    return { success: false, error: 'Organization not found' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = buildRraSendReceiptPayload(sale, org);
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid sale payload' };
  }

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

  // saveInvc() already handles config.ebm.useMock internally (mockResult()) and
  // returns the real /trnsSales/saveSales response shape — no separate shortcut
  // here, so mock mode exercises the same response-parsing path as production.
  const isOsdc = config.ebm.protocol === 'osdc';
  const hasEndpoint = isOsdc
    ? Boolean(config.ebm.osdcApiUrl || config.ebm.useMock)
    : Boolean(config.ebm.apiUrl || config.ebm.useMock);
  if (!hasEndpoint) {
    await persistFailure('EBM_API_URL is not configured');
    return { success: false, error: 'EBM_API_URL is not configured' };
  }

  await prisma.ebmTransaction.update({
    where: { id: txRow.id },
    data: { submissionStatus: 'SUBMITTED' },
  });

  try {
    // EBM 2.1 / OSDC path: talks to the OSDC device (WAR) or the direct v2.1.
    if (isOsdc) {
      const osdc = await submitSalesToOsdc({
        organizationId: params.organizationId,
        branchId: sale.branchId,
        sale,
      });
      if (!osdc.success) {
        await persistFailure(osdc.error ?? 'OSDC gateway error', {
          osdcResult: osdc.response,
          requestPayload: payload,
        });
        return { success: false, error: osdc.error };
      }
      await prisma.$transaction([
        prisma.ebmTransaction.update({
          where: { id: txRow.id },
          data: {
            submissionStatus: 'SUCCESS',
            ebmInvoiceNumber: osdc.ebmInvoiceNumber,
            submittedAt: new Date(),
            responseData: {
              osdcResult: osdc.response,
              requestPayload: payload,
            } as object,
          },
        }),
        prisma.organization.update({
          where: { id: params.organizationId },
          data: {
            lastSuccessfulVdsContact: new Date(),
            lastSyncCursor: new Date(),
          },
        }),
      ]);
      return { success: true, ebmInvoiceNumber: osdc.ebmInvoiceNumber };
    }

    const envelope = await buildVsdcEnvelope(params.organizationId, sale.branchId);

    // §22: refuse to submit against an unusable device (missing/invalid TIN or
    // no MRC serial) — the receipt must not be issued in that state.
    const envelopeError = validateVsdcEnvelope(envelope);
    if (envelopeError) {
      await persistFailure(envelopeError);
      return { success: false, error: envelopeError };
    }

    const result = await saveInvc(envelope, payload);

    if (!result.success || !result.data?.rcptNo) {
      const msg = result.error ?? 'VSDC gateway error';
      await persistFailure(msg, {
        vsdcResult: result,
        requestPayload: payload,
      });
      return { success: false, error: msg };
    }

    const { data: vsdc } = result;

    await prisma.$transaction([
      prisma.ebmTransaction.update({
        where: { id: txRow.id },
        data: {
          submissionStatus: 'SUCCESS',
          ebmInvoiceNumber: vsdc.rcptNo,
          submittedAt: new Date(),
          sdcDateTime: vsdc.sdcDateTime ? new Date(vsdc.sdcDateTime) : null,
          sdcRcptNo: vsdc.rcptNo ? parseInt(vsdc.rcptNo, 10) || null : null,
          totalRcptNo: vsdc.totRcptNo ? parseInt(vsdc.totRcptNo, 10) || null : null,
          sdcId: vsdc.sdcId || null,
          internalData: vsdc.intrlData || null,
          receiptSignature: vsdc.vsdcSignature || null,
          rcptLabel: (sale.rcptLabel as any) ?? null,
          responseData: {
            raw: result.rawBody,
            normalized: vsdc,
            requestPayload: payload,
          } as object,
        },
      }),
      prisma.organization.update({
        where: { id: params.organizationId },
        data: {
          lastSuccessfulVdsContact: new Date(),
          lastSyncCursor: new Date(),
        },
      }),
    ]);

    return { success: true, ebmInvoiceNumber: vsdc.rcptNo };
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
    return { success: false, error: 'Original invoice not fiscalized — cannot process refund' };
  }

  const [originalSale, refundSale, org] = await Promise.all([
    prisma.sale.findFirst({
      where: { id: params.originalSaleId, organizationId: params.organizationId },
      select: { invoiceNumber: true, saleNumber: true, vsdcInvcNo: true, totalAmount: true, vatAmount: true },
    }),
    prisma.sale.findFirst({
      where: { id: params.refundSaleId, organizationId: params.organizationId },
      include: {
        saleItems: {
          include: {
            product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true, packagingQty: true } },
          },
        },
        customer: true,
        branch: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: { TIN: true, name: true, address: true },
    }),
  ]);

  if (!originalSale || !refundSale || !org) {
    return { success: false, error: 'Refund EBM: missing sale or organization' };
  }

  // RRA requires refund total ≤ original total
  const refundTotal = Number(refundSale.totalAmount);
  const originalTotal = Number(originalSale.totalAmount);
  if (refundTotal > originalTotal) {
    return {
      success: false,
      error: `Refund total ${refundTotal} exceeds original invoice total ${originalTotal}`,
    };
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

  let payload: Record<string, unknown>;
  try {
    // §4.16 Refund Reason Code: '06' = Refund (the only generic code available
    // from a free-text reason — the reason itself goes into `remark`).
    payload = buildRraSendReceiptPayload(refundSale as unknown as SaleWithRelations, org, {
      orgInvcNo: originalSale.vsdcInvcNo ?? undefined,
      rfdDt: new Date(),
      rfdRsnCd: '06',
    });
    payload.remark = params.reason ?? '';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid refund payload';
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: { submissionStatus: 'FAILED', errorMessage: msg },
    });
    return { success: false, error: msg };
  }

  if (!config.ebm.useMock && !config.ebm.apiUrl) {
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
    const envelope = await buildVsdcEnvelope(params.organizationId, refundSale.branchId);
    const result = await saveInvc(envelope, payload);

    if (!result.success) {
      const msg = result.error ?? 'Refund VSDC error';
      await prisma.ebmTransaction.update({
        where: { id: refundRow.id },
        data: {
          submissionStatus: 'FAILED',
          errorMessage: msg,
          responseData: { vsdcResult: result, requestPayload: payload } as object,
        },
      });
      return { success: false, error: msg };
    }

    const { data: vsdc } = result;

    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: vsdc?.rcptNo ?? `REFUND-ACK-${refundRow.id}`,
        submittedAt: new Date(),
        sdcDateTime: vsdc?.sdcDateTime ? new Date(vsdc.sdcDateTime) : null,
        sdcRcptNo: vsdc?.rcptNo ? parseInt(vsdc.rcptNo, 10) || null : null,
        totalRcptNo: vsdc?.totRcptNo ? parseInt(vsdc.totRcptNo, 10) || null : null,
        sdcId: vsdc?.sdcId || null,
        internalData: vsdc?.intrlData || null,
        receiptSignature: vsdc?.vsdcSignature || null,
        rcptLabel: (refundSale.rcptLabel as any) ?? null,
        responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: payload } as object,
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

  const sale = (await prisma.sale.findFirst({
    where: { id: params.saleId, organizationId: params.organizationId },
    include: {
      saleItems: {
        include: {
          product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true, packagingQty: true } },
        },
      },
      customer: true,
      branch: true,
      user: { select: { id: true, name: true } },
    },
  })) as SaleWithRelations | null;

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { TIN: true, name: true, address: true },
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

  let payload: Record<string, unknown>;
  try {
    // A cancellation is a NEW sales-transaction document (fresh invcNo) with
    // cnclDt/cnclReqDt set and salesSttsCd='04'; orgInvcNo stays 0 (that
    // field is refund-only — see buildRraSendReceiptPayload's invcNoOverride
    // doc comment for the sandbox errors this avoids).
    const { vsdcInvcNo: voidInvcNo } = await generateInvoiceNumber(params.organizationId, sale.branchId);
    payload = buildRraSendReceiptPayload(sale, org, { cnclDt: new Date(), invcNoOverride: voidInvcNo });
    payload.remark = params.reason ?? '';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid void payload';
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: { submissionStatus: 'FAILED', errorMessage: msg },
    });
    return { success: false, error: msg };
  }

  if (!config.ebm.useMock && !config.ebm.apiUrl) {
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
    const envelope = await buildVsdcEnvelope(params.organizationId, sale.branchId);
    const result = await saveInvc(envelope, payload);

    if (!result.success) {
      const msg = result.error ?? 'Void VSDC error';
      await prisma.ebmTransaction.update({
        where: { id: voidRow.id },
        data: {
          submissionStatus: 'FAILED',
          errorMessage: msg,
          responseData: { vsdcResult: result, requestPayload: payload } as object,
        },
      });
      return { success: false, error: msg };
    }

    const { data: vsdc } = result;

    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: vsdc?.rcptNo ?? `VOID-ACK-${voidRow.id}`,
        submittedAt: new Date(),
        sdcDateTime: vsdc?.sdcDateTime ? new Date(vsdc.sdcDateTime) : null,
        sdcRcptNo: vsdc?.rcptNo ? parseInt(vsdc.rcptNo, 10) || null : null,
        totalRcptNo: vsdc?.totRcptNo ? parseInt(vsdc.totRcptNo, 10) || null : null,
        sdcId: vsdc?.sdcId || null,
        internalData: vsdc?.intrlData || null,
        receiptSignature: vsdc?.vsdcSignature || null,
        responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: payload } as object,
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
