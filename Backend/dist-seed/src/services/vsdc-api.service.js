"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVsdcStatusCode = parseVsdcStatusCode;
exports.buildVsdcEnvelope = buildVsdcEnvelope;
exports.parseVsdcResponse = parseVsdcResponse;
exports.saveInvc = saveInvc;
exports.saveItem = saveItem;
exports.selectMvmt = selectMvmt;
exports.savePurc = savePurc;
exports.selectImportInvc = selectImportInvc;
exports.vsdcHeartbeat = vsdcHeartbeat;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
/** RRA EBM API may require a security_key header for authentication. */
const RRA_SECURITY_KEY = config_1.config.ebm.securityKey || '';
// ──────────────────────────────────────────────
// C2: VSDC status-code tables (RRA ALGO EBM API v8.2 §4)
// ──────────────────────────────────────────────
/** HTTP-200 but STATUS != "0" means a business-level rejection. */
const VSDC_ERRORS = {
    '0': 'Success',
    '1': 'General error',
    '2': 'Invalid TIN',
    '3': 'Device not registered',
    '4': 'Duplicate invoice number',
    '5': 'Invalid invoice date/time',
    '6': 'Invalid tax amount',
    '7': 'Invalid receipt type',
    '8': 'Invalid MRC number',
    '9': 'Tax period closed',
    '10': 'Device disabled',
    '11': 'Organization suspended',
    '12': 'Invalid branch code',
    '99': 'System maintenance',
};
/** STATUS codes that indicate warnings but should not block the sale. */
const VSDC_WARNINGS = new Set(['98']);
function parseVsdcStatusCode(raw) {
    if (!raw || typeof raw !== 'object') {
        return { code: '?', isError: true, isWarning: false, message: 'No response body' };
    }
    const o = raw;
    const resp = o.RESPONSE && typeof o.RESPONSE === 'object'
        ? o.RESPONSE
        : o;
    const status = String(resp.STATUS ?? o.STATUS ?? resp.status ?? o.status ?? '?');
    const message = VSDC_ERRORS[status] ?? `Unknown VSDC status ${status}`;
    return {
        code: status,
        isError: status !== '0' && !VSDC_WARNINGS.has(status) && status !== '?',
        isWarning: VSDC_WARNINGS.has(status),
        message,
    };
}
// ──────────────────────────────────────────────
// Envelope builder
// ──────────────────────────────────────────────
async function buildVsdcEnvelope(organizationId, branchId) {
    const org = await prisma_1.prisma.organization.findUnique({
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
    let vsdcUrl;
    if (branchId != null) {
        const branch = await prisma_1.prisma.branch.findUnique({
            where: { id: branchId },
            select: { bhfId: true, ebmDeviceId: true, ebmSerialNo: true, vsdcUrl: true },
        });
        if (branch) {
            if (branch.bhfId)
                bhfId = branch.bhfId;
            if (branch.ebmDeviceId)
                sdcId = branch.ebmDeviceId;
            if (branch.ebmSerialNo)
                mrcNo = branch.ebmSerialNo;
            if (branch.vsdcUrl)
                vsdcUrl = branch.vsdcUrl.replace(/\/$/, '');
        }
    }
    return {
        tin: org.TIN ?? '',
        bhfId,
        sdcId,
        mrcNo,
        dvcSrlNo: mrcNo,
        env: config_1.config.ebm.environment,
        vsdcUrl,
    };
}
// ──────────────────────────────────────────────
// HTTP transport
// ──────────────────────────────────────────────
function authHeader() {
    const { apiKey, apiSecret } = config_1.config.ebm;
    if (apiKey && apiSecret) {
        const token = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
        return `Basic ${token}`;
    }
    if (apiKey) {
        return `Bearer ${apiKey}`;
    }
    return undefined;
}
async function postToEndpoint(path, body, baseUrl) {
    // C3: prefer per-branch URL, fall back to global config
    const base = (baseUrl ?? config_1.config.ebm.apiUrl ?? '').replace(/\/$/, '');
    if (!base) {
        return { success: false, error: 'EBM_API_URL is not configured', rawStatus: 0, rawBody: null };
    }
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), config_1.config.ebm.requestTimeoutMs);
    try {
        const headers = {
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
        let json = null;
        try {
            json = rawText ? JSON.parse(rawText) : null;
        }
        catch {
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
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'VSDC request failed';
        return { success: false, error: message, rawStatus: 0, rawBody: null };
    }
    finally {
        clearTimeout(t);
    }
}
// ──────────────────────────────────────────────
// Response parser (RRA canonical fields)
// ──────────────────────────────────────────────
function parseVsdcResponse(raw) {
    const fallback = {
        rcptNo: '',
        intrlData: '',
        vsdcSignature: '',
        qrPayload: '',
        sdcDateTime: '',
    };
    if (!raw || typeof raw !== 'object') {
        return fallback;
    }
    const o = raw;
    // Handle RRA canonical response structure:
    // { RESPONSE: { MESSAGE: { num, ysdcregsig, ysdcrecnum, ysdcintdata, ... }, QR_CODE, STATUS, DISTRIBUTOR_TIN } }
    const responseBlock = o.RESPONSE && typeof o.RESPONSE === 'object'
        ? o.RESPONSE
        : null;
    const messageBlock = responseBlock?.MESSAGE && typeof responseBlock.MESSAGE === 'object'
        ? responseBlock.MESSAGE
        : null;
    // Also support existing gateway format: o.data
    const data = (o.data && typeof o.data === 'object' ? o.data : {});
    const pick = (...keys) => {
        for (const k of keys) {
            const v = o[k] ??
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
async function saveInvc(envelope, payload) {
    if (config_1.config.ebm.useMock) {
        return mockResult('INVC');
    }
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint(config_1.config.ebm.salePath || '/saveInvc', { ...envelopeFields, ...payload }, vsdcUrl);
}
/**
 * POST /saveItem — Product catalog item initialization/updates.
 */
async function saveItem(envelope, payload) {
    if (config_1.config.ebm.useMock) {
        return mockResult('ITEM');
    }
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint('/saveItem', { ...envelopeFields, ...payload }, vsdcUrl);
}
/**
 * POST /selectMvmt — Inventory changes, write-offs, stock transfers.
 */
async function selectMvmt(envelope, payload) {
    if (config_1.config.ebm.useMock) {
        return mockResult('MVMT');
    }
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint('/selectMvmt', { ...envelopeFields, ...payload }, vsdcUrl);
}
/**
 * POST /savePurc — B2B incoming purchase records.
 */
async function savePurc(envelope, payload) {
    if (config_1.config.ebm.useMock) {
        return mockResult('PURC');
    }
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint('/savePurc', { ...envelopeFields, ...payload }, vsdcUrl);
}
/**
 * POST /selectImportInvc — Import declaration validation hooks.
 */
async function selectImportInvc(envelope, payload) {
    if (config_1.config.ebm.useMock) {
        return mockResult('IMPORT');
    }
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint('/selectImportInvc', { ...envelopeFields, ...payload }, vsdcUrl);
}
/**
 * POST to a configurable status/sync endpoint for heartbeat checks.
 */
async function vsdcHeartbeat(envelope) {
    const statusPath = config_1.config.ebm.statusCheckPath || '/status';
    if (config_1.config.ebm.useMock) {
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
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint(statusPath, { ...envelopeFields, operation: 'HEARTBEAT' }, vsdcUrl);
}
// ──────────────────────────────────────────────
// Mock helper
// ──────────────────────────────────────────────
function mockResult(prefix) {
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
