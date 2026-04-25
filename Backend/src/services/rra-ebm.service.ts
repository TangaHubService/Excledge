import { prisma } from '../lib/prisma';
import { config } from '../config';
import type { Prisma } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

type SaleWithRelations = {
  id: number;
  saleNumber: string;
  invoiceNumber: string | null;
  purchaseOrderCode: string | null;
  status: string;
  createdAt: Date;
  paymentType: string;
  cashAmount: Decimal;
  debtAmount: Decimal;
  insuranceAmount: Decimal;
  totalAmount: Decimal;
  taxableAmount: Decimal;
  vatAmount: Decimal;
  branchId: number;
  branch: { id: number; name: string; code: string; bhfId: string | null; address: string | null } | null;
  customer: {
    name: string;
    phone: string;
    TIN: string | null;
    customerType: string;
    email: string | null;
  };
  user: {
    id: number;
    name: string;
  } | null;
  saleItems: Array<{
    productId: number;
    quantity: number;
    unitPrice: Decimal;
    totalPrice: Decimal;
    taxRate: Decimal;
    taxAmount: Decimal;
    taxCode: string | null;
    product: {
      name: string;
      sku: string | null;
      itemCode: string | null;
      itemClassCode: string | null;
      packageUnitCode: string | null;
      quantityUnitCode: string | null;
      barcode: string | null;
      category: string | null;
    };
  }>;
};

export type NormalizedEbmResponse = {
  ebmInvoiceNumber?: string;
  receiptNumber?: string;
  totalReceiptNumber?: string;
  receiptQrPayload?: string;
  verificationCode?: string;
  sdcDateTime?: string;
  internalData?: string;
  receiptSignature?: string;
  sdcId?: string;
  mrcNo?: string;
  resultCode?: string;
  resultMessage?: string;
};

type GatewaySubmitResult = {
  success: boolean;
  error?: string;
  code?: 'VALIDATION' | 'CONFIGURATION' | 'NOT_FISCALIZED' | 'GATEWAY_FAILURE';
  transactionId?: number;
  ebmInvoiceNumber?: string;
};

export type VsdcReferenceSyncSnapshotType =
  | 'INIT_INFO'
  | 'CODE_TABLES'
  | 'BRANCHES'
  | 'NOTICES';
export type VsdcStockSyncSnapshotType =
  | 'BRANCH_MASTER'
  | 'ITEM_MASTER'
  | 'STOCK_MASTER'
  | 'STOCK_MOVEMENTS';
export type VsdcSyncSnapshotType =
  | VsdcReferenceSyncSnapshotType
  | VsdcStockSyncSnapshotType;
export type VsdcReferenceSyncTarget = VsdcReferenceSyncSnapshotType | 'ALL';
export type VsdcStockSyncTarget = VsdcStockSyncSnapshotType | 'ALL';

type VsdcSyncSnapshotSummary = {
  itemCount: number | null;
  groupCount: number | null;
  preview: string[];
  topLevelKeys: string[];
  resultCode: string | null;
  resultMessage: string | null;
};

export type VsdcSyncSnapshotView = {
  snapshotType: VsdcSyncSnapshotType;
  endpointPath: string;
  submissionStatus: 'PENDING' | 'SUBMITTED' | 'SUCCESS' | 'FAILED' | 'RETRYING';
  errorMessage: string | null;
  lastSyncedAt: string | null;
  summary: VsdcSyncSnapshotSummary | null;
};

export type VsdcSyncReport = {
  canSync: boolean;
  gatewayConfigured: boolean;
  mockMode: boolean;
  missingConfigurationFields: string[];
  branchContext: {
    branchId: number | null;
    branchName: string | null;
    branchCode: string | null;
    bhfId: string;
    usedFallbackBhfId: boolean;
  } | null;
  snapshots: {
    initInfo: VsdcSyncSnapshotView | null;
    codeTables: VsdcSyncSnapshotView | null;
    branches: VsdcSyncSnapshotView | null;
    notices: VsdcSyncSnapshotView | null;
  };
};

export type VsdcStockSyncReport = {
  canSync: boolean;
  gatewayConfigured: boolean;
  mockMode: boolean;
  missingConfigurationFields: string[];
  branchContext: {
    branchId: number | null;
    branchName: string | null;
    branchCode: string | null;
    bhfId: string;
    usedFallbackBhfId: boolean;
  } | null;
  summary: {
    activeBranches: number;
    activeProducts: number;
    syncableBranches: number;
    syncableProducts: number;
    blockedBranches: number;
    blockedProducts: number;
    stockPositions: number;
    movementRowsPendingSync: number;
  };
  snapshots: {
    branchMaster: VsdcSyncSnapshotView | null;
    itemMaster: VsdcSyncSnapshotView | null;
    stockMaster: VsdcSyncSnapshotView | null;
    stockMovements: VsdcSyncSnapshotView | null;
  };
};

/** Queue payload shape (v2) — worker reloads sale from DB */
export type EbmQueuePayloadV2 = {
  version: 2;
  saleId: number;
  organizationId: number;
};

type InvoiceSequenceMode = 'unknown' | 'per_org' | 'legacy_sequence';

let invoiceSequenceMode: InvoiceSequenceMode = 'unknown';
let loggedLegacyInvoiceFallback = false;

const vsdcReferenceSyncTargets: readonly VsdcReferenceSyncSnapshotType[] = [
  'INIT_INFO',
  'CODE_TABLES',
  'BRANCHES',
  'NOTICES',
];

const vsdcStockSyncTargets: readonly VsdcStockSyncSnapshotType[] = [
  'BRANCH_MASTER',
  'ITEM_MASTER',
  'STOCK_MASTER',
  'STOCK_MOVEMENTS',
];

type VsdcOrganizationSyncContext = {
  id: number;
  name: string;
  TIN: string | null;
  ebmDeviceId: string | null;
  ebmSerialNo: string | null;
  address: string | null;
  branches: Array<{
    id: number;
    name: string;
    code: string;
    bhfId: string | null;
    status: string;
  }>;
};

type VsdcProductSyncContext = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unitPrice: Decimal;
  itemCode: string | null;
  itemClassCode: string | null;
  packageUnitCode: string | null;
  quantityUnitCode: string | null;
};

type VsdcStockPositionContext = {
  branchId: number;
  productId: number;
  quantity: number;
};

type VsdcStockMovementContext = {
  id: number;
  branchId: number;
  productId: number;
  movementType: string;
  direction: string;
  quantity: number;
  runningBalance: number;
  reference: string | null;
  referenceType: string | null;
  batchNumber: string | null;
  note: string | null;
  createdAt: Date;
};

type VsdcSyncBranchContext = {
  branchId: number | null;
  branchName: string | null;
  branchCode: string | null;
  bhfId: string;
  usedFallbackBhfId: boolean;
};

type VsdcSyncSnapshotRow = {
  snapshotType: string;
  endpointPath: string;
  submissionStatus: string;
  errorMessage: string | null;
  lastSyncedAt: Date | null;
  summary: Prisma.JsonValue | null;
};

const prismaWithVsdcSyncSnapshot = prisma as typeof prisma & {
  vsdcSyncSnapshot: {
    upsert: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<VsdcSyncSnapshotRow[]>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function pickStringFromRecord(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim().length > 0) {
      return String(value);
    }
  }
  return undefined;
}

