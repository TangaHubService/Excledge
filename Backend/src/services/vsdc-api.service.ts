import { prisma } from '../lib/prisma';
import { config } from '../config';

/** RRA EBM API may require a security_key header for authentication. */
const RRA_SECURITY_KEY: string = config.ebm.securityKey || '';

// ──────────────────────────────────────────────
// VSDC result-code table (RRA VSDC API Documentation v1.0.5 §4.14)
// ──────────────────────────────────────────────

/** `resultCd` values documented by the spec; "000" is the only success code. */
const VSDC_RESULT_MESSAGES: Record<string, string> = {
  '000': 'It is succeeded',
  '001': 'There is no search result',
  '881': 'Purchase is mandatory',
  '882': 'Purchase code is invalid',
  '883': 'Purchase already used',
  '884': 'Invalid customer TIN was provided',
  '891': 'An error occurred while Request URL is created',
  '892': 'An error occurred while Request Header data is created',
  '893': 'An error occurred while Request Body data is created',
  '894': 'An error regarding server communication occurred',
  '895': 'An error regarding unallowed Request Method occurred',
  '896': 'An error regarding Request Status occurred',
  '899': 'An error regarding Client occurred',
  '900': 'There is no Header information',
  '901': 'It is not valid device',
  '902': 'This device is installed',
  '903': 'Only VSDC device can be verified',
  '910': 'Request parameter error',
  '911': 'There is no request full text',
  '912': 'There is a request Method error',
  '921': 'Sales or sales invoice data which is declared cannot be received',
  '922': 'Sales invoice data can be received after receiving the sales data',
  '990': 'The maximum number of views are exceeded',
  '991': 'There is an error during registration',
  '992': 'There is an error during modification',
  '993': 'There is an error during deletion',
  '994': 'There is an overlapped Data',
  '995': 'There is no downloaded file',
  '999': 'There is an unknown error. Please ask the administrator',
};

export function parseVsdcStatusCode(raw: unknown): {
  code: string;
  isError: boolean;
  isWarning: boolean;
  message: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { code: '?', isError: true, isWarning: false, message: 'No response body' };
  }
  const o = raw as Record<string, unknown>;
  const code = String(o.resultCd ?? '?');
  const serverMessage = typeof o.resultMsg === 'string' && o.resultMsg.length > 0 ? o.resultMsg : undefined;
  const message = serverMessage ?? VSDC_RESULT_MESSAGES[code] ?? `Unknown VSDC result code ${code}`;
  return {
    code,
    isError: code !== '000' && code !== '?',
    isWarning: false,
    message,
  };
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface VsdcEnvelope {
  tin: string;
  bhfId: string;
  sdcId: string;
  mrcNo: string;
  dvcSrlNo: string;
  env: string;
  /** C3: per-branch VSDC endpoint; falls back to config.ebm.apiUrl if absent */
  vsdcUrl?: string;
}

export interface VsdcResponse {
  /** VSDC's per-receipt-type counter — the "A" half of the required A/B RT counter. */
  rcptNo: string;
  intrlData: string;
  vsdcSignature: string;
  /** All-receipts counter — the "B" half of the required A/B RT counter. Not a QR payload. */
  totRcptNo: string;
  /** VSDC device id — needed client-side to build the printed QR string (CIS spec §7.24.7). */
  sdcId: string;
  sdcDateTime: string;
}

export interface VsdcApiResult {
  success: boolean;
  data?: VsdcResponse;
  error?: string;
  rawStatus: number;
  rawBody: unknown;
}

// ──────────────────────────────────────────────
// Envelope builder
// ──────────────────────────────────────────────

