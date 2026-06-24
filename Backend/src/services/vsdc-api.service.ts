import { prisma } from '../lib/prisma';
import { config } from '../config';

/** RRA EBM API may require a security_key header for authentication. */
const RRA_SECURITY_KEY: string = config.ebm.securityKey || '';

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
}

export interface VsdcResponse {
  rcptNo: string;
  intrlData: string;
  vsdcSignature: string;
  qrPayload: string;
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

  let branchCode = 'BRN-000';
  if (branchId != null) {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });
    if (branch) {
      branchCode = branch.code;
    }
  }

  return {
    tin: org.TIN ?? '',
    bhfId: branchCode,
    sdcId: org.ebmDeviceId ?? '',
    mrcNo: org.ebmSerialNo ?? '',
    dvcSrlNo: org.ebmSerialNo ?? '',
    env: config.ebm.environment,
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
): Promise<VsdcApiResult> {
  const base = config.ebm.apiUrl;
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

export function parseVsdcResponse(raw: unknown): VsdcResponse {
  const fallback: VsdcResponse = {
    rcptNo: '',
    intrlData: '',
    vsdcSignature: '',
    qrPayload: '',
    sdcDateTime: '',
  };

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const o = raw as Record<string, unknown>;

  // Handle RRA canonical response structure:
  // { RESPONSE: { MESSAGE: { num, ysdcregsig, ysdcrecnum, ysdcintdata, ... }, QR_CODE, STATUS, DISTRIBUTOR_TIN } }
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

  const pick = (...keys: string[]): string => {
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
    return '';
  };

  return {
    // RRA field: "num" holds the invoice/receipt number
    rcptNo: pick('rcptNo', 'num', 'receiptNo', 'receipt_number', 'ebmInvoiceNumber', 'invoiceNumber', 'fiscalInvoiceNumber'),
    // RRA field: "ysdcintdata" holds the internal data / verification code
    intrlData: pick('intrlData', 'ysdcintdata', 'internalData', 'verificationCode', 'verification_code'),
    // RRA field: "ysdcregsig" holds the fiscal signature
    vsdcSignature: pick('vsdcSignature', 'ysdcregsig', 'rcptSign', 'receiptSignature', 'fiscalSignature'),
    // RRA field: "QR_CODE" holds the encrypted QR payload
    qrPayload: pick('qrPayload', 'QR_CODE', 'qr_code', 'qrCode', 'qrData'),
    // RRA fields: "ysdcmrctim" or "ysdctime" hold the SDC timestamp
    sdcDateTime: pick('sdcDateTime', 'ysdcmrctim', 'ysdctime', 'issuedAt', 'timestamp', 'submittedAt'),
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
    return mockResult('INVC');
  }

  const body = {
    ...envelope,
    ...payload,
  };

  return postToEndpoint(config.ebm.salePath || '/saveInvc', body);
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

  const body = {
    ...envelope,
    ...payload,
  };

  return postToEndpoint('/saveItem', body);
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

  const body = {
    ...envelope,
    ...payload,
  };

  return postToEndpoint('/selectMvmt', body);
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

  const body = {
    ...envelope,
    ...payload,
  };

  return postToEndpoint('/savePurc', body);
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

  const body = {
    ...envelope,
    ...payload,
  };

  return postToEndpoint('/selectImportInvc', body);
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
        qrPayload: '',
        sdcDateTime: new Date().toISOString(),
      },
      rawStatus: 200,
      rawBody: null,
    };
  }

  return postToEndpoint(statusPath, { ...envelope, operation: 'HEARTBEAT' });
}

// ──────────────────────────────────────────────
// Mock helper
// ──────────────────────────────────────────────

function mockResult(prefix: string): VsdcApiResult {
  const ref = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return {
    success: true,
    data: {
      rcptNo: ref,
      intrlData: `MOCK-INTERNAL-${ref}`,
      vsdcSignature: `MOCK-SIG-${ref}`,
      qrPayload: `https://mock.rra.gov.rw/verify?rcpt=${ref}`,
      sdcDateTime: new Date().toISOString(),
    },
    rawStatus: 200,
    rawBody: { mock: true, ref },
  };
}