function firstArrayCandidate(record: Record<string, unknown>, preferredKeys: string[]): unknown[] | null {
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function gatewayErrorMessage(http: { json: unknown | null; status: number }, fallback: string): string {
  if (http.json && typeof http.json === 'object') {
    const rec = http.json as Record<string, unknown>;
    if (rec.message != null && String(rec.message).length > 0) {
      return String(rec.message);
    }
    if (rec.resultMsg != null && String(rec.resultMsg).length > 0) {
      return String(rec.resultMsg);
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

function digitsOnly(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

function normalizeTin(value: string | null | undefined): string | undefined {
  const digits = digitsOnly(value);
  if (!digits) {
    return undefined;
  }

  return digits.slice(-9);
}

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

function roundAmount(value: number): number {
  return Number(value.toFixed(2));
}

function formatVsdcDate(date: Date): string {
  const year = date.getFullYear().toString();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatVsdcDateTime(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${formatVsdcDate(date)}${hours}${minutes}${seconds}`;
}

function vsdcMasterDataError(message: string): never {
  throw new Error(`VSDC master data: ${message}`);
}

type VsdcBranchMasterData = {
  id: number;
  name: string;
  code: string;
  bhfId: string | null;
  isActive?: boolean;
} | null;

type VsdcProductMasterData = {
  id?: number;
  name: string;
  itemCode: string | null;
  itemClassCode: string | null;
  packageUnitCode: string | null;
  quantityUnitCode: string | null;
};

export function assertVsdcBranchMasterData(branch: VsdcBranchMasterData): string {
  if (!branch) {
    vsdcMasterDataError('a branch with a configured BHF ID is required for fiscalization');
  }

  if (branch.isActive === false) {
    vsdcMasterDataError(
      `branch "${branch.name}" is not active and cannot be used for fiscalization`
    );
  }

  const explicitBhfId = digitsOnly(branch.bhfId);
  if (explicitBhfId) {
    const bhfId = explicitBhfId.slice(-2).padStart(2, '0');
    
    if (!/^\d{2}$/.test(bhfId)) {
      vsdcMasterDataError(
        `branch "${branch.name}" BHF ID must be exactly 2 digits after normalization`
      );
    }
    
    return bhfId;
  }

  vsdcMasterDataError(
    `branch "${branch.name}" (${branch.code}) is missing its VSDC BHF ID`
  );
}

export function assertVsdcProductMasterData(
  product: VsdcProductMasterData
): {
  itemCode: string;
  itemClassCode: string;
  packageUnitCode: string;
  quantityUnitCode: string;
} {
  const itemCode = truncateText(product.itemCode, 50);
  if (!itemCode) {
    vsdcMasterDataError(`product "${product.name}" is missing its VSDC item code`);
  }

  let itemClassCode = digitsOnly(product.itemClassCode);
  if (!itemClassCode) {
    vsdcMasterDataError(
      `product "${product.name}" is missing its VSDC item classification code`
    );
  }

  itemClassCode = itemClassCode.slice(0, 10).padStart(10, '0');
  if (!/^\d{10}$/.test(itemClassCode)) {
    vsdcMasterDataError(
      `product "${product.name}" item classification code must be exactly 10 digits (got ${itemClassCode.length})`
    );
  }

  const packageUnitCode = truncateText(product.packageUnitCode, 10);
  if (!packageUnitCode) {
    vsdcMasterDataError(
      `product "${product.name}" is missing its VSDC package unit code`
    );
  }

  const validPackageUnits = ['NT', 'U', 'KG', 'L', 'ME', 'PK', 'BX', 'CS', 'PD', 'TN', 'ML'];
  if (!validPackageUnits.includes(packageUnitCode.toUpperCase())) {
    console.warn(`[VSDC] Product "${product.name}" has non-standard package unit: ${packageUnitCode}`);
  }

  const quantityUnitCode = truncateText(product.quantityUnitCode, 10);
  if (!quantityUnitCode) {
    vsdcMasterDataError(
      `product "${product.name}" is missing its VSDC quantity unit code`
    );
  }

  const validQuantityUnits = ['U', 'KG', 'L', 'ME', 'PK', 'BX', 'NO', 'PR', 'SET', 'PA', 'GRM', 'MTR'];
  if (!validQuantityUnits.includes(quantityUnitCode.toUpperCase())) {
    console.warn(`[VSDC] Product "${product.name}" has non-standard quantity unit: ${quantityUnitCode}`);
  }

  return {
    itemCode,
    itemClassCode,
    packageUnitCode,
    quantityUnitCode,
  };
}

function extractInvoiceSequence(invoiceNumber: string | null, fallback: number): number {
  const groups = invoiceNumber?.match(/\d+/g);
  const lastGroup = groups?.[groups.length - 1];
  const parsed = lastGroup ? Number.parseInt(lastGroup, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mapPaymentTypeToVsdcCode(paymentType: string): string {
  switch (paymentType) {
    case 'CASH':
      return '01';
    case 'DEBT':
      return '02';
    case 'MIXED':
      return '03';
    case 'CREDIT_CARD':
      return '05';
    case 'MOBILE_MONEY':
      return '06';
    case 'INSURANCE':
    default:
      return '07';
  }
}

type VsdcTaxCode = 'A' | 'B' | 'C' | 'D';

function mapInternalTaxCodeToVsdcCode(localCode: string | null, taxRate: number): VsdcTaxCode {
  if (taxRate > 0) {
    if (taxRate === 18) {
      return 'B';
    }
    return 'D';
  }

  switch (localCode) {
    case 'EXEMPT':
    case 'D':
      return 'A';
    case 'ZERO_RATED':
    case 'B':
      return 'C';
    case 'STANDARD':
    case 'A':
      return taxRate > 0 ? 'B' : 'A';
    case 'C':
      return 'C';
    default:
      return 'A';
  }
}

function buildReceiptQrPayload(parts: {
  sdcDateTime?: string;
  sdcId?: string;
  receiptNumber?: string;
  internalData?: string;
  receiptSignature?: string;
}): string | undefined {
  if (!parts.sdcDateTime || !parts.sdcId || !parts.receiptNumber || !parts.internalData || !parts.receiptSignature) {
    return undefined;
  }

  const publishedAt = digitsOnly(parts.sdcDateTime) ?? parts.sdcDateTime;
  return `${publishedAt}#${parts.sdcId}#${parts.receiptNumber}#${parts.internalData}#${parts.receiptSignature}`;
}

function extractOriginalInvoiceSequence(invoiceNumber: string | null, saleId: number): number {
  const sequence = extractInvoiceSequence(invoiceNumber, 0);
  if (sequence <= 0) {
    throw new Error(`Original invoice number is required for VSDC correction submission on sale ${saleId}`);
  }

  return sequence;
}

function mapRefundReasonToVsdcCode(reason?: string, explicitCode?: string): string {
  if (explicitCode && /^(0[1-8])$/.test(explicitCode)) {
    return explicitCode;
  }

  const normalizedReason = reason?.trim().toLowerCase();
  if (!normalizedReason) {
    return '06';
  }

  if (normalizedReason.includes('missing quantity')) {
    return '01';
  }

  if (normalizedReason.includes('missing item')) {
    return '02';
  }

  if (normalizedReason.includes('damaged') || normalizedReason.includes('damage')) {
    return '03';
  }

  if (normalizedReason.includes('wasted') || normalizedReason.includes('waste')) {
    return '04';
  }

  if (normalizedReason.includes('raw material') && normalizedReason.includes('shortage')) {
    return '05';
  }

  if (
    normalizedReason.includes('wrong customer tin') ||
    normalizedReason.includes('customer tin') ||
    normalizedReason.includes('wrong tin')
  ) {
    return '07';
  }

  if (
    normalizedReason.includes('wrong customer name') ||
    normalizedReason.includes('customer name')
  ) {
    return '08';
  }

  return '06';
}

function summarizeTaxBuckets(items: SaleWithRelations['saleItems']) {
  const buckets: Record<VsdcTaxCode, { taxable: number; taxAmount: number; taxRate: number }> = {
    A: { taxable: 0, taxAmount: 0, taxRate: 0 },
    B: { taxable: 0, taxAmount: 0, taxRate: 0 },
    C: { taxable: 0, taxAmount: 0, taxRate: 0 },
    D: { taxable: 0, taxAmount: 0, taxRate: 0 },
  };

  for (const item of items) {
    const code = mapInternalTaxCodeToVsdcCode(item.taxCode, item.taxRate.toNumber());
    const totalAmount = item.totalPrice.toNumber();
    const taxAmount = item.taxAmount.toNumber();
    buckets[code].taxable += totalAmount - taxAmount;
    buckets[code].taxAmount += taxAmount;
    buckets[code].taxRate = Math.max(buckets[code].taxRate, item.taxRate.toNumber());
  }

  return {
    A: {
      taxable: roundAmount(buckets.A.taxable),
      taxAmount: roundAmount(buckets.A.taxAmount),
      taxRate: roundAmount(buckets.A.taxRate),
    },
    B: {
      taxable: roundAmount(buckets.B.taxable),
      taxAmount: roundAmount(buckets.B.taxAmount),
      taxRate: roundAmount(buckets.B.taxRate),
    },
    C: {
      taxable: roundAmount(buckets.C.taxable),
      taxAmount: roundAmount(buckets.C.taxAmount),
      taxRate: roundAmount(buckets.C.taxRate),
    },
    D: {
      taxable: roundAmount(buckets.D.taxable),
      taxAmount: roundAmount(buckets.D.taxAmount),
      taxRate: roundAmount(buckets.D.taxRate),
    },
  };
}

function isGatewayResultSuccessful(normalized: NormalizedEbmResponse): boolean {
  return !normalized.resultCode || normalized.resultCode === '000';
}

function gatewayResultMessage(normalized: NormalizedEbmResponse, fallback: string): string {
  if (normalized.resultMessage && normalized.resultMessage.length > 0) {
    return normalized.resultMessage;
  }

  if (normalized.resultCode && normalized.resultCode.length > 0) {
    return `Gateway returned result code ${normalized.resultCode}`;
  }

  return fallback;
}

export type VsdcErrorCategory = 'SUCCESS' | 'VALIDATION' | 'CONFIGURATION' | 'NETWORK' | 'SERVER' | 'UNKNOWN';

interface VsdcErrorDetail {
  category: VsdcErrorCategory;
  message: string;
  isRecoverable: boolean;
}

const VSDC_ERROR_CODES: Record<string, VsdcErrorDetail> = {
  '000': { category: 'SUCCESS', message: 'Operation succeeded', isRecoverable: false },
  '001': { category: 'SUCCESS', message: 'No search result', isRecoverable: false },
  '881': { category: 'VALIDATION', message: 'Purchase is mandatory', isRecoverable: false },
  '882': { category: 'VALIDATION', message: 'Purchase code is invalid', isRecoverable: false },
  '883': { category: 'VALIDATION', message: 'Purchase already used', isRecoverable: false },
  '884': { category: 'VALIDATION', message: 'Invalid customer TIN provided', isRecoverable: false },
  '891': { category: 'SERVER', message: 'Error creating request URL', isRecoverable: true },
  '892': { category: 'SERVER', message: 'Error creating request header', isRecoverable: true },
  '893': { category: 'VALIDATION', message: 'Error creating request body', isRecoverable: false },
  '894': { category: 'NETWORK', message: 'Server communication error', isRecoverable: true },
  '895': { category: 'SERVER', message: 'Invalid request method', isRecoverable: false },
  '896': { category: 'SERVER', message: 'Invalid request status', isRecoverable: true },
  '899': { category: 'SERVER', message: 'Client error', isRecoverable: true },
  '900': { category: 'CONFIGURATION', message: 'Missing header information', isRecoverable: false },
  '901': { category: 'CONFIGURATION', message: 'Invalid device', isRecoverable: false },
  '902': { category: 'CONFIGURATION', message: 'Device already installed', isRecoverable: false },
  '903': { category: 'CONFIGURATION', message: 'Only VSDC device can be verified', isRecoverable: false },
  '910': { category: 'VALIDATION', message: 'Request parameter error', isRecoverable: false },
  '911': { category: 'VALIDATION', message: 'Missing request data', isRecoverable: false },
  '912': { category: 'VALIDATION', message: 'Request method error', isRecoverable: false },
  '921': { category: 'VALIDATION', message: 'Sales data not found', isRecoverable: false },
  '922': { category: 'VALIDATION', message: 'Sales invoice requires prior sales data', isRecoverable: false },
  '990': { category: 'SERVER', message: 'Maximum views exceeded', isRecoverable: true },
  '991': { category: 'SERVER', message: 'Registration error', isRecoverable: true },
  '992': { category: 'SERVER', message: 'Modification error', isRecoverable: true },
  '993': { category: 'SERVER', message: 'Deletion error', isRecoverable: true },
  '994': { category: 'VALIDATION', message: 'Data overlap', isRecoverable: false },
  '995': { category: 'SERVER', message: 'No downloaded file', isRecoverable: true },
  '999': { category: 'UNKNOWN', message: 'Unknown error - contact administrator', isRecoverable: true },
};

export function getVsdcErrorDetails(resultCode: string): VsdcErrorDetail {
  return VSDC_ERROR_CODES[resultCode] || {
    category: 'UNKNOWN',
    message: `Unexpected error code: ${resultCode}`,
    isRecoverable: true
  };
}

export function isVsdcErrorRecoverable(resultCode: string): boolean {
  const details = getVsdcErrorDetails(resultCode);
  return details.isRecoverable;
}

export function getVsdcErrorCategory(resultCode: string): VsdcErrorCategory {
  return getVsdcErrorDetails(resultCode).category;
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

  const receiptNumber = pick(
    'ebmInvoiceNumber',
    'ebm_invoice_number',
    'receiptNumber',
    'receipt_number',
    'invoiceNumber',
    'fiscalInvoiceNumber',
    'sdcInvoiceNo',
    'rcptNo'
  );
  const totalReceiptNumber = pick('totRcptNo', 'totalReceiptNumber', 'receiptCounterTotal');
  const internalData = pick('internalData', 'intrlData');
  const receiptSignature = pick('receiptSignature', 'rcptSign', 'verificationCode', 'verification_code');
  const sdcDateTime = pick('sdcDateTime', 'sdc_date_time', 'issuedAt', 'timestamp', 'vsdcRcptPbctDate');
  const sdcId = pick('sdcId', 'vsdcId', 'sdc_id');
  const mrcNo = pick('mrcNo', 'mrc_no');
  const resultCode = pick('resultCd', 'resultCode', 'code');
  const resultMessage = pick('resultMsg', 'resultMessage', 'message');
  const receiptQrPayload =
    pick('qrCode', 'qr_code', 'qrPayload', 'qr_payload', 'qrData', 'receiptQr') ??
    buildReceiptQrPayload({
      sdcDateTime,
      sdcId,
      receiptNumber,
      internalData,
      receiptSignature,
    });

  return {
    ebmInvoiceNumber: receiptNumber,
    receiptNumber,
    totalReceiptNumber,
    receiptQrPayload,
    verificationCode: receiptSignature ?? internalData,
    sdcDateTime,
    internalData,
    receiptSignature,
    sdcId,
    mrcNo,
    resultCode,
    resultMessage,
  };
}

function gatewayAvailableForReferenceSync(): boolean {
  return config.ebm.useMock || config.ebm.apiUrl.length > 0;
}

function gatewayAvailableForVsdcSync(): boolean {
  return gatewayAvailableForReferenceSync();
}

async function loadVsdcOrganizationSyncContext(
  organizationId: number
): Promise<VsdcOrganizationSyncContext | null> {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      TIN: true,
      ebmDeviceId: true,
      ebmSerialNo: true,
      address: true,
      branches: {
        where: {
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          code: true,
          bhfId: true,
          status: true,
        },
        orderBy: [{ name: 'asc' }],
      },
    },
  });
}

async function loadVsdcProductsForSync(
  organizationId: number
): Promise<VsdcProductSyncContext[]> {
  return prisma.product.findMany({
    where: {
      organizationId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      category: true,
      unitPrice: true,
      itemCode: true,
      itemClassCode: true,
      packageUnitCode: true,
      quantityUnitCode: true,
    },
    orderBy: [{ name: 'asc' }],
  });
}

async function loadVsdcStockPositions(
  organizationId: number
): Promise<VsdcStockPositionContext[]> {
  const aggregates = await prisma.inventoryLedger.groupBy({
    by: ['branchId', 'productId', 'direction'],
    where: { organizationId },
    _sum: {
      quantity: true,
    },
  });

  const balances = new Map<string, VsdcStockPositionContext>();

  for (const aggregate of aggregates) {
    const key = `${aggregate.branchId}:${aggregate.productId}`;
    const existing = balances.get(key) ?? {
      branchId: aggregate.branchId,
      productId: aggregate.productId,
      quantity: 0,
    };

    const movementQuantity = aggregate._sum.quantity ?? 0;
    existing.quantity += aggregate.direction === 'IN' ? movementQuantity : -movementQuantity;
    balances.set(key, existing);
  }

  return Array.from(balances.values()).filter((position) => position.quantity > 0);
}

async function loadVsdcStockMovements(
  organizationId: number,
  lastSyncedAt?: Date | null
): Promise<VsdcStockMovementContext[]> {
  return prisma.inventoryLedger.findMany({
    where: {
      organizationId,
      ...(lastSyncedAt ? { createdAt: { gt: lastSyncedAt } } : {}),
    },
    select: {
      id: true,
      branchId: true,
      productId: true,
      movementType: true,
      direction: true,
      quantity: true,
      runningBalance: true,
      reference: true,
      referenceType: true,
      batchNumber: true,
      note: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 1000,
  });
}

function resolveVsdcSyncBranchContext(
  branches: VsdcOrganizationSyncContext['branches']
): VsdcSyncBranchContext | null {
  const explicitBranch = branches.find((branch) => digitsOnly(branch.bhfId));
  if (explicitBranch) {
    return {
      branchId: explicitBranch.id,
      branchName: explicitBranch.name,
      branchCode: explicitBranch.code,
      bhfId: digitsOnly(explicitBranch.bhfId)!.slice(-2).padStart(2, '0'),
      usedFallbackBhfId: false,
    };
  }

  const firstBranch = branches[0];
  if (!firstBranch) {
    return {
      branchId: null,
      branchName: null,
      branchCode: null,
      bhfId: '00',
      usedFallbackBhfId: true,
    };
  }

  return {
    branchId: firstBranch.id,
    branchName: firstBranch.name,
    branchCode: firstBranch.code,
    bhfId: '00',
    usedFallbackBhfId: true,
  };
}

function missingVsdcSyncConfigurationFields(org: VsdcOrganizationSyncContext): string[] {
  const missingFields: string[] = [];

  if (!normalizeTin(org.TIN)) {
    missingFields.push('TIN');
  }

  if (!truncateText(org.ebmDeviceId, 100)) {
    missingFields.push('ebmDeviceId');
  }

  if (!truncateText(org.ebmSerialNo, 100)) {
    missingFields.push('ebmSerialNo');
  }

  return missingFields;
}

function branchHasVsdcMasterData(branch: VsdcOrganizationSyncContext['branches'][number]): boolean {
  return Boolean(digitsOnly(branch.bhfId));
}

function productHasVsdcMasterData(product: VsdcProductSyncContext): boolean {
  return Boolean(
    truncateText(product.itemCode, 50) &&
      digitsOnly(product.itemClassCode) &&
      truncateText(product.packageUnitCode, 10) &&
      truncateText(product.quantityUnitCode, 10)
  );
}

function syncPathForSnapshotType(snapshotType: VsdcSyncSnapshotType): string {
  switch (snapshotType) {
    case 'INIT_INFO':
      return config.ebm.initInfoPath;
    case 'CODE_TABLES':
      return config.ebm.codeTablePath;
    case 'BRANCHES':
      return config.ebm.branchLookupPath;
    case 'NOTICES':
      return config.ebm.noticesPath;
    case 'BRANCH_MASTER':
      return config.ebm.branchSavePath;
    case 'ITEM_MASTER':
      return config.ebm.itemSavePath;
    case 'STOCK_MASTER':
      return config.ebm.stockMasterPath;
    case 'STOCK_MOVEMENTS':
      return config.ebm.stockIoPath;
  }
}

function snapshotViewKey(snapshotType: VsdcReferenceSyncSnapshotType): keyof VsdcSyncReport['snapshots'] {
  switch (snapshotType) {
    case 'INIT_INFO':
      return 'initInfo';
    case 'CODE_TABLES':
      return 'codeTables';
    case 'BRANCHES':
      return 'branches';
    case 'NOTICES':
      return 'notices';
  }
}

function stockSnapshotViewKey(
  snapshotType: VsdcStockSyncSnapshotType
): keyof VsdcStockSyncReport['snapshots'] {
  switch (snapshotType) {
    case 'BRANCH_MASTER':
      return 'branchMaster';
    case 'ITEM_MASTER':
      return 'itemMaster';
    case 'STOCK_MASTER':
      return 'stockMaster';
    case 'STOCK_MOVEMENTS':
      return 'stockMovements';
  }
}

export function buildVsdcReferencePayload(params: {
  organization: {
    id: number;
    name: string;
    TIN: string | null;
    ebmDeviceId: string | null;
    ebmSerialNo: string | null;
  };
  branchContext: {
    bhfId: string;
  };
  target: VsdcReferenceSyncSnapshotType;
  lastSyncedAt?: Date | null;
}): Record<string, unknown> {
  return buildVsdcSyncBasePayload({
    organization: params.organization,
    branchContext: params.branchContext,
    includeLastReqDt: params.target !== 'INIT_INFO',
    lastSyncedAt: params.lastSyncedAt,
  });
}

function buildVsdcSyncBasePayload(params: {
  organization: {
    id: number;
    name: string;
    TIN: string | null;
    ebmDeviceId: string | null;
    ebmSerialNo: string | null;
  };
  branchContext: {
    bhfId: string;
  };
  includeLastReqDt?: boolean;
  lastSyncedAt?: Date | null;
}): Record<string, unknown> {
  const tin = normalizeTin(params.organization.TIN);
  if (!tin) {
    throw new Error('Organization TIN is required before running VSDC sync');
  }

  const deviceId = truncateText(params.organization.ebmDeviceId, 100);
  if (!deviceId) {
    throw new Error('Organization VSDC device ID is required before running VSDC sync');
  }

  const serialNumber = truncateText(params.organization.ebmSerialNo, 100);
  if (!serialNumber) {
    throw new Error('Organization VSDC serial number is required before running VSDC sync');
  }

  const basePayload: Record<string, unknown> = {
    tin,
    bhfId: params.branchContext.bhfId,
    dvcId: deviceId,
    dvcSrlNo: serialNumber,
  };

  if (params.includeLastReqDt) {
    basePayload.lastReqDt = formatVsdcDateTime(params.lastSyncedAt ?? new Date('1970-01-01T00:00:00Z'));
  }

  return basePayload;
}

export function buildVsdcBranchMasterPayload(params: {
  organization: {
    id: number;
    name: string;
    TIN: string | null;
    ebmDeviceId: string | null;
    ebmSerialNo: string | null;
  };
  branchContext: {
    bhfId: string;
  };
  branches: VsdcOrganizationSyncContext['branches'];
}): Record<string, unknown> {
  const basePayload = buildVsdcSyncBasePayload({
    organization: params.organization,
    branchContext: params.branchContext,
  });

  return {
    ...basePayload,
    branchList: params.branches.map((branch, index) => ({
      itemSeq: index + 1,
      bhfId: assertVsdcBranchMasterData(branch),
      bhfNm: truncateText(branch.name, 60),
      bhfCd: truncateText(branch.code, 20),
      status: branch.status,
    })),
  };
}

export function buildVsdcItemMasterPayload(params: {
  organization: {
    id: number;
    name: string;
    TIN: string | null;
    ebmDeviceId: string | null;
    ebmSerialNo: string | null;
  };
  branchContext: {
    bhfId: string;
  };
  products: VsdcProductSyncContext[];
}): Record<string, unknown> {
  const basePayload = buildVsdcSyncBasePayload({
    organization: params.organization,
    branchContext: params.branchContext,
  });

  return {
    ...basePayload,
    itemList: params.products.map((product, index) => {
      const masterData = assertVsdcProductMasterData(product);
      return {
        itemSeq: index + 1,
        itemCd: masterData.itemCode,
        itemClsCd: masterData.itemClassCode,
        itemNm: truncateText(product.name, 200),
        pkgUnitCd: masterData.packageUnitCode,
        qtyUnitCd: masterData.quantityUnitCode,
        bcd: truncateText(product.barcode, 20),
        stdPrc: roundAmount(product.unitPrice.toNumber()),
        useYn: 'Y',
      };
    }),
  };
}

export function buildVsdcStockMasterPayload(params: {
  organization: {
    id: number;
    name: string;
    TIN: string | null;
    ebmDeviceId: string | null;
    ebmSerialNo: string | null;
  };
  branchContext: {
    bhfId: string;
  };
  positions: VsdcStockPositionContext[];
  branchesById: Map<number, VsdcOrganizationSyncContext['branches'][number]>;
  productsById: Map<number, VsdcProductSyncContext>;
}): Record<string, unknown> {
  const basePayload = buildVsdcSyncBasePayload({
    organization: params.organization,
    branchContext: params.branchContext,
  });

  return {
    ...basePayload,
    stockMasterList: params.positions.map((position, index) => {
      const branch = params.branchesById.get(position.branchId);
      const product = params.productsById.get(position.productId);
      if (!branch || !product) {
        throw new Error(`Stock master sync is missing branch or product context for position ${position.branchId}:${position.productId}`);
      }

      const branchBhfId = assertVsdcBranchMasterData(branch);
      const masterData = assertVsdcProductMasterData(product);

      return {
        itemSeq: index + 1,
        bhfId: branchBhfId,
        itemCd: masterData.itemCode,
        itemClsCd: masterData.itemClassCode,
        itemNm: truncateText(product.name, 200),
        pkgUnitCd: masterData.packageUnitCode,
        qtyUnitCd: masterData.quantityUnitCode,
        rsdQty: position.quantity,
        stdPrc: roundAmount(product.unitPrice.toNumber()),
      };
    }),
  };
}

export function buildVsdcStockMovementPayload(params: {
  organization: {
    id: number;
    name: string;
    TIN: string | null;
    ebmDeviceId: string | null;
    ebmSerialNo: string | null;
  };
  branchContext: {
    bhfId: string;
  };
  movements: VsdcStockMovementContext[];
  lastSyncedAt?: Date | null;
  branchesById: Map<number, VsdcOrganizationSyncContext['branches'][number]>;
  productsById: Map<number, VsdcProductSyncContext>;
}): Record<string, unknown> {
  const basePayload = buildVsdcSyncBasePayload({
    organization: params.organization,
    branchContext: params.branchContext,
    includeLastReqDt: true,
    lastSyncedAt: params.lastSyncedAt,
  });

  return {
    ...basePayload,
    stockIoList: params.movements.map((movement, index) => {
      const branch = params.branchesById.get(movement.branchId);
      const product = params.productsById.get(movement.productId);
      if (!branch || !product) {
        throw new Error(`Stock movement sync is missing branch or product context for movement ${movement.id}`);
      }

      const branchBhfId = assertVsdcBranchMasterData(branch);
      const masterData = assertVsdcProductMasterData(product);

      return {
        itemSeq: index + 1,
        bhfId: branchBhfId,
        itemCd: masterData.itemCode,
        itemClsCd: masterData.itemClassCode,
        itemNm: truncateText(product.name, 200),
        pkgUnitCd: masterData.packageUnitCode,
        qtyUnitCd: masterData.quantityUnitCode,
        ioTy: movement.direction,
        mvmtTy: movement.movementType,
        qty: movement.quantity,
        rsdQty: movement.runningBalance,
        occrDt: formatVsdcDateTime(movement.createdAt),
        refNo: truncateText(movement.reference, 50),
        refTy: truncateText(movement.referenceType, 50),
        batchNo: truncateText(movement.batchNumber, 50),
        remark: truncateText(movement.note, 200),
      };
    }),
  };
}

function mockVsdcReferenceResponse(
  target: VsdcReferenceSyncSnapshotType,
  organization: VsdcOrganizationSyncContext,
  branchContext: VsdcSyncBranchContext
): Record<string, unknown> {
  const synchronizedAt = new Date().toISOString();

  switch (target) {
    case 'INIT_INFO':
      return {
        resultCd: '000',
        resultMsg: 'Mock init sync success',
        data: {
          tin: normalizeTin(organization.TIN),
          bhfId: branchContext.bhfId,
          dvcId: organization.ebmDeviceId,
          dvcSrlNo: organization.ebmSerialNo,
          taxpayerName: organization.name,
          synchronizedAt,
        },
      };
    case 'CODE_TABLES':
      return {
        resultCd: '000',
        resultMsg: 'Mock code sync success',
        data: {
          codes: [
            { cdCls: 'TAX_TYPE', cd: 'A', cdNm: 'Exempt' },
            { cdCls: 'TAX_TYPE', cd: 'B', cdNm: 'VAT 18%' },
            { cdCls: 'QTY_UNIT', cd: 'EA', cdNm: 'Each' },
            { cdCls: 'PKG_UNIT', cd: 'BX', cdNm: 'Box' },
            { cdCls: 'ITEM_CLASS', cd: '5059690800', cdNm: 'ICT equipment' },
          ],
        },
      };
    case 'BRANCHES':
      return {
        resultCd: '000',
        resultMsg: 'Mock branch sync success',
        data: {
          branches: organization.branches.map((branch) => ({
            bhfId: digitsOnly(branch.bhfId) ?? branchContext.bhfId,
            bhfNm: branch.name,
            bhfCd: branch.code,
          })),
        },
      };
    case 'NOTICES':
      return {
        resultCd: '000',
        resultMsg: 'Mock notices sync success',
        data: {
          notices: [
            {
              noticeNo: 'NOTICE-001',
              title: 'Sandbox notice',
              noticeMsg: 'Mock mode generated notice for verification prep.',
              synchronizedAt,
            },
          ],
        },
      };
  }
}

function mockVsdcStockResponse(params: {
  target: VsdcStockSyncSnapshotType;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  const payloadKey =
    params.target === 'BRANCH_MASTER'
      ? 'branchList'
      : params.target === 'ITEM_MASTER'
        ? 'itemList'
        : params.target === 'STOCK_MASTER'
          ? 'stockMasterList'
          : 'stockIoList';

  const items = Array.isArray(params.payload[payloadKey]) ? (params.payload[payloadKey] as unknown[]) : [];

  return {
    resultCd: '000',
    resultMsg: 'Mock stock sync success',
    data: {
      syncedCount: items.length,
      items: items.slice(0, 5),
    },
  };
}

function extractVsdcSyncCollection(
  snapshotType: VsdcSyncSnapshotType,
  raw: unknown
): unknown[] | null {
  if (!isRecord(raw)) {
    return null;
  }

  const container = isRecord(raw.data) ? raw.data : raw;

  switch (snapshotType) {
    case 'CODE_TABLES':
      return firstArrayCandidate(container, ['codes', 'codeList', 'items', 'list']);
    case 'BRANCHES':
      return firstArrayCandidate(container, ['branches', 'branchList', 'bhfList', 'items', 'list']);
    case 'NOTICES':
      return firstArrayCandidate(container, ['notices', 'noticeList', 'items', 'list']);
    case 'BRANCH_MASTER':
      return firstArrayCandidate(container, ['branchList', 'branches', 'items', 'list']);
    case 'ITEM_MASTER':
      return firstArrayCandidate(container, ['itemList', 'items', 'list']);
    case 'STOCK_MASTER':
      return firstArrayCandidate(container, ['stockMasterList', 'stockList', 'items', 'list']);
    case 'STOCK_MOVEMENTS':
      return firstArrayCandidate(container, ['stockIoList', 'stockMovementList', 'items', 'list']);
    case 'INIT_INFO':
    default:
      return firstArrayCandidate(container, ['items', 'list']);
  }
}

function previewLabelFromEntry(entry: unknown): string | null {
  if (!isRecord(entry)) {
    return null;
  }

  const label =
    pickStringFromRecord(entry, ['cdNm', 'name', 'title', 'bhfNm', 'itemNm', 'noticeMsg']) ??
    pickStringFromRecord(entry, ['cd', 'code', 'bhfId', 'noticeNo', 'itemCd', 'refNo']);

  if (!label) {
    return null;
  }

  const prefix =
    pickStringFromRecord(entry, ['cdCls', 'codeClass', 'mvmtTy']) ??
    pickStringFromRecord(entry, ['cd', 'code', 'bhfId', 'noticeNo', 'itemCd', 'refNo']);

  if (!prefix || prefix === label) {
    return label;
  }

  return `${prefix}: ${label}`;
}

export function summarizeVsdcSyncResponse(
  snapshotType: VsdcSyncSnapshotType,
  raw: unknown,
  normalized: NormalizedEbmResponse
): VsdcSyncSnapshotSummary {
  const container = isRecord(raw) ? (isRecord(raw.data) ? raw.data : raw) : null;
  const topLevelKeys = container ? Object.keys(container).slice(0, 12) : [];
  const collection = extractVsdcSyncCollection(snapshotType, raw);

  if (collection) {
    const preview = collection
      .map((entry) => previewLabelFromEntry(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 5);

    const groupCount =
      snapshotType === 'CODE_TABLES'
        ? new Set(
            collection
              .map((entry) => (isRecord(entry) ? pickStringFromRecord(entry, ['cdCls', 'codeClass']) : undefined))
              .filter((value): value is string => Boolean(value))
          ).size
        : null;

    return {
      itemCount: collection.length,
      groupCount,
      preview,
      topLevelKeys,
      resultCode: normalized.resultCode ?? null,
      resultMessage: normalized.resultMessage ?? null,
    };
  }

  if (container) {
    return {
      itemCount: null,
      groupCount: Object.keys(container).length,
      preview: topLevelKeys.slice(0, 5),
      topLevelKeys,
      resultCode: normalized.resultCode ?? null,
      resultMessage: normalized.resultMessage ?? null,
    };
  }

  return {
    itemCount: null,
    groupCount: null,
    preview: [],
    topLevelKeys: [],
    resultCode: normalized.resultCode ?? null,
    resultMessage: normalized.resultMessage ?? null,
  };
}

function mapVsdcSyncSnapshotView(snapshot: {
  snapshotType: string;
  endpointPath: string;
  submissionStatus: string;
  errorMessage: string | null;
  lastSyncedAt: Date | null;
  summary: Prisma.JsonValue | null;
}): VsdcSyncSnapshotView {
  return {
    snapshotType: snapshot.snapshotType as VsdcSyncSnapshotType,
    endpointPath: snapshot.endpointPath,
    submissionStatus: snapshot.submissionStatus as VsdcSyncSnapshotView['submissionStatus'],
    errorMessage: snapshot.errorMessage,
    lastSyncedAt: snapshot.lastSyncedAt ? snapshot.lastSyncedAt.toISOString() : null,
    summary: (snapshot.summary as VsdcSyncSnapshotSummary | null) ?? null,
  };
}

async function saveVsdcSyncSnapshot(params: {
  organizationId: number;
  snapshotType: VsdcSyncSnapshotType;
  endpointPath: string;
  submissionStatus: 'SUCCESS' | 'FAILED';
  requestPayload: Record<string, unknown>;
  responseData: unknown;
  summary: VsdcSyncSnapshotSummary;
  errorMessage?: string | null;
}) {
  return prismaWithVsdcSyncSnapshot.vsdcSyncSnapshot.upsert({
    where: {
      organizationId_snapshotType: {
        organizationId: params.organizationId,
        snapshotType: params.snapshotType,
      },
    },
    update: {
      endpointPath: params.endpointPath,
      submissionStatus: params.submissionStatus,
      requestPayload: toJsonValue(params.requestPayload),
      responseData: toJsonValue(params.responseData),
      summary: toJsonValue(params.summary),
      errorMessage: params.errorMessage ?? null,
      lastSyncedAt: new Date(),
    },
    create: {
      organizationId: params.organizationId,
      snapshotType: params.snapshotType,
      endpointPath: params.endpointPath,
      submissionStatus: params.submissionStatus,
      requestPayload: toJsonValue(params.requestPayload),
      responseData: toJsonValue(params.responseData),
      summary: toJsonValue(params.summary),
      errorMessage: params.errorMessage ?? null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function getOrganizationVsdcSyncReport(
  organizationId: number
): Promise<VsdcSyncReport> {
  const organization = await loadVsdcOrganizationSyncContext(organizationId);
  if (!organization) {
    throw new Error('Organization not found');
  }

  const [snapshots] = await Promise.all([
    prismaWithVsdcSyncSnapshot.vsdcSyncSnapshot.findMany({
      where: {
        organizationId,
        snapshotType: { in: [...vsdcReferenceSyncTargets] },
      },
      orderBy: [{ snapshotType: 'asc' }],
      select: {
        snapshotType: true,
        endpointPath: true,
        submissionStatus: true,
        errorMessage: true,
        lastSyncedAt: true,
        summary: true,
      },
    }),
  ]);

  const missingConfigurationFields = missingVsdcSyncConfigurationFields(organization);
  const branchContext = resolveVsdcSyncBranchContext(organization.branches);

  const report: VsdcSyncReport = {
    canSync: gatewayAvailableForVsdcSync() && missingConfigurationFields.length === 0,
    gatewayConfigured: gatewayAvailableForVsdcSync(),
    mockMode: config.ebm.useMock,
    missingConfigurationFields,
    branchContext,
    snapshots: {
      initInfo: null,
      codeTables: null,
      branches: null,
      notices: null,
    },
  };

  for (const snapshot of snapshots) {
    const key = snapshotViewKey(snapshot.snapshotType as VsdcReferenceSyncSnapshotType);
    report.snapshots[key] = mapVsdcSyncSnapshotView(snapshot);
  }

  return report;
}

export async function getOrganizationVsdcStockSyncReport(
  organizationId: number
): Promise<VsdcStockSyncReport> {
  const organization = await loadVsdcOrganizationSyncContext(organizationId);
  if (!organization) {
    throw new Error('Organization not found');
  }

  const [products, stockPositions, snapshots] = await Promise.all([
    loadVsdcProductsForSync(organizationId),
    loadVsdcStockPositions(organizationId),
    prismaWithVsdcSyncSnapshot.vsdcSyncSnapshot.findMany({
      where: {
        organizationId,
        snapshotType: { in: [...vsdcStockSyncTargets] },
      },
      orderBy: [{ snapshotType: 'asc' }],
      select: {
        snapshotType: true,
        endpointPath: true,
        submissionStatus: true,
        errorMessage: true,
        lastSyncedAt: true,
        summary: true,
      },
    }),
  ]);

  const branchContext = resolveVsdcSyncBranchContext(organization.branches);
  const missingConfigurationFields = missingVsdcSyncConfigurationFields(organization);
  const syncableBranches = organization.branches.filter(branchHasVsdcMasterData).length;
  const syncableProducts = products.filter(productHasVsdcMasterData).length;

  const stockMovementSnapshot = snapshots.find(
    (snapshot) => snapshot.snapshotType === 'STOCK_MOVEMENTS'
  );
  const recentMovements = await loadVsdcStockMovements(
    organizationId,
    stockMovementSnapshot?.lastSyncedAt ?? null
  );

  const report: VsdcStockSyncReport = {
    canSync:
      gatewayAvailableForVsdcSync() &&
      missingConfigurationFields.length === 0 &&
      syncableBranches === organization.branches.length &&
      syncableProducts === products.length,
    gatewayConfigured: gatewayAvailableForVsdcSync(),
    mockMode: config.ebm.useMock,
    missingConfigurationFields,
    branchContext,
    summary: {
      activeBranches: organization.branches.length,
      activeProducts: products.length,
      syncableBranches,
      syncableProducts,
      blockedBranches: organization.branches.length - syncableBranches,
      blockedProducts: products.length - syncableProducts,
      stockPositions: stockPositions.length,
      movementRowsPendingSync: recentMovements.length,
    },
    snapshots: {
      branchMaster: null,
      itemMaster: null,
      stockMaster: null,
      stockMovements: null,
    },
  };

  for (const snapshot of snapshots) {
    const key = stockSnapshotViewKey(snapshot.snapshotType as VsdcStockSyncSnapshotType);
    report.snapshots[key] = mapVsdcSyncSnapshotView(snapshot);
  }

  return report;
}

export async function runOrganizationVsdcReferenceSync(params: {
  organizationId: number;
  target?: VsdcReferenceSyncTarget;
}): Promise<VsdcSyncReport> {
  const target = params.target ?? 'ALL';
  const syncTargets =
    target === 'ALL'
      ? [...vsdcReferenceSyncTargets]
      : vsdcReferenceSyncTargets.filter((snapshotType) => snapshotType === target);

  if (syncTargets.length === 0) {
    throw new Error(`Unsupported VSDC sync target: ${target}`);
  }

  const organization = await loadVsdcOrganizationSyncContext(params.organizationId);
  if (!organization) {
    throw new Error('Organization not found');
  }

  if (!gatewayAvailableForVsdcSync()) {
    throw new Error('Configure EBM_API_URL or enable EBM_USE_MOCK before running VSDC reference sync');
  }

  const missingConfigurationFields = missingVsdcSyncConfigurationFields(organization);
  if (missingConfigurationFields.length > 0) {
    throw new Error(
      `Complete required organization VSDC fields before running reference sync: ${missingConfigurationFields.join(', ')}`
    );
  }

  const branchContext = resolveVsdcSyncBranchContext(organization.branches);
  if (!branchContext) {
    throw new Error('At least one branch is required before running VSDC reference sync');
  }

  const existingSnapshots = await prismaWithVsdcSyncSnapshot.vsdcSyncSnapshot.findMany({
    where: {
      organizationId: params.organizationId,
      snapshotType: { in: syncTargets },
    },
    select: {
      snapshotType: true,
      lastSyncedAt: true,
    },
  });

  const lastSyncedAtByType = new Map<VsdcReferenceSyncSnapshotType, Date | null>(
    existingSnapshots.map((snapshot) => [snapshot.snapshotType as VsdcReferenceSyncSnapshotType, snapshot.lastSyncedAt] as const)
  );

  for (const snapshotType of syncTargets) {
    const endpointPath = syncPathForSnapshotType(snapshotType);
    const requestPayload = buildVsdcReferencePayload({
      organization,
      branchContext,
      target: snapshotType,
      lastSyncedAt: lastSyncedAtByType.get(snapshotType) ?? null,
    });

    try {
      const rawResponse = config.ebm.useMock
        ? mockVsdcReferenceResponse(snapshotType, organization, branchContext)
        : await postToGateway(endpointPath, requestPayload);

      const httpEnvelope = isRecord(rawResponse) && 'ok' in rawResponse && 'status' in rawResponse
        ? (rawResponse as { ok: boolean; status: number; json: unknown | null; rawText: string })
        : null;

      const responseBody = httpEnvelope ? httpEnvelope.json ?? httpEnvelope.rawText : rawResponse;
      const normalized = parseGatewayResponse(responseBody);
      const success = httpEnvelope
        ? httpEnvelope.ok && isGatewayResultSuccessful(normalized)
        : isGatewayResultSuccessful(normalized);
      const failureMessage = httpEnvelope
        ? gatewayErrorMessage(httpEnvelope, `VSDC reference sync failed for ${snapshotType}`)
        : gatewayResultMessage(normalized, `VSDC reference sync failed for ${snapshotType}`);
      const summary = summarizeVsdcSyncResponse(snapshotType, responseBody, normalized);

      await saveVsdcSyncSnapshot({
        organizationId: params.organizationId,
        snapshotType,
        endpointPath,
        submissionStatus: success ? 'SUCCESS' : 'FAILED',
        requestPayload,
        responseData: {
          raw: responseBody,
          normalized,
          httpStatus: httpEnvelope?.status ?? null,
        },
        summary,
        errorMessage: success ? null : failureMessage,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `VSDC reference sync failed for ${snapshotType}`;
      const summary = summarizeVsdcSyncResponse(snapshotType, null, {
        resultCode: undefined,
        resultMessage: message,
      });

      await saveVsdcSyncSnapshot({
        organizationId: params.organizationId,
        snapshotType,
        endpointPath,
        submissionStatus: 'FAILED',
        requestPayload,
        responseData: { error: message },
        summary,
        errorMessage: message,
      });
    }
  }

  return getOrganizationVsdcSyncReport(params.organizationId);
}

export async function runOrganizationVsdcStockSync(params: {
  organizationId: number;
  target?: VsdcStockSyncTarget;
}): Promise<VsdcStockSyncReport> {
  const target = params.target ?? 'ALL';
  const syncTargets =
    target === 'ALL'
      ? [...vsdcStockSyncTargets]
      : vsdcStockSyncTargets.filter((snapshotType) => snapshotType === target);

  if (syncTargets.length === 0) {
    throw new Error(`Unsupported VSDC stock sync target: ${target}`);
  }

  const organization = await loadVsdcOrganizationSyncContext(params.organizationId);
  if (!organization) {
    throw new Error('Organization not found');
  }

  if (!gatewayAvailableForVsdcSync()) {
    throw new Error('Configure EBM_API_URL or enable EBM_USE_MOCK before running VSDC stock sync');
  }

  const missingConfigurationFields = missingVsdcSyncConfigurationFields(organization);
  if (missingConfigurationFields.length > 0) {
    throw new Error(
      `Complete required organization VSDC fields before running stock sync: ${missingConfigurationFields.join(', ')}`
    );
  }

  const branchContext = resolveVsdcSyncBranchContext(organization.branches);
  if (!branchContext) {
    throw new Error('At least one branch is required before running VSDC stock sync');
  }

  const products = await loadVsdcProductsForSync(params.organizationId);
  const blockedBranchCount = organization.branches.filter((branch) => !branchHasVsdcMasterData(branch)).length;
  const blockedProductCount = products.filter((product) => !productHasVsdcMasterData(product)).length;

  if (blockedBranchCount > 0 || blockedProductCount > 0) {
    const messages: string[] = [];
    if (blockedBranchCount > 0) {
      messages.push(`${blockedBranchCount} active branch(es) are missing BHF ID`);
    }
    if (blockedProductCount > 0) {
      messages.push(`${blockedProductCount} active product(s) are missing VSDC item/unit codes`);
    }
    throw new Error(`Complete stock-sync master data first: ${messages.join('; ')}`);
  }

  const existingSnapshots = await prismaWithVsdcSyncSnapshot.vsdcSyncSnapshot.findMany({
    where: {
      organizationId: params.organizationId,
      snapshotType: { in: [...syncTargets] },
    },
    select: {
      snapshotType: true,
      lastSyncedAt: true,
    },
  });

  const lastSyncedAtByType = new Map<VsdcStockSyncSnapshotType, Date | null>(
    existingSnapshots.map((snapshot) => [snapshot.snapshotType as VsdcStockSyncSnapshotType, snapshot.lastSyncedAt] as const)
  );
  const branchesById = new Map(organization.branches.map((branch) => [branch.id, branch] as const));
  const productsById = new Map(products.map((product) => [product.id, product] as const));

  for (const snapshotType of syncTargets) {
    const endpointPath = syncPathForSnapshotType(snapshotType);
    const lastSyncedAt = lastSyncedAtByType.get(snapshotType) ?? null;
    const stockPositions =
      snapshotType === 'STOCK_MASTER' ? await loadVsdcStockPositions(params.organizationId) : [];
    const stockMovements =
      snapshotType === 'STOCK_MOVEMENTS'
        ? await loadVsdcStockMovements(params.organizationId, lastSyncedAt)
        : [];

    const requestPayload =
      snapshotType === 'BRANCH_MASTER'
        ? buildVsdcBranchMasterPayload({
            organization,
            branchContext,
            branches: organization.branches,
          })
        : snapshotType === 'ITEM_MASTER'
          ? buildVsdcItemMasterPayload({
              organization,
              branchContext,
              products,
            })
          : snapshotType === 'STOCK_MASTER'
            ? buildVsdcStockMasterPayload({
                organization,
                branchContext,
                positions: stockPositions,
                branchesById,
                productsById,
              })
            : buildVsdcStockMovementPayload({
                organization,
                branchContext,
                movements: stockMovements,
                lastSyncedAt,
                branchesById,
                productsById,
              });

    try {
      const rawResponse = config.ebm.useMock
        ? mockVsdcStockResponse({ target: snapshotType, payload: requestPayload })
        : await postToGateway(endpointPath, requestPayload);

      const httpEnvelope = isRecord(rawResponse) && 'ok' in rawResponse && 'status' in rawResponse
        ? (rawResponse as { ok: boolean; status: number; json: unknown | null; rawText: string })
        : null;

      const responseBody = httpEnvelope ? httpEnvelope.json ?? httpEnvelope.rawText : rawResponse;
      const normalized = parseGatewayResponse(responseBody);
      const success = httpEnvelope
        ? httpEnvelope.ok && isGatewayResultSuccessful(normalized)
        : isGatewayResultSuccessful(normalized);
      const failureMessage = httpEnvelope
        ? gatewayErrorMessage(httpEnvelope, `VSDC stock sync failed for ${snapshotType}`)
        : gatewayResultMessage(normalized, `VSDC stock sync failed for ${snapshotType}`);
      const summary = summarizeVsdcSyncResponse(snapshotType, responseBody, normalized);

      await saveVsdcSyncSnapshot({
        organizationId: params.organizationId,
        snapshotType,
        endpointPath,
        submissionStatus: success ? 'SUCCESS' : 'FAILED',
        requestPayload,
        responseData: {
          raw: responseBody,
          normalized,
          httpStatus: httpEnvelope?.status ?? null,
        },
        summary,
        errorMessage: success ? null : failureMessage,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `VSDC stock sync failed for ${snapshotType}`;
      const summary = summarizeVsdcSyncResponse(snapshotType, null, {
        resultCode: undefined,
        resultMessage: message,
      });

      await saveVsdcSyncSnapshot({
        organizationId: params.organizationId,
        snapshotType,
        endpointPath,
        submissionStatus: 'FAILED',
        requestPayload,
        responseData: { error: message },
        summary,
        errorMessage: message,
      });
    }
  }

  return getOrganizationVsdcStockSyncReport(params.organizationId);
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

async function nextInvoiceSequenceFromCounterTable(organizationId: number): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ nextSequence: number }>>`
    INSERT INTO "organization_invoice_counters" ("organizationId", "nextSequence", "updatedAt")
    VALUES (${organizationId}, 1, NOW())
    ON CONFLICT ("organizationId") DO UPDATE
    SET "nextSequence" = "organization_invoice_counters"."nextSequence" + 1,
        "updatedAt" = NOW()
    RETURNING "nextSequence"
  `;

  return Number(rows[0]?.nextSequence ?? 0);
}

async function nextInvoiceSequenceFromLegacySequence(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ nextSequence: bigint | number }>>`
    SELECT nextval('invoice_seq')::bigint AS "nextSequence"
  `;

  return Number(rows[0]?.nextSequence ?? 0);
}

async function allocateNextInvoiceSequence(organizationId: number): Promise<number> {
  if (invoiceSequenceMode === 'per_org') {
    return nextInvoiceSequenceFromCounterTable(organizationId);
  }

  if (invoiceSequenceMode === 'legacy_sequence') {
    return nextInvoiceSequenceFromLegacySequence();
  }

  try {
    const sequence = await nextInvoiceSequenceFromCounterTable(organizationId);
    invoiceSequenceMode = 'per_org';
    return sequence;
  } catch (error) {
    if (!isMissingDatabaseObjectError(error, 'organization_invoice_counters')) {
      throw error;
    }
  }

  try {
    const sequence = await nextInvoiceSequenceFromLegacySequence();
    invoiceSequenceMode = 'legacy_sequence';

    if (!loggedLegacyInvoiceFallback) {
      loggedLegacyInvoiceFallback = true;
      console.warn(
        '[EBM] Falling back to legacy invoice_seq because organization_invoice_counters is missing. Apply the latest Prisma migrations to enable per-organization invoice counters.'
      );
    }

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

export function buildSaleGatewayPayload(
  sale: SaleWithRelations,
  org: { TIN: string | null; ebmDeviceId: string | null; ebmSerialNo: string | null; name: string; address: string | null }
) {
  const tin = normalizeTin(org.TIN);
  if (!tin) {
    throw new Error('Organization TIN is required for VSDC sale submission');
  }

  const invcNo = extractInvoiceSequence(sale.invoiceNumber, sale.id);
  const customerTin = normalizeTin(sale.customer.TIN) ?? null;
  const bhfId = assertVsdcBranchMasterData(sale.branch);
  const taxBuckets = summarizeTaxBuckets(sale.saleItems);
  const registrantName = truncateText(sale.user?.name ?? org.name, 60) ?? 'Excledge';
  const registrantId = String(sale.user?.id ?? sale.id);
  const purchaseCode =
    sale.customer.customerType === 'CORPORATE'
      ? truncateText(sale.purchaseOrderCode, 50) ?? (customerTin ? '000000' : undefined)
      : undefined;

  return {
    tin,
    bhfId,
    invcNo,
    orgInvcNo: 0,
    custTin: customerTin,
    prcOrdCd: purchaseCode,
    custNm: truncateText(sale.customer.name, 60),
    salesTyCd: 'N',
    rcptTyCd: 'S',
    pmtTyCd: mapPaymentTypeToVsdcCode(sale.paymentType),
    salesSttsCd: '02',
    cfmDt: formatVsdcDateTime(sale.createdAt),
    salesDt: formatVsdcDate(sale.createdAt),
    stockRlsDt: formatVsdcDateTime(sale.createdAt),
    cnclReqDt: null,
    cnclDt: null,
    rfdDt: null,
    rfdRsnCd: null,
    totItemCnt: sale.saleItems.length,
    taxblAmtA: taxBuckets.A.taxable,
    taxblAmtB: taxBuckets.B.taxable,
    taxblAmtC: taxBuckets.C.taxable,
    taxblAmtD: taxBuckets.D.taxable,
    taxRtA: taxBuckets.A.taxRate,
    taxRtB: taxBuckets.B.taxRate,
    taxRtC: taxBuckets.C.taxRate,
    taxRtD: taxBuckets.D.taxRate,
    taxAmtA: taxBuckets.A.taxAmount,
    taxAmtB: taxBuckets.B.taxAmount,
    taxAmtC: taxBuckets.C.taxAmount,
    taxAmtD: taxBuckets.D.taxAmount,
    totTaxblAmt: roundAmount(sale.taxableAmount.toNumber()),
    totTaxAmt: roundAmount(sale.vatAmount.toNumber()),
    totAmt: roundAmount(sale.totalAmount.toNumber()),
    prchrAcptcYn: 'N',
    remark: truncateText(`Excledge sale ${sale.saleNumber}`, 400),
    regrNm: registrantName,
    regrId: registrantId,
    modrNm: registrantName,
    modrId: registrantId,
    receipt: {
      custTin: customerTin,
      custMblNo: truncateText(sale.customer.phone, 20),
      rptNo: invcNo,
      trdeNm: truncateText(org.name, 20) ?? '',
      adrs: truncateText(sale.branch?.address ?? org.address, 200),
      topMsg: null,
      btmMsg: null,
      prchrAcptcYn: 'N',
    },
    itemList: sale.saleItems.map((item, index) => {
      const itemMasterData = assertVsdcProductMasterData(item.product);
      const totalPrice = roundAmount(item.totalPrice.toNumber());
      const taxAmount = roundAmount(item.taxAmount.toNumber());
      const taxableAmount = roundAmount(item.totalPrice.toNumber() - item.taxAmount.toNumber());

      return {
        itemSeq: index + 1,
        itemClsCd: itemMasterData.itemClassCode,
        itemCd: itemMasterData.itemCode,
        itemNm: truncateText(item.product.name, 200) ?? `Product ${item.productId}`,
        bcd: truncateText(item.product.barcode, 20),
        pkgUnitCd: itemMasterData.packageUnitCode,
        pkg: item.quantity,
        qtyUnitCd: itemMasterData.quantityUnitCode,
        qty: item.quantity,
        prc: roundAmount(item.unitPrice.toNumber()),
        splyAmt: totalPrice,
        dcRt: 0,
        dcAmt: 0,
        isrccCd: null,
        isrccNm: null,
        isrcRt: null,
        isrcAmt: null,
        taxTyCd: mapInternalTaxCodeToVsdcCode(item.taxCode, item.taxRate.toNumber()),
        taxblAmt: taxableAmount,
        taxAmt: taxAmount,
        totAmt: totalPrice,
      };
    }),
  };
}

export function buildRefundGatewayPayload(params: {
  originalSale: SaleWithRelations;
  refundInvoiceNumber: string;
  refundedAt: Date;
  reason?: string;
  reasonCode?: string;
  org: { TIN: string | null; ebmDeviceId: string | null; ebmSerialNo: string | null; name: string; address: string | null };
}) {
  const basePayload = buildSaleGatewayPayload(
    {
      ...params.originalSale,
      invoiceNumber: params.refundInvoiceNumber,
      createdAt: params.refundedAt,
      status: 'REFUNDED',
    },
    params.org
  );

  return {
    ...basePayload,
    orgInvcNo: extractOriginalInvoiceSequence(params.originalSale.invoiceNumber, params.originalSale.id),
    rcptTyCd: 'R',
    salesSttsCd: '05',
    cfmDt: formatVsdcDateTime(params.refundedAt),
    salesDt: formatVsdcDate(params.refundedAt),
    stockRlsDt: null,
    cnclReqDt: null,
    cnclDt: null,
    rfdDt: formatVsdcDateTime(params.refundedAt),
    rfdRsnCd: mapRefundReasonToVsdcCode(params.reason, params.reasonCode),
    remark: truncateText(
      `Refund for ${params.originalSale.saleNumber}${params.reason ? `: ${params.reason}` : ''}`,
      400
    ),
  };
}

export function buildCancelGatewayPayload(params: {
  originalSale: SaleWithRelations;
  cancelInvoiceNumber: string;
  cancelledAt: Date;
  reason?: string;
  org: { TIN: string | null; ebmDeviceId: string | null; ebmSerialNo: string | null; name: string; address: string | null };
}) {
  const basePayload = buildSaleGatewayPayload(
    {
      ...params.originalSale,
      invoiceNumber: params.cancelInvoiceNumber,
      createdAt: params.cancelledAt,
      status: 'CANCELLED',
    },
    params.org
  );

  return {
    ...basePayload,
    orgInvcNo: extractOriginalInvoiceSequence(params.originalSale.invoiceNumber, params.originalSale.id),
    rcptTyCd: 'S',
    salesSttsCd: '04',
    cfmDt: formatVsdcDateTime(params.cancelledAt),
    salesDt: formatVsdcDate(params.cancelledAt),
    stockRlsDt: null,
    cnclReqDt: formatVsdcDateTime(params.cancelledAt),
    cnclDt: formatVsdcDateTime(params.cancelledAt),
    rfdDt: null,
    rfdRsnCd: null,
    remark: truncateText(
      `Cancellation for ${params.originalSale.saleNumber}${params.reason ? `: ${params.reason}` : ''}`,
      400
    ),
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
  const sequence = (await allocateNextInvoiceSequence(organizationId))
    .toString()
    .padStart(6, '0');

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
      user: true,
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
    if (sale.status === 'PENDING') {
      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'COMPLETED' },
      });
    }
    return { success: true, ebmInvoiceNumber: already.ebmInvoiceNumber };
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true, address: true },
  });

  if (!org) {
    return { success: false, error: 'Organization not found' };
  }

  let payload: ReturnType<typeof buildSaleGatewayPayload>;
  try {
    payload = buildSaleGatewayPayload(sale, org);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build VSDC sale payload';
    return { success: false, error: message };
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
          normalized: {
            ebmInvoiceNumber: mockRef,
            receiptNumber: mockRef,
            resultCode: '000',
            resultMessage: 'Mock success',
          },
        } as object,
      },
    });
    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: 'COMPLETED' },
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
    const isVsdcSuccess = !normalized.resultCode || normalized.resultCode === '000';

    if (!http.ok || !isVsdcSuccess || !normalized.ebmInvoiceNumber) {
      const msg = normalized.resultMessage ?? gatewayErrorMessage(http, `Gateway HTTP ${http.status}`);
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

    if (sale.status === 'PENDING') {
      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: 'COMPLETED' },
      });
    }

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
  refundInvoiceNumber: string;
  refundedAt: Date;
  reason?: string;
  reasonCode?: string;
}): Promise<GatewaySubmitResult> {
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
    return {
      success: false,
      code: 'NOT_FISCALIZED',
      error: 'Original sale has no successful VSDC submission to refund',
    };
  }

  const [originalSale, org] = await Promise.all([
    prisma.sale.findFirst({
      where: { id: params.originalSaleId, organizationId: params.organizationId },
      include: {
        saleItems: { include: { product: true } },
        customer: true,
        branch: true,
        user: true,
      },
    }),
    prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true, address: true },
    }),
  ]);

  if (!originalSale || !org) {
    return { success: false, code: 'VALIDATION', error: 'Refund EBM: missing sale or organization' };
  }

  let body: ReturnType<typeof buildRefundGatewayPayload>;
  try {
    body = buildRefundGatewayPayload({
      originalSale: originalSale as SaleWithRelations,
      refundInvoiceNumber: params.refundInvoiceNumber,
      refundedAt: params.refundedAt,
      reason: params.reason,
      reasonCode: params.reasonCode,
      org,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build VSDC refund payload';
    return { success: false, code: 'VALIDATION', error: message };
  }

  const refundRow = await prisma.ebmTransaction.create({
    data: {
      organizationId: params.organizationId,
      saleId: params.originalSaleId,
      invoiceNumber: params.refundInvoiceNumber,
      operation: 'REFUND',
      submissionStatus: 'PENDING',
    },
  });

  if (config.ebm.useMock) {
    const mockRef = `MOCK-REFUND-${refundRow.id}`;
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: mockRef,
        submittedAt: new Date(),
        responseData: { mock: true, requestPayload: body } as object,
      },
    });
    return { success: true, transactionId: refundRow.id, ebmInvoiceNumber: mockRef };
  }

  if (!config.ebm.apiUrl) {
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: {
        submissionStatus: 'FAILED',
        errorMessage: 'EBM_API_URL is not configured',
      },
    });
    return { success: false, code: 'CONFIGURATION', error: 'EBM_API_URL is not configured' };
  }

  try {
    const http = await postToGateway(config.ebm.refundPath, body);
    const normalized = parseGatewayResponse(http.json ?? http.rawText);
    if (!http.ok || !isGatewayResultSuccessful(normalized) || !normalized.ebmInvoiceNumber) {
      const msg = !http.ok
        ? gatewayErrorMessage(http, `Refund gateway HTTP ${http.status}`)
        : gatewayResultMessage(normalized, 'Refund gateway rejected the correction submission');
      await prisma.ebmTransaction.update({
        where: { id: refundRow.id },
        data: {
          submissionStatus: 'FAILED',
          errorMessage: msg,
          responseData: { raw: http.json ?? http.rawText, normalized, requestPayload: body } as object,
        },
      });
      return { success: false, code: 'GATEWAY_FAILURE', error: msg };
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
    return {
      success: true,
      transactionId: refundRow.id,
      ebmInvoiceNumber: normalized.ebmInvoiceNumber ?? `REFUND-ACK-${refundRow.id}`,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Refund EBM failed';
    await prisma.ebmTransaction.update({
      where: { id: refundRow.id },
      data: { submissionStatus: 'FAILED', errorMessage: message },
    });
    return { success: false, code: 'GATEWAY_FAILURE', error: message };
  }
}

/**
 * Void/cancel a fiscalized sale at the gateway when supported by RRA spec.
 */
export async function submitVoidToEbm(params: {
  organizationId: number;
  saleId: number;
  cancelInvoiceNumber: string;
  cancelledAt: Date;
  reason?: string;
}): Promise<GatewaySubmitResult> {
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
    return {
      success: false,
      code: 'NOT_FISCALIZED',
      error: 'Original sale has no successful VSDC submission to cancel',
    };
  }

  const sale = (await prisma.sale.findFirst({
    where: { id: params.saleId, organizationId: params.organizationId },
    include: {
      saleItems: { include: { product: true } },
      customer: true,
      branch: true,
      user: true,
    },
  })) as SaleWithRelations | null;

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true, address: true },
  });

  if (!sale || !org) {
    return { success: false, code: 'VALIDATION', error: 'Void EBM: missing sale or organization' };
  }

  let body: ReturnType<typeof buildCancelGatewayPayload>;
  try {
    body = buildCancelGatewayPayload({
      originalSale: sale,
      cancelInvoiceNumber: params.cancelInvoiceNumber,
      cancelledAt: params.cancelledAt,
      reason: params.reason,
      org,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build VSDC cancel payload';
    return { success: false, code: 'VALIDATION', error: message };
  }

  const voidRow = await prisma.ebmTransaction.create({
    data: {
      organizationId: params.organizationId,
      saleId: params.saleId,
      invoiceNumber: params.cancelInvoiceNumber,
      operation: 'VOID',
      submissionStatus: 'PENDING',
    },
  });

  if (config.ebm.useMock) {
    const mockRef = `MOCK-VOID-${voidRow.id}`;
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: {
        submissionStatus: 'SUCCESS',
        ebmInvoiceNumber: mockRef,
        submittedAt: new Date(),
        responseData: { mock: true, requestPayload: body } as object,
      },
    });
    return { success: true, transactionId: voidRow.id, ebmInvoiceNumber: mockRef };
  }

  if (!config.ebm.apiUrl) {
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: {
        submissionStatus: 'FAILED',
        errorMessage: 'EBM_API_URL is not configured',
      },
    });
    return { success: false, code: 'CONFIGURATION', error: 'EBM_API_URL is not configured' };
  }

  try {
    const http = await postToGateway(config.ebm.voidPath, body);
    const normalized = parseGatewayResponse(http.json ?? http.rawText);
    if (!http.ok || !isGatewayResultSuccessful(normalized) || !normalized.ebmInvoiceNumber) {
      const msg = !http.ok
        ? gatewayErrorMessage(http, `Void gateway HTTP ${http.status}`)
        : gatewayResultMessage(normalized, 'Void gateway rejected the cancellation submission');
      await prisma.ebmTransaction.update({
        where: { id: voidRow.id },
        data: {
          submissionStatus: 'FAILED',
          errorMessage: msg,
          responseData: { raw: http.json ?? http.rawText, normalized, requestPayload: body } as object,
        },
      });
      return { success: false, code: 'GATEWAY_FAILURE', error: msg };
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
    return {
      success: true,
      transactionId: voidRow.id,
      ebmInvoiceNumber: normalized.ebmInvoiceNumber ?? `VOID-ACK-${voidRow.id}`,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Void EBM failed';
    await prisma.ebmTransaction.update({
      where: { id: voidRow.id },
      data: { submissionStatus: 'FAILED', errorMessage: message },
    });
    return { success: false, code: 'GATEWAY_FAILURE', error: message };
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