export async function buildVsdcEnvelope(
  organizationId: number,
  branchId?: number | null,
): Promise<VsdcEnvelope> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      TIN: true,
      ebmDeviceId: true,
      ebmSerialNo: true,
      name: true,
    },
  });

  if (!org) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  // Prefer per-branch credentials (RRA issues device per branch).
  // Fall back to org-level credentials for single-branch setups not yet migrated.
  let bhfId = '00';
  let sdcId = org.ebmDeviceId ?? '';
  let mrcNo = org.ebmSerialNo ?? '';

  let vsdcUrl: string | undefined;

  if (branchId != null) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { bhfId: true, ebmDeviceId: true, ebmSerialNo: true, vsdcUrl: true },
    });
    if (branch) {
      if (branch.bhfId) bhfId = branch.bhfId;
      if (branch.ebmDeviceId) sdcId = branch.ebmDeviceId;
      if (branch.ebmSerialNo) mrcNo = branch.ebmSerialNo;
      if (branch.vsdcUrl) vsdcUrl = branch.vsdcUrl.replace(/\/$/, '');
    }
  }

  return {
    tin: org.TIN ?? '',
    bhfId,
    sdcId,
    mrcNo,
    dvcSrlNo: mrcNo,
    env: config.ebm.environment,
    vsdcUrl,
  };
}

// ──────────────────────────────────────────────
// HTTP transport
// ──────────────────────────────────────────────

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

async function postToEndpoint(
  path: string,
  body: Record<string, unknown>,
  baseUrl?: string,
): Promise<VsdcApiResult> {
  // C3: prefer per-branch URL, fall back to global config
  const base = (baseUrl ?? config.ebm.apiUrl ?? '').replace(/\/$/, '');
  if (!base) {
    return { success: false, error: 'EBM_API_URL is not configured', rawStatus: 0, rawBody: null };
  }

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
    if (RRA_SECURITY_KEY) {
      headers['security_key'] = RRA_SECURITY_KEY;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let json: unknown = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = rawText;
    }

    if (!res.ok) {
      return { success: false, error: `Gateway HTTP ${res.status}`, rawStatus: res.status, rawBody: json };
    }

    // C2: check VSDC business-level status code (STATUS != "0" is a rejection even on HTTP 200)
    const vsdcStatus = parseVsdcStatusCode(json);
    if (vsdcStatus.isError) {
      return {
        success: false,
        error: `VSDC error ${vsdcStatus.code}: ${vsdcStatus.message}`,
        rawStatus: res.status,
        rawBody: json,
      };
    }

    const parsed = parseVsdcResponse(json);
    if (!parsed.rcptNo) {
      return { success: false, error: 'Gateway response missing rcptNo', rawStatus: res.status, rawBody: json };
    }

    return { success: true, data: parsed, rawStatus: res.status, rawBody: json };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'VSDC request failed';
    return { success: false, error: message, rawStatus: 0, rawBody: null };
  } finally {
    clearTimeout(t);
  }
}

// ──────────────────────────────────────────────
// Response parser (RRA canonical fields)
// ──────────────────────────────────────────────

/** Parse VSDC's compact `yyyyMMddhhmmss` timestamp into an ISO string `new Date()` can read. */
function parseRraCompactDateTime(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
}

/**
 * Parse the response to `/trnsSales/saveSales`:
 * `{ resultCd, resultMsg, resultDt, data: { rcptNo, intrlData, rcptSign, totRcptNo, vsdcRcptPbctDate, sdcId, mrcNo } }`
 * (RRA VSDC API Documentation v1.0.5 §3.3.6.1). There is no QR payload in this
 * response — the CIS builds the QR string itself from these fields.
 */
export function parseVsdcResponse(raw: unknown): VsdcResponse {
  const fallback: VsdcResponse = {
    rcptNo: '',
    intrlData: '',
    vsdcSignature: '',
    totRcptNo: '',
    sdcId: '',
    sdcDateTime: '',
  };

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const o = raw as Record<string, unknown>;
  const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = data[k] ?? o[k];
      if (v !== undefined && v !== null && String(v).length > 0) {
        return String(v);
      }
    }
    return '';
  };

  const rawDateTime = pick('vsdcRcptPbctDate', 'sdcDateTime');

  return {
    rcptNo: pick('rcptNo'),
    intrlData: pick('intrlData'),
    vsdcSignature: pick('rcptSign', 'vsdcSignature'),
    totRcptNo: pick('totRcptNo'),
    sdcId: pick('sdcId'),
    sdcDateTime: rawDateTime ? parseRraCompactDateTime(rawDateTime) : '',
  };
}

// ──────────────────────────────────────────────
// Endpoint-specific API methods
// ──────────────────────────────────────────────

/**
 * POST /saveInvc — Primary invoice, refund, and void fiscalization.
 * operation: "SALE" | "REFUND" | "VOID"
 */
