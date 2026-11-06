import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { isValidPurchaseCode, generateValidPurchaseCodes } from './purchase-code.checksum';
import { deriveQtyUnitCd } from './item-code.service';
import { getRraPaymentCode, requiresPurchaseCode, resolvePkgUnitCd, resolveQtyUnitCd, LAST_RESORT_TOURISM_TAX_RATE, getTourismTaxRate } from './rra-code.service';
import { diff2, bandTaxFromNet } from './money.service';
import { vsdcDiscountRate } from './discount.service';
import { kigaliWallParts } from './invoice-format.service';
import { vsdcSalesTyCdForLabel } from './training-mode.service';

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
    address?: string | null;
    custPrvncNm?: string | null;
    custDstrtNm?: string | null;
    custSctrNm?: string | null;
    custLocDesc?: string | null;
    /** Pharmacy insurer code (VSDC isrccCd). Required to populate sale insurance line fields. */
    isrccCd?: string | null;
    /** Premium / cover rate % (VSDC isrcRt). */
    isrcRt?: Decimal | number | null;
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
    measurementUnit?: string | null;
    serviceName?: string | null;
    product: {
      name: string;
      itemCd: string | null;
      itemClsCd: string | null;
      pkgUnitCd: string | null;
      qtyUnitCd: string | null;
      packagingQty: number | null;
      barcode?: string | null;
      useInsurance?: boolean;
    } | null;
  }>;
};

export type NormalizedEbmResponse = {
  ebmInvoiceNumber?: string;
  receiptQrPayload?: string;
  verificationCode?: string;
  sdcDateTime?: string;
};

type InvoiceSequenceMode = 'unknown' | 'per_device' | 'per_org' | 'legacy_sequence';

let invoiceSequenceMode: InvoiceSequenceMode = 'unknown';

export function gatewayErrorMessage(http: { json: unknown | null; status: number }, fallback: string): string {
  if (http.json && typeof http.json === 'object') {
    const rec = http.json as Record<string, unknown>;
    if (rec.message != null && String(rec.message).length > 0) {
      return String(rec.message);
    }
  }
  return fallback;
}

