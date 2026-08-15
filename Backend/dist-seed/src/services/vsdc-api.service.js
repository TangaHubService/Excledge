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
exports.saveZReport = saveZReport;
exports.checkZReport = checkZReport;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
/** RRA EBM API may require a security_key header for authentication. */
const RRA_SECURITY_KEY = config_1.config.ebm.securityKey || '';
// ──────────────────────────────────────────────
// VSDC result-code table (RRA VSDC API Documentation v1.0.5 §4.14)
// ──────────────────────────────────────────────
/** `resultCd` values documented by the spec; "000" is the only success code. */
const VSDC_RESULT_MESSAGES = {
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
function parseVsdcStatusCode(raw) {
    if (!raw || typeof raw !== 'object') {
        return { code: '?', isError: true, isWarning: false, message: 'No response body' };
    }
    const o = raw;
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
async function postToEndpoint(path, body, baseUrl, options = {}) {
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
            const detail = json && typeof json === 'object'
                ? String(json.resultMsg ?? json.message ?? '')
                : '';
            return {
                success: false,
                error: `Gateway HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
                rawStatus: res.status,
                rawBody: json,
            };
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
        // Only a sale submission is expected to issue a receipt counter. Product,
        // stock, and lookup endpoints can return a successful `000` response with
        // `data: null`, which must not be treated as a fiscalisation failure.
        if (options.requiresReceiptNumber && !parsed.rcptNo) {
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
/** Parse VSDC's compact `yyyyMMddhhmmss` timestamp into an ISO string `new Date()` can read. */
function parseRraCompactDateTime(s) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
    if (!m)
        return s;
    const [, y, mo, d, h, mi, se] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
}
/**
 * Parse the response to `/trnsSales/saveSales`:
 * `{ resultCd, resultMsg, resultDt, data: { rcptNo, intrlData, rcptSign, totRcptNo, vsdcRcptPbctDate, sdcId, mrcNo } }`
 * (RRA VSDC API Documentation v1.0.5 §3.3.6.1). There is no QR payload in this
 * response — the CIS builds the QR string itself from these fields.
 */
function parseVsdcResponse(raw) {
    const fallback = {
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
    const o = raw;
    const data = (o.data && typeof o.data === 'object' ? o.data : {});
    const pick = (...keys) => {
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
async function saveInvc(envelope, payload) {
    if (config_1.config.ebm.useMock) {
        return mockResult('INVC', envelope.sdcId);
    }
    const { vsdcUrl, ...envelopeFields } = envelope;
    return postToEndpoint(config_1.config.ebm.salePath || '/trnsSales/saveSales', { ...envelopeFields, ...payload }, vsdcUrl, { requiresReceiptNumber: true });
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
/**
 * POST /reports/saveZReports — daily Z (closing) report.
 *
 * Endpoint path and request shape confirmed against the RRA reference sandbox
 * (`ReportExcute.saveReportZ`, `@RequestMapping("/reports")` +
 * `@PostMapping("/saveZReports")`): the client only sends `{tin, bhfId,
 * rptDe}` — the device/edge software computes and stores the day's receipt
 * counts and totals itself from what it already recorded via
 * `/trnsSales/saveSales`, it does not take them as input.
 *
 * `rptDe` here is the **report generation timestamp**, `yyyyMMddHHmmss` (14
 * digits) — confirmed by the sandbox's own validation error message when
 * given an 8-digit date. This differs from `checkZReport`, which takes an
 * 8-digit report *date*. Not yet observed returning a live success from this
 * sandbox instance (see caller note) — confirm the exact contract with RRA
 * (`cis_sdc_certification@rra.gov.rw`) before relying on it for certification
 * evidence.
 */
async function saveZReport(envelope, rptDe) {
    if (config_1.config.ebm.useMock) {
        return mockResult('ZREPORT', envelope.sdcId);
    }
    return postToEndpoint('/reports/saveZReports', { tin: envelope.tin, bhfId: envelope.bhfId, rptDe }, envelope.vsdcUrl);
}
/**
 * POST /reports/checkZReport — look up a previously saved Z report.
 * `rptDe` here is an 8-digit report **date** (`yyyyMMdd`), unlike
 * `saveZReport`'s 14-digit timestamp — confirmed by the sandbox's validation
 * error ("length must be between 8 and 8").
 */
async function checkZReport(envelope, rptDe) {
    if (config_1.config.ebm.useMock) {
        return mockResult('ZREPORT-CHECK', envelope.sdcId);
    }
    return postToEndpoint('/reports/checkZReport', { tin: envelope.tin, bhfId: envelope.bhfId, rptDe }, envelope.vsdcUrl);
}
// ──────────────────────────────────────────────
// Mock helper
// ──────────────────────────────────────────────
function mockResult(prefix, sdcId) {
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