export async function saveInvc(
  envelope: VsdcEnvelope,
  payload: Record<string, unknown>,
): Promise<VsdcApiResult> {
  if (config.ebm.useMock) {
    return mockResult('INVC', envelope.sdcId);
  }
  const { vsdcUrl, ...envelopeFields } = envelope;
  return postToEndpoint(config.ebm.salePath || '/saveInvc', { ...envelopeFields, ...payload }, vsdcUrl);
}

/**
 * POST /saveItem — Product catalog item initialization/updates.
 */
export async function saveItem(
  envelope: VsdcEnvelope,
  payload: Record<string, unknown>,
): Promise<VsdcApiResult> {
  if (config.ebm.useMock) {
    return mockResult('ITEM');
  }
  const { vsdcUrl, ...envelopeFields } = envelope;
  return postToEndpoint('/saveItem', { ...envelopeFields, ...payload }, vsdcUrl);
}

/**
 * POST /selectMvmt — Inventory changes, write-offs, stock transfers.
 */
export async function selectMvmt(
  envelope: VsdcEnvelope,
  payload: Record<string, unknown>,
): Promise<VsdcApiResult> {
  if (config.ebm.useMock) {
    return mockResult('MVMT');
  }
  const { vsdcUrl, ...envelopeFields } = envelope;
  return postToEndpoint('/selectMvmt', { ...envelopeFields, ...payload }, vsdcUrl);
}

/**
 * POST /savePurc — B2B incoming purchase records.
 */
export async function savePurc(
  envelope: VsdcEnvelope,
  payload: Record<string, unknown>,
): Promise<VsdcApiResult> {
  if (config.ebm.useMock) {
    return mockResult('PURC');
  }
  const { vsdcUrl, ...envelopeFields } = envelope;
  return postToEndpoint('/savePurc', { ...envelopeFields, ...payload }, vsdcUrl);
}

/**
 * POST /selectImportInvc — Import declaration validation hooks.
 */
export async function selectImportInvc(
  envelope: VsdcEnvelope,
  payload: Record<string, unknown>,
): Promise<VsdcApiResult> {
  if (config.ebm.useMock) {
    return mockResult('IMPORT');
  }
  const { vsdcUrl, ...envelopeFields } = envelope;
  return postToEndpoint('/selectImportInvc', { ...envelopeFields, ...payload }, vsdcUrl);
}

/**
 * POST to a configurable status/sync endpoint for heartbeat checks.
 */
export async function vsdcHeartbeat(
  envelope: VsdcEnvelope,
): Promise<VsdcApiResult> {
  const statusPath = config.ebm.statusCheckPath || '/status';
  if (config.ebm.useMock) {
    return {
      success: true,
      data: {
        rcptNo: 'HEARTBEAT-ACK',
        intrlData: '',
        vsdcSignature: '',
        totRcptNo: '',
        sdcId: '',
        sdcDateTime: new Date().toISOString(),
      },
      rawStatus: 200,
      rawBody: null,
    };
  }
  const { vsdcUrl, ...envelopeFields } = envelope;
  return postToEndpoint(statusPath, { ...envelopeFields, operation: 'HEARTBEAT' }, vsdcUrl);
}

// ──────────────────────────────────────────────
// Mock helper
// ──────────────────────────────────────────────

function mockResult(prefix: string, sdcId?: string): VsdcApiResult {
  const ref = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  // rcptNo/totRcptNo must be numeric strings (parsed with parseInt downstream into
  // EbmTransaction.sdcRcptNo/totalRcptNo), so this mirrors the real /trnsSales/saveSales
  // response shape rather than the old free-text ref.
  const rcptNo = String(Math.floor(Date.now() / 1000) % 100000);
  const totRcptNo = String(Math.floor(Date.now() / 1000) % 1000000);
  return {
    success: true,
    data: {
      rcptNo,
      intrlData: `MOCK-INTERNAL-${ref}`,
      vsdcSignature: `MOCK-SIG-${ref}`,
      totRcptNo,
      sdcId: sdcId || 'SDC000000000',
      sdcDateTime: new Date().toISOString(),
    },
    rawStatus: 200,
    rawBody: { resultCd: '000', resultMsg: 'It is succeeded', mock: true, data: { rcptNo, totRcptNo } },
  };
}