export function isEbmEnabled(): boolean {
  return config.ebm.enabled === true;
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

  // Seed the first row past the highest number ever used by this org so we never re-emit an invcNo
  // the device has already accepted (avoids VSDC 924).
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
 * Consume the next unused RRA purchase code from the organization's pool for a given buyer TIN,
 * atomically (within the sale transaction when `client` is a tx).
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

/** Thrown when a fiscal payload cannot be built because no RRA purchase order code is on record. */
export class PurchaseCodeMissingError extends Error {
  constructor(saleRef: string | number, custTin: string) {
    super(
      `Cannot build Sale ${saleRef} to RRA: no RRA purchase order code (prcOrdCd) on the sale, the customer, or the organization pool. ` +
      `Top up the pool for buyer TIN ${custTin} before retrying.`,
    );
    this.name = 'PurchaseCodeMissingError';
  }
}

/**
 * Consume the next unused RRA purchase code from the organization's pool for the given buyer TIN,
 * atomically (within the sale transaction when `client` is a tx).
 */
export async function consumeAnyOrgPurchaseCode(
  organizationId: number,
  saleId: number,
  client: PrismaClientOrTx = prisma,
  buyerTin?: string,
): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { TIN: true } });
  const sellerTin = org?.TIN?.trim() ?? '';

  // Strictly buyer-scoped: only codes pooled for THIS buyer TIN are ever handed out.
  const targetTin = buyerTin?.trim() || '';
  if (!targetTin) return null;

  let candidates = await client.organizationPurchaseCode.findMany({
    where: { organizationId, buyerTin: targetTin, consumed: false },
    orderBy: { id: 'asc' },
    take: 100,
  });

  // Sandbox/dev resilience: outside production there are no buyer devices to issue real purchase
  // codes, so mint buyer-scoped single-use codes on demand (the same stand-ins
  // scripts/topup-purchase-codes.ts creates manually).
  if (!candidates.length && sellerTin && (config.ebm.environment ?? 'sandbox') !== 'production') {
    const existing = await client.organizationPurchaseCode.findMany({
      where: { organizationId },
      select: { code: true },
      take: 20000,
    });
    const minted = generateValidPurchaseCodes(targetTin, sellerTin, 10, new Set(existing.map((r) => r.code)));
    if (minted.length) {
      await client.organizationPurchaseCode.createMany({
        data: minted.map((code) => ({ organizationId, code, buyerTin: targetTin })),
        skipDuplicates: true,
      });
      candidates = await client.organizationPurchaseCode.findMany({
        where: { organizationId, buyerTin: targetTin, consumed: false },
        orderBy: { id: 'asc' },
        take: 100,
      });
    }
  }

  for (const next of candidates) {
    if (sellerTin && !isValidPurchaseCode(next.code, targetTin, sellerTin)) {
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

// C4: RRA-canonical date/amount helpers (CIS/VSDC spec §3.2)

export function toRraDate(d: Date): string {
  // VSDC sales dates are Kigali calendar days, independent of server timezone.
  const k = kigaliWallParts(d);
  return `${k.year}${k.month}${k.day}`;
}

export function toRraTime(d: Date): string {
  // VSDC timestamps are Kigali wall time, independent of server timezone.
  const k = kigaliWallParts(d);
  return `${k.hour}${k.minute}${k.second}`;
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

/** VSDC §4.9 Sales Receipt Type only has two values: 'S' (Sale) and 'R' (Refund after Sale). */
/** VSDC §4.9 Sales Receipt Type only has two values: 'S' (Sale) and 'R' (Refund after Sale). */
function rcptTyCdFromLabel(label: string | null): 'S' | 'R' {
  return label?.endsWith('R') ? 'R' : 'S';
}

/**
 * RRA TIN shape accepted by the VSDC (`receipt.custTin` + `custTin` must both pass it — verified
 * live: the sandbox rejects 7-prefix, all-zero and short values with resultCd 910, and rejects
 * empty with 910).
 */
export const RRA_TIN_PATTERN = /^[19]\d{8}$/;

export function isValidRraTin(tin: string): boolean {
  return RRA_TIN_PATTERN.test((tin ?? '').trim());
}

/**
 * Official VSDC buyer-mobile shape for `receipt.custMblNo` (and the phone fallback for top-level
 * `custTin`): optional leading `+`, 9–15 digits.
 */
export const VSDC_PHONE_PATTERN = /^\+?\d{9,15}$/;

export function isValidVsdcPhone(value: string | null | undefined): boolean {
  return VSDC_PHONE_PATTERN.test((value ?? '').trim());
}

/**
 * Coerce customer/org free text to a plain JSON-safe VSDC string: trimmed with control characters
 * stripped (never valid in VSDC text fields — they would otherwise ride along inside the JSON
 * body).
 */
export function sanitizeVsdcText(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

/**
 * Seller header for `receipt.topMsg`: one detail per line, in the order name, address, phone, email,
 * TIN, skipping whatever the organization has not filled in. Each line has its own cap so the total
 * stays within the WAR's 300-character limit without ever truncating the TIN off the end.
 */
export function buildVsdcTopMsg(org: {
  TIN: string | null;
  name: string;
  address: string | null;
  phone?: string | null;
  email?: string | null;
}): string {
  const labelled = (label: string, value: unknown) => {
    const text = sanitizeVsdcText(value);
    return text ? `${label}: ${text}` : '';
  };
  return [
    clampField(sanitizeVsdcText(org.name), 80),
    clampField(sanitizeVsdcText(org.address), 80),
    clampField(labelled('TEL', org.phone), 30),
    clampField(labelled('EMAIL', org.email), 80),
    clampField(labelled('TIN', org.TIN), 20),
  ].filter(Boolean).join('\n');
}

/**
 * Seller identity for `adrs`/`topMsg`: the branch address wins over the organization address,
 * matching the printed invoice header.
 */
export async function withBranchSellerAddress<T extends { address: string | null }>(
  org: T,
  branchId: number | null | undefined,
): Promise<T> {
  if (!branchId) return org;
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { address: true } });
  return branch?.address?.trim() ? { ...org, address: branch.address } : org;
}

/**
 * Rwanda mobile in the only shape the VSDC accepts in top-level `custTin`: the 9-digit local number
 * starting with 7 ("788333001").
 */
export function toVsdcCustTinMobile(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/[\s-]/g, '').replace(/^\+?250/, '').replace(/^0/, '');
  return /^7\d{8}$/.test(digits) ? digits : null;
}

export interface VsdcBuyerIdentity {
  /** Top-level `custTin`: the valid customer TIN, else the customer mobile
   * as a 9-digit local number (see toVsdcCustTinMobile), else null. */
  custTin: string | null;
  /** `receipt.custTin`: the valid customer TIN ONLY, else null. Never a phone. */
  receiptCustTin: string | null;
  /** `receipt.custMblNo`: the valid customer mobile ONLY, else null. Never a TIN. */
  receiptCustMblNo: string | null;
}

/**
 * Resolve the buyer identity for a VSDC sales submission from the stored customer record, per the
 * official payload structure: - `receipt.custTin` carries a valid TIN or null — never a phone
 * number. - `receipt.custMblNo` carries a valid phone number or null — never a TIN (a stored phone
 * that itself passes the TIN shape is dropped from both slots: it is a suspected swap and must leak
 * into neither field). - top-level `custTin` carries the TIN when present, else the phone as a
 * 9-digit local mobile, else null (sent as JSON null, never "").
 */
export function resolveVsdcBuyerIdentity(
  customer: { TIN?: string | null; phone?: string | null } | null | undefined,
): VsdcBuyerIdentity {
  const rawTin = (customer?.TIN ?? '').trim();
  const rawPhone = (customer?.phone ?? '').trim();
  const tin = isValidRraTin(rawTin) ? rawTin : null;
  const phone = rawPhone && isValidVsdcPhone(rawPhone) && !isValidRraTin(rawPhone) ? rawPhone : null;
  // receipt.custTin accepts a real TIN only (910 "Must be a valid TIN" for every phone shape);
  // top-level custTin accepts a TIN or a 9-digit local mobile ("Must be a valid TIN or a Rwanda
  // Mobile phone number").
  return { custTin: tin ?? toVsdcCustTinMobile(phone), receiptCustTin: tin, receiptCustMblNo: phone };
}

/** Walk-in (no-TIN individual) buyer TIN for VSDC submission. */
export function walkInCustTin(customerId: number): string {
  const n = Math.max(1, Math.floor(Number(customerId) || 1));
  return `19${String(n).padStart(7, '0')}`.slice(0, 9);
}

/**
 * The buyer TIN under which purchase codes are pooled/allocated for a sale: the stored customer TIN
 * when it is valid, otherwise the deterministic walk-in placeholder for individuals.
 */
export function effectiveBuyerTin(sale: Pick<SaleWithRelations, 'id' | 'saleNumber' | 'customer'>): string {
  const stored = sale.customer?.TIN?.trim() ?? '';
  if (isValidRraTin(stored)) return stored;
  try {
    return resolveCustTinForVsdc(sale);
  } catch {
    return stored;
  }
}

/** Resolve the buyer TIN used to scope purchase-code pooling for a sale (see effectiveBuyerTin). */
export function resolveCustTinForVsdc(sale: Pick<SaleWithRelations, 'id' | 'saleNumber' | 'customer'>): string {
  const customerTin = sale.customer?.TIN?.trim() ?? '';
  if (isValidRraTin(customerTin)) return customerTin;
  const customerType = (sale.customer?.customerType ?? 'INDIVIDUAL').toUpperCase();
  if (customerType !== 'INDIVIDUAL') {
    throw new Error(
      `Cannot fiscalize Sale ${sale.saleNumber ?? sale.id}: ${customerType} customer "${sale.customer?.name ?? '?'}" has no valid 9-digit RRA TIN. ` +
      `Register the customer's real TIN (verify via /rra/customers/:tin) before submitting.`,
    );
  }
  if (!sale.customer) {
    throw new Error(
      `Cannot fiscalize Sale ${sale.saleNumber ?? sale.id}: no customer on record and no valid TIN to submit.`,
    );
  }
  return walkInCustTin(sale.customer.id);
}

/** Last-resort A/B/C/D rates when `/code/selectCodes` class 04 is not cached. */
export const TAX_RATE_BY_SLOT: [number, number, number, number] = [0, 18, 0, 0];

/**
 * Build the RRA VSDC API v1.0.5 `/trnsSales/saveSales` payload (`TrnsSalesSaveWrReq`, §3.3.6.1).
 */
export function buildRraSendReceiptPayload(
  sale: SaleWithRelations,
  org: { TIN: string | null; name: string; address: string | null; phone?: string | null; email?: string | null },
  rraPaymentCode: string,
  opts: {
    orgInvcNo?: number;
    rfdDt?: Date | null;
    rfdRsnCd?: string | null;
    cnclDt?: Date | null;
    /**
     * VOID must be submitted as a brand-new sales-transaction document — the VSDC sandbox rejects a
     * resubmitted `invcNo` with resultCd 924 ("Invoice number already exists").
     */
    invcNoOverride?: number;
    taxRates?: [number, number, number, number];
    taxRateTourism?: number;
  } = {},
): Record<string, unknown> {
  const rcptTyCd = rcptTyCdFromLabel(sale.rcptLabel);
  const isRefund = rcptTyCd === 'R';
  const isVoid = !!opts.cnclDt;

  // Per-tax-code accumulators: slot 0=A(exempt), 1=B(VAT18%), 2=C(zero-rated), 3=D(non-taxable)
  const taxblAmt: [number, number, number, number] = [0, 0, 0, 0];
  const taxAmt:   [number, number, number, number] = [0, 0, 0, 0];
  const codeToSlot: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

  // Pharmacy insurance line fields (TrnsSalesSaveWrItem isrcc*/isrc*).
  const insurerCd = (sale.customer?.isrccCd ?? '').trim();
  const insuranceAmtTotal = Math.abs(Number(sale.insuranceAmount ?? 0));
  const insuranceActive =
    insuranceAmtTotal > 0
    && sale.customer?.customerType === 'INSURANCE'
    && !!insurerCd;
  const insurerNm = insuranceActive ? (sale.customer?.name ?? null) : null;
  const insurerRt = insuranceActive && sale.customer?.isrcRt != null
    ? Number(sale.customer.isrcRt)
    : null;
  // Prefer products flagged useInsurance; if none are flagged, spread across all lines.
  const anyFlagged = sale.saleItems.some((si) => si.product?.useInsurance === true);
  const insuranceBaseTotal = sale.saleItems.reduce((s, si) => {
    if (!insuranceActive) return s;
    if (anyFlagged && si.product?.useInsurance !== true) return s;
    return s + Math.abs(Number(si.totalPrice));
  }, 0);

  const itemList = sale.saleItems.map((si, idx) => {
    const rawCode = (si.taxCode ?? 'A').toUpperCase();
    const slot = codeToSlot[rawCode];
    if (slot === undefined) {
      throw new Error(
        `Cannot build Sale ${sale.saleNumber ?? sale.id} to RRA: sale item ${idx + 1} has an invalid tax code "${rawCode}". Only A, B, C, D are valid for line items.`
      );
    }
    // VSDC (RRA reference implementation) uses tax-inclusive quantities: the supply/taxable amount
    // is the gross unit price × quantity, and the VAT is extracted from it (taxAmt = grossAmount ×
    // rate/(100+rate)).
    const qty = Math.abs(Number(si.quantity));
    const prc = Math.abs(si.unitPrice.toNumber());
    const splyAmt = fix2(qty * prc);
    const dcAmtAbs = fix2(Math.abs(si.dcAmt.toNumber()));
    const tAmt = Math.abs(fix2(si.taxAmount.toNumber()));
    // R4: the DISCOUNTED amount enters the totals. splyAmt stays the gross qty×prc (unit-price
    // identity + the sandbox's dcAmt<=splyAmt check), but the taxable band and the line total are
    // net of discount. si.taxAmount is already net-based — commitSale computes tax on the charged
    // (post- discount) prices — so only the splyAmt leg needed correcting.
    const netAmt = diff2(splyAmt, dcAmtAbs);
    // Exact-decimal slot accumulation through diff2 (a + b == a - (-b)) so
    // binary-float dust in the legs can never reach the band derivation.
    taxblAmt[slot] = diff2(taxblAmt[slot], -netAmt);

    // Sales are always rung up per individual unit (qty), never per whole package.
    const packagingQty = si.product?.packagingQty ?? null;
    const pkg = packagingQty && packagingQty > 0 ? Math.ceil(qty / packagingQty) : qty;

    // Catalog products/services without an RRA itemCd can never be sold fiscally.
    const itemCd = si.product?.itemCd ?? (si.productId != null ? null : `SVC-${idx + 1}`);
    if (!itemCd) {
      throw new Error(
        `Cannot build Sale ${sale.saleNumber ?? sale.id} to RRA: product #${si.productId} has no RRA item code (itemCd). ` +
        `Open the product and save it so an itemCd is allocated, then sync it via POST /rra/items/:productId/sync.`,
      );
    }
    // RRA code classes 10/17: the sandbox rejects unknown unit codes with resultCd 913, so stored
    // codes are accepted only when they are real RRA codes — otherwise fall back to the
    // measurement-unit derivation / 'CT'.
    const pkgUnitCd = resolvePkgUnitCd(si.product?.pkgUnitCd);
    const qtyUnitCd = resolveQtyUnitCd(si.product?.qtyUnitCd, si.measurementUnit ?? null, deriveQtyUnitCd);

    // Prefer RRA classification from the product — never invent a UNSPSC code.
    // Required for SERVICE as well as PRODUCT (VSDC ItemSaveReq / TrnsSalesSaveWrReq).
    const itemClsCd = si.product?.itemClsCd?.trim() || null;
    if (!itemClsCd) {
      const label = si.productId != null
        ? `product #${si.productId}`
        : `service line ${idx + 1}${si.serviceName ? ` (${si.serviceName})` : ''}`;
      throw new Error(
        `Cannot build Sale ${sale.saleNumber ?? sale.id} to RRA: ${label} has no RRA item classification (itemClsCd). ` +
        `Select a classification on the catalog item (services included), re-sync to RRA, then retry the outbox row.`,
      );
    }

    return {
      itemSeq:    idx + 1,
      itemCd,
      itemClsCd,
      itemNm:     si.product?.name ?? si.serviceName ?? 'Item',
      bcd:        si.product?.barcode ?? null,
      pkg,
      pkgUnitCd,
      qty,
      qtyUnitCd,
      prc,
      splyAmt:    fix2(splyAmt),
      dcRt:       vsdcDiscountRate(splyAmt, dcAmtAbs, si.dcRate.toNumber()),
      dcAmt:      dcAmtAbs,
      // Insurance line fields — populated only for registered pharmacy insurers.
      ...((): {
        isrccCd: string | null;
        isrccNm: string | null;
        isrcRt: number | null;
        isrcAmt: number | null;
      } => {
        if (!insuranceActive || insuranceBaseTotal <= 0) {
          return { isrccCd: null, isrccNm: null, isrcRt: null, isrcAmt: null };
        }
        if (anyFlagged && si.product?.useInsurance !== true) {
          return { isrccCd: null, isrccNm: null, isrcRt: null, isrcAmt: null };
        }
        const share = Math.abs(Number(si.totalPrice)) / insuranceBaseTotal;
        return {
          isrccCd: insurerCd,
          isrccNm: insurerNm,
          isrcRt: insurerRt,
          isrcAmt: fix2(insuranceAmtTotal * share),
        };
      })(),
      taxTyCd:    rawCode,
      taxblAmt:   fix2(netAmt),
      taxAmt:     fix2(tAmt),
      totAmt:     fix2(netAmt),
    };
  });

  // R4/R11: band taxes are DERIVED once from each band's NET and its rate (money.service policy) —
  // never summed from per-line cents, which are already rounded by the Decimal(15,2) columns and
  // can land a cent away from the exact band value (768.81 + 45.76 = 814.57 vs 814.58 for the R4
  // sample).
  const bandRates = opts.taxRates ?? TAX_RATE_BY_SLOT;
  for (let i = 0; i < 4; i++) {
    taxAmt[i] = bandRates[i] > 0 ? bandTaxFromNet(taxblAmt[i], bandRates[i]) : 0;
  }
  const totTaxAmt   = fix2(taxAmt.reduce((s, v) => s + v, 0));
  const totTaxblAmt = fix2(taxblAmt.reduce((s, v) => s + v, 0));
  const totAmt      = fix2(Math.abs(sale.totalAmount.toNumber()));
  const now         = sale.createdAt;

  // Official buyer-field mapping (TrnsSalesSaveWrReq.custTin + receipt block): - receipt.custTin is
  // a valid customer TIN or null — never a phone number. - receipt.custMblNo is a valid customer
  // mobile or null — never a TIN. - top-level custTin is the TIN when present, else the mobile as a
  // 9-digit local number, else null (sent as JSON null, never "").
  if (!sale.customer) {
    throw new Error(
      `Cannot fiscalize Sale ${sale.saleNumber ?? sale.id}: no customer on record and no valid TIN to submit.`,
    );
  }
  const buyer = resolveVsdcBuyerIdentity(sale.customer);
  const buyerType = (sale.customer.customerType ?? 'INDIVIDUAL').toUpperCase();
  if (!buyer.receiptCustTin && buyerType !== 'INDIVIDUAL') {
    throw new Error(
      `Cannot fiscalize Sale ${sale.saleNumber ?? sale.id}: ${buyerType} customer "${sale.customer?.name ?? '?'}" has no valid 9-digit RRA TIN. ` +
      `Register the customer's real TIN (verify via /rra/customers/:tin) before submitting.`,
    );
  }
  const custTin = buyer.custTin;
  const custNm = sanitizeVsdcText(sale.customer?.name) || sanitizeVsdcText(org.name);
  const invcNo = opts.invcNoOverride ?? sale.vsdcInvcNo ?? (() => {
    throw new Error(
      `Cannot build Sale ${sale.saleNumber ?? sale.id} to RRA: no VSDC invoice number (vsdcInvcNo) allocated. ` +
      `A fiscal document must always carry a fresh number from the per-device sequence.`,
    );
  })();
  const regrNm      = sale.user?.name ?? 'System';
  const regrId      = sale.user ? String(sale.user.id) : 'system';

  return {
    invcNo,
    orgInvcNo: opts.orgInvcNo ?? 0,
    custTin,
    // RRA purchase order code: verified live, the sandbox rejects a missing code with 881 and a
    // fake one such as '000000' with 882 — so there is no placeholder fallback.
    prcOrdCd: ((): string => {
      const code = (sale.prcOrdCd ?? sale.customer?.prcOrdCd ?? '').trim();
      if (!code) {
        throw new PurchaseCodeMissingError(sale.saleNumber ?? sale.id, custTin ?? '(buyer has no TIN/phone on record)');
      }
      return code;
    })(),
    custNm: custNm ?? '',
    // VSDC API v1.0.5 TrnsSalesSaveWrReq says "Send only 'N' type", but CIS §6 routes TRAINING
    // receipts through VSDC too, and the RRA reference VSDC (rraVsdcSandbox 3.0.2) handles 'T' as
    // training: own counter, no intrlData/rcptSign.
    salesTyCd: vsdcSalesTyCdForLabel(sale.rcptLabel),
    rcptTyCd,
    pmtTyCd: rraPaymentCode,
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
    taxRtA: (opts.taxRates ?? TAX_RATE_BY_SLOT)[0],
    taxRtB: (opts.taxRates ?? TAX_RATE_BY_SLOT)[1],
    taxRtC: (opts.taxRates ?? TAX_RATE_BY_SLOT)[2],
    taxRtD: (opts.taxRates ?? TAX_RATE_BY_SLOT)[3],
    // VSDC reference implementation validates these; must match spec/actual rate
    taxRtF: (opts.taxRates ?? TAX_RATE_BY_SLOT)[1],
    taxRtTt: opts.taxRateTourism ?? LAST_RESORT_TOURISM_TAX_RATE,
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
      // receipt.custTin is the valid TIN or null — deliberately NOT the
      // top-level custTin (which may carry a mobile where VSDC allows it).
      custTin: buyer.receiptCustTin,
      custMblNo: buyer.receiptCustMblNo,
      rptNo: invcNo,
      // RRA WAR rejects `trdeNm` longer than 20 chars with resultCd 910
      // ("length must be between 0 and 20") — clamp the trade name.
      trdeNm: clampField(org.name, 20),
      adrs: clampField(org.address, 200),
      // Full seller header, one detail per line. The WAR allows 300 characters;
      // VSDC API v1.0.5 §3.3.6.1 lists CHAR 20, so watch for a 910 from RRA.
      topMsg: buildVsdcTopMsg(org),
      btmMsg: clampField('THANK YOU', 20),
      prchrAcptcYn: 'N',
    },
    itemList,
  };
}

/**
 * Atomically allocate next invoice sequence for a branch (PostgreSQL upsert). RRA requires
 * per-branch (per-device) sequences, not per-organization.
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

  // TIN-derived code is cosmetic only — it is NOT guaranteed unique across organizations (many orgs
  // have no TIN yet and all fall back to the same literal), and the sequence above resets per
  // (organizationId, branchId). branchId is a global PK, so folding it in makes the whole string
  // globally unique by construction, independent of TIN state or branch count per org.
  const orgCode = organization?.TIN?.replace(/\D/g, '').slice(-4) || 'ORG';
  const year = new Date().getFullYear();

  return { invoiceNumber: `INV-${orgCode}-B${branchId}-${year}-${sequence}`, vsdcInvcNo };
}

/**
 * Allocate a local, non-fiscal receipt number pair for PROFORMA and TRAINING receipts, used as the
 * fallback receipt number printed until VSDC confirms the submission (all receipt types draw their
 * invoice number from the real gapless RRA sequence).
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
