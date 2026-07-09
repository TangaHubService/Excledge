"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatewayErrorMessage = gatewayErrorMessage;
exports.isEbmEnabled = isEbmEnabled;
exports.parseGatewayResponse = parseGatewayResponse;
exports.postToGateway = postToGateway;
exports.toRraDate = toRraDate;
exports.toRraTime = toRraTime;
exports.toRraDateTime = toRraDateTime;
exports.fix2 = fix2;
exports.buildRraSendReceiptPayload = buildRraSendReceiptPayload;
exports.generateInvoiceNumber = generateInvoiceNumber;
exports.submitInvoiceToEbm = submitInvoiceToEbm;
exports.submitRefundToEbm = submitRefundToEbm;
exports.submitVoidToEbm = submitVoidToEbm;
exports.queueInvoiceForEbm = queueInvoiceForEbm;
exports.processEbmQueueBatch = processEbmQueueBatch;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
const vsdc_api_service_1 = require("./vsdc-api.service");
let invoiceSequenceMode = 'unknown';
let loggedLegacyInvoiceFallback = false;
function gatewayErrorMessage(http, fallback) {
    if (http.json && typeof http.json === 'object') {
        const rec = http.json;
        if (rec.message != null && String(rec.message).length > 0) {
            return String(rec.message);
        }
    }
    return fallback;
}
function isQueuePayloadV2(p) {
    return (typeof p === 'object' &&
        p !== null &&
        p.version === 2 &&
        typeof p.saleId === 'number' &&
        typeof p.organizationId === 'number');
}
function isEbmEnabled() {
    return config_1.config.ebm.enabled === true;
}
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
function parseGatewayResponse(raw) {
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    const o = raw;
    // Handle RRA canonical structure: { RESPONSE: { MESSAGE: { ... }, QR_CODE, ... } }
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
        return undefined;
    };
    return {
        // RRA field: "num" in MESSAGE block holds the invoice number
        ebmInvoiceNumber: pick('ebmInvoiceNumber', 'ebm_invoice_number', 'num', 'receiptNumber', 'receipt_number', 'invoiceNumber', 'fiscalInvoiceNumber', 'sdcInvoiceNo'),
        // RRA field: "QR_CODE" in RESPONSE block holds the encrypted QR payload
        receiptQrPayload: pick('QR_CODE', 'qrCode', 'qr_code', 'qrPayload', 'qr_payload', 'qrData', 'receiptQr'),
        // RRA field: "ysdcregsig" in MESSAGE block holds the fiscal signature
        verificationCode: pick('ysdcregsig', 'verificationCode', 'verification_code', 'ysdcintdata', 'internalData', 'rcptSign'),
        // RRA fields: "ysdcmrctim" or "ysdctime" in MESSAGE block hold the SDC timestamp
        sdcDateTime: pick('ysdcmrctim', 'ysdctime', 'sdcDateTime', 'sdc_date_time', 'issuedAt', 'timestamp'),
    };
}
function isMissingDatabaseObjectError(error, objectName) {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const prismaError = error;
    if (prismaError.code !== 'P2010') {
        return false;
    }
    const postgresCode = prismaError.meta?.code;
    const message = prismaError.meta?.message ?? '';
    return ((postgresCode === '42P01' || postgresCode === '42704') &&
        message.includes(`"${objectName}"`));
}
async function nextInvoiceSequenceFromCounterTable(organizationId, branchId, client = prisma_1.prisma) {
    const rows = await client.$queryRaw `
    INSERT INTO "organization_invoice_counters" ("organizationId", "branchId", "nextSequence", "updatedAt")
    VALUES (${organizationId}, ${branchId}, 1, NOW())
    ON CONFLICT ("organizationId", "branchId") DO UPDATE
    SET "nextSequence" = "organization_invoice_counters"."nextSequence" + 1,
        "updatedAt" = NOW()
    RETURNING "nextSequence"
  `;
    return Number(rows[0]?.nextSequence ?? 0);
}
async function nextInvoiceSequenceFromLegacySequence(client = prisma_1.prisma) {
    const rows = await client.$queryRaw `
    SELECT nextval('invoice_seq')::bigint AS "nextSequence"
  `;
    return Number(rows[0]?.nextSequence ?? 0);
}
async function allocateNextInvoiceSequence(organizationId, branchId, client = prisma_1.prisma) {
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
    }
    catch (error) {
        if (!isMissingDatabaseObjectError(error, 'organization_invoice_counters')) {
            throw error;
        }
    }
    try {
        const sequence = await nextInvoiceSequenceFromLegacySequence(client);
        invoiceSequenceMode = 'legacy_sequence';
        if (!loggedLegacyInvoiceFallback) {
            loggedLegacyInvoiceFallback = true;
            console.warn('[EBM] Falling back to legacy invoice_seq because organization_invoice_counters is missing. Apply the latest Prisma migrations to enable per-branch invoice counters.');
        }
        return sequence;
    }
    catch (error) {
        if (isMissingDatabaseObjectError(error, 'invoice_seq')) {
            throw new Error('Invoice numbering database objects are missing. Run `npm run prisma:deploy` in `Backend/` to apply the latest Prisma migrations.');
        }
        throw error;
    }
}
async function postToGateway(path, body) {
    const base = config_1.config.ebm.apiUrl;
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
        if (config_1.config.ebm.securityKey) {
            headers['security_key'] = config_1.config.ebm.securityKey;
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
            json = null;
        }
        return { ok: res.ok, status: res.status, json, rawText };
    }
    finally {
        clearTimeout(t);
    }
}
// ──────────────────────────────────────────────
// C4: RRA-canonical date/amount helpers (CIS/VSDC spec §3.2)
// ──────────────────────────────────────────────
function toRraDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}
function toRraTime(d) {
    return [
        String(d.getHours()).padStart(2, '0'),
        String(d.getMinutes()).padStart(2, '0'),
        String(d.getSeconds()).padStart(2, '0'),
    ].join('');
}
function toRraDateTime(d) {
    return `${toRraDate(d)}${toRraTime(d)}`;
}
function fix2(n) {
    return Math.round(n * 100) / 100;
}
/**
 * VSDC §4.9 Sales Receipt Type only has two values: 'S' (Sale) and 'R' (Refund
 * after Sale). The CIS-level NS/NR/CS/CR/TS/TR/PS distinction (rcptLabel) is
 * used for the printed A/B/RT counter, not for this field — every label ends
 * in 'S' or 'R', which is exactly the axis VSDC cares about here.
 */
function rcptTyCdFromLabel(label) {
    return label?.endsWith('R') ? 'R' : 'S';
}
/** VSDC §4.10 Payment Method codes. */
function pmtTypeCd(paymentType) {
    switch (paymentType) {
        case 'CASH': return '01'; // CASH
        case 'CREDIT_CARD': return '05'; // DEBIT&CREDIT CARD
        case 'MOBILE_MONEY': return '06'; // MOBILE MONEY
        case 'INSURANCE': return '07'; // OTHER
        default: return '03'; // CASH/CREDIT
    }
}
/** VSDC §4.1 Tax Type rates — static, RRA-defined: A 0%, B 18%, C 0%, D 0%. */
const TAX_RATE_BY_SLOT = [0, 18, 0, 0];
/**
 * Build the RRA VSDC API v1.0.5 `/trnsSales/saveSales` payload
 * (`TrnsSalesSaveWrReq`, §3.3.6.1). `tin`/`bhfId` are added by the caller from
 * the VSDC envelope, not here.
 *
 * `opts` lets the same builder produce a refund submission: a refund is not a
 * separate endpoint, it's another sales-transaction record referencing the
 * original invoice via `orgInvcNo` with `rfdDt`/`rfdRsnCd` set.
 */
function buildRraSendReceiptPayload(sale, org, opts = {}) {
    const rcptTyCd = rcptTyCdFromLabel(sale.rcptLabel);
    const isRefund = rcptTyCd === 'R';
    const isVoid = !!opts.cnclDt;
    // Per-tax-code accumulators: slot 0=A(exempt), 1=B(VAT18%), 2=C(zero-rated), 3=D(non-taxable)
    const taxblAmt = [0, 0, 0, 0];
    const taxAmt = [0, 0, 0, 0];
    const codeToSlot = { A: 0, B: 1, C: 2, D: 3 };
    const itemList = sale.saleItems.map((si, idx) => {
        const rawCode = (si.taxCode ?? 'A').toUpperCase();
        const slot = codeToSlot[rawCode];
        if (slot === undefined) {
            throw new Error(`Cannot submit sale ${sale.saleNumber ?? sale.id} to RRA: sale item ${idx + 1} has invalid tax code "${rawCode}". Only A, B, C, D are valid for line items.`);
        }
        const tAmt = fix2(si.taxAmount.toNumber());
        const tbAmt = fix2(si.totalPrice.toNumber() - tAmt);
        taxblAmt[slot] = fix2(taxblAmt[slot] + tbAmt);
        taxAmt[slot] = fix2(taxAmt[slot] + tAmt);
        return {
            itemSeq: idx + 1,
            itemCd: si.product?.itemCd ?? `P${si.productId ?? idx + 1}`,
            itemClsCd: si.product?.itemClsCd ?? '5020230302',
            itemNm: si.product?.name ?? 'Item',
            pkg: si.quantity,
            pkgUnitCd: si.product?.pkgUnitCd ?? 'CT',
            qty: si.quantity,
            qtyUnitCd: si.product?.qtyUnitCd ?? 'U',
            prc: fix2(si.unitPrice.toNumber()),
            splyAmt: fix2(tbAmt),
            dcRt: fix2(si.dcRate.toNumber()),
            dcAmt: fix2(si.dcAmt.toNumber()),
            taxTyCd: rawCode,
            taxblAmt: fix2(tbAmt),
            taxAmt: fix2(tAmt),
            totAmt: fix2(si.totalPrice.toNumber()),
        };
    });
    const totTaxAmt = fix2(taxAmt.reduce((s, v) => s + v, 0));
    const totTaxblAmt = fix2(taxblAmt.reduce((s, v) => s + v, 0));
    const totAmt = fix2(sale.totalAmount.toNumber());
    const now = sale.createdAt;
    const invcNo = sale.vsdcInvcNo ?? sale.id;
    const regrNm = sale.user?.name ?? 'System';
    const regrId = sale.user ? String(sale.user.id) : 'system';
    return {
        invcNo,
        orgInvcNo: opts.orgInvcNo ?? 0,
        custTin: sale.customer.TIN ?? '',
        prcOrdCd: '', // known gap: not captured for BUSINESS customers today (§ purchase code)
        custNm: sale.customer.name ?? '',
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
            custTin: sale.customer.TIN ?? '',
            custMblNo: sale.customer.phone ?? '',
            rptNo: invcNo,
            trdeNm: org.name,
            adrs: org.address ?? '',
            topMsg: '',
            btmMsg: 'Thank you for your business',
            prchrAcptcYn: 'N',
        },
        itemList,
    };
}
async function enqueueSaleRetry(params) {
    const nextRetryMs = Math.min(60 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, params.retryCount ?? 0));
    await prisma_1.prisma.ebmQueue.create({
        data: {
            organizationId: params.organizationId,
            saleId: params.saleId,
            invoiceNumber: params.invoiceNumber,
            payload: {
                version: 2,
                saleId: params.saleId,
                organizationId: params.organizationId,
            },
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
async function generateInvoiceNumber(organizationId, branchId, client = prisma_1.prisma) {
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
 * Submit a completed sale to the VSDC/EBM gateway (or mock). Idempotent if already SUCCESS.
 */
async function submitInvoiceToEbm(params) {
    const queueRetryOnFailure = params.queueRetryOnFailure !== false;
    if (!isEbmEnabled()) {
        return { success: true };
    }
    const sale = (await prisma_1.prisma.sale.findFirst({
        where: { id: params.saleId, organizationId: params.organizationId },
        include: {
            saleItems: {
                include: {
                    product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true } },
                },
            },
            customer: true,
            branch: true,
            user: { select: { id: true, name: true } },
        },
    }));
    if (!sale) {
        return { success: false, error: 'Sale not found' };
    }
    const already = await prisma_1.prisma.ebmTransaction.findFirst({
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
    const computedTotal = sale.saleItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const submittedTotal = Number(sale.totalAmount);
    if (Math.abs(computedTotal - submittedTotal) > 0.01) {
        return {
            success: false,
            error: `Total amount mismatch: submitted ${submittedTotal}, computed from lines ${computedTotal}`,
        };
    }
    // Pre-validate totalVat vs line-item VAT (RRA compliance)
    const computedVat = sale.saleItems.reduce((sum, item) => sum + Number(item.taxAmount), 0);
    const submittedVat = Number(sale.vatAmount);
    if (Math.abs(computedVat - submittedVat) > 0.01) {
        return {
            success: false,
            error: `VAT amount mismatch: submitted ${submittedVat}, computed from lines ${computedVat}`,
        };
    }
    const org = await prisma_1.prisma.organization.findUnique({
        where: { id: params.organizationId },
        select: { TIN: true, name: true, address: true },
    });
    if (!org) {
        return { success: false, error: 'Organization not found' };
    }
    let payload;
    try {
        payload = buildRraSendReceiptPayload(sale, org);
    }
    catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Invalid sale payload' };
    }
    let txRow = await prisma_1.prisma.ebmTransaction.findFirst({
        where: {
            saleId: sale.id,
            operation: 'SALE',
            submissionStatus: { in: ['PENDING', 'FAILED', 'RETRYING'] },
        },
        orderBy: { createdAt: 'desc' },
    });
    if (!txRow) {
        txRow = await prisma_1.prisma.ebmTransaction.create({
            data: {
                organizationId: params.organizationId,
                saleId: sale.id,
                invoiceNumber: sale.invoiceNumber,
                operation: 'SALE',
                submissionStatus: 'PENDING',
            },
        });
    }
    else {
        txRow = await prisma_1.prisma.ebmTransaction.update({
            where: { id: txRow.id },
            data: {
                submissionStatus: 'RETRYING',
                errorMessage: null,
            },
        });
    }
    const persistFailure = async (message, responseData) => {
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: txRow.id },
            data: {
                submissionStatus: 'FAILED',
                errorMessage: message,
                responseData: responseData ? responseData : undefined,
                retryCount: { increment: 1 },
            },
        });
        if (!queueRetryOnFailure) {
            return;
        }
        const existingPending = await prisma_1.prisma.ebmQueue.findFirst({
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
            retryCount: txRow.retryCount,
        });
    };
    // saveInvc() already handles config.ebm.useMock internally (mockResult()) and
    // returns the real /trnsSales/saveSales response shape — no separate shortcut
    // here, so mock mode exercises the same response-parsing path as production.
    if (!config_1.config.ebm.useMock && !config_1.config.ebm.apiUrl) {
        await persistFailure('EBM_API_URL is not configured');
        return { success: false, error: 'EBM_API_URL is not configured' };
    }
    await prisma_1.prisma.ebmTransaction.update({
        where: { id: txRow.id },
        data: { submissionStatus: 'SUBMITTED' },
    });
    try {
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(params.organizationId, sale.branchId);
        const result = await (0, vsdc_api_service_1.saveInvc)(envelope, payload);
        if (!result.success || !result.data?.rcptNo) {
            const msg = result.error ?? 'VSDC gateway error';
            await persistFailure(msg, {
                vsdcResult: result,
                requestPayload: payload,
            });
            return { success: false, error: msg };
        }
        const { data: vsdc } = result;
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.ebmTransaction.update({
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
                    rcptLabel: sale.rcptLabel ?? null,
                    responseData: {
                        raw: result.rawBody,
                        normalized: vsdc,
                        requestPayload: payload,
                    },
                },
            }),
            prisma_1.prisma.organization.update({
                where: { id: params.organizationId },
                data: {
                    lastSuccessfulVdsContact: new Date(),
                    lastSyncCursor: new Date(),
                },
            }),
        ]);
        return { success: true, ebmInvoiceNumber: vsdc.rcptNo };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'EBM request failed';
        await persistFailure(message, { requestPayload: payload });
        return { success: false, error: message };
    }
}
/**
 * Report a full refund to the gateway (credit note) when the original sale was fiscalized.
 */
async function submitRefundToEbm(params) {
    if (!isEbmEnabled()) {
        return { success: true };
    }
    const origTx = await prisma_1.prisma.ebmTransaction.findFirst({
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
        prisma_1.prisma.sale.findFirst({
            where: { id: params.originalSaleId, organizationId: params.organizationId },
            select: { invoiceNumber: true, saleNumber: true, vsdcInvcNo: true, totalAmount: true, vatAmount: true },
        }),
        prisma_1.prisma.sale.findFirst({
            where: { id: params.refundSaleId, organizationId: params.organizationId },
            include: {
                saleItems: {
                    include: {
                        product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true } },
                    },
                },
                customer: true,
                branch: true,
                user: { select: { id: true, name: true } },
            },
        }),
        prisma_1.prisma.organization.findUnique({
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
    const refundRow = await prisma_1.prisma.ebmTransaction.create({
        data: {
            organizationId: params.organizationId,
            saleId: params.refundSaleId,
            invoiceNumber: refundSale.saleNumber,
            operation: 'REFUND',
            submissionStatus: 'PENDING',
        },
    });
    let payload;
    try {
        // §4.16 Refund Reason Code: '06' = Refund (the only generic code available
        // from a free-text reason — the reason itself goes into `remark`).
        payload = buildRraSendReceiptPayload(refundSale, org, {
            orgInvcNo: originalSale.vsdcInvcNo ?? undefined,
            rfdDt: new Date(),
            rfdRsnCd: '06',
        });
        payload.remark = params.reason ?? '';
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid refund payload';
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: refundRow.id },
            data: { submissionStatus: 'FAILED', errorMessage: msg },
        });
        return { success: false, error: msg };
    }
    if (!config_1.config.ebm.useMock && !config_1.config.ebm.apiUrl) {
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: refundRow.id },
            data: {
                submissionStatus: 'FAILED',
                errorMessage: 'EBM_API_URL is not configured',
            },
        });
        return { success: false, error: 'EBM_API_URL is not configured' };
    }
    try {
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(params.organizationId, refundSale.branchId);
        const result = await (0, vsdc_api_service_1.saveInvc)(envelope, payload);
        if (!result.success) {
            const msg = result.error ?? 'Refund VSDC error';
            await prisma_1.prisma.ebmTransaction.update({
                where: { id: refundRow.id },
                data: {
                    submissionStatus: 'FAILED',
                    errorMessage: msg,
                    responseData: { vsdcResult: result, requestPayload: payload },
                },
            });
            return { success: false, error: msg };
        }
        const { data: vsdc } = result;
        await prisma_1.prisma.ebmTransaction.update({
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
                rcptLabel: refundSale.rcptLabel ?? null,
                responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: payload },
            },
        });
        return { success: true };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'Refund EBM failed';
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: refundRow.id },
            data: { submissionStatus: 'FAILED', errorMessage: message },
        });
        return { success: false, error: message };
    }
}
/**
 * Void/cancel a fiscalized sale at the gateway when supported by RRA spec.
 */
async function submitVoidToEbm(params) {
    if (!isEbmEnabled()) {
        return { success: true };
    }
    const origTx = await prisma_1.prisma.ebmTransaction.findFirst({
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
    const sale = (await prisma_1.prisma.sale.findFirst({
        where: { id: params.saleId, organizationId: params.organizationId },
        include: {
            saleItems: {
                include: {
                    product: { select: { name: true, itemCd: true, itemClsCd: true, pkgUnitCd: true, qtyUnitCd: true } },
                },
            },
            customer: true,
            branch: true,
            user: { select: { id: true, name: true } },
        },
    }));
    const org = await prisma_1.prisma.organization.findUnique({
        where: { id: params.organizationId },
        select: { TIN: true, name: true, address: true },
    });
    if (!sale || !org) {
        return { success: false, error: 'Void EBM: missing sale or organization' };
    }
    const voidRow = await prisma_1.prisma.ebmTransaction.create({
        data: {
            organizationId: params.organizationId,
            saleId: params.saleId,
            invoiceNumber: sale.invoiceNumber,
            operation: 'VOID',
            submissionStatus: 'PENDING',
        },
    });
    let payload;
    try {
        // A cancellation resubmits the SAME invoice number with cnclDt/cnclReqDt
        // set and salesSttsCd='04' — it's not a new document, so orgInvcNo stays 0.
        payload = buildRraSendReceiptPayload(sale, org, { cnclDt: new Date() });
        payload.remark = params.reason ?? '';
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid void payload';
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: voidRow.id },
            data: { submissionStatus: 'FAILED', errorMessage: msg },
        });
        return { success: false, error: msg };
    }
    if (!config_1.config.ebm.useMock && !config_1.config.ebm.apiUrl) {
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: voidRow.id },
            data: {
                submissionStatus: 'FAILED',
                errorMessage: 'EBM_API_URL is not configured',
            },
        });
        return { success: false, error: 'EBM_API_URL is not configured' };
    }
    try {
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(params.organizationId, sale.branchId);
        const result = await (0, vsdc_api_service_1.saveInvc)(envelope, payload);
        if (!result.success) {
            const msg = result.error ?? 'Void VSDC error';
            await prisma_1.prisma.ebmTransaction.update({
                where: { id: voidRow.id },
                data: {
                    submissionStatus: 'FAILED',
                    errorMessage: msg,
                    responseData: { vsdcResult: result, requestPayload: payload },
                },
            });
            return { success: false, error: msg };
        }
        const { data: vsdc } = result;
        await prisma_1.prisma.ebmTransaction.update({
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
                responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: payload },
            },
        });
        return { success: true };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'Void EBM failed';
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: voidRow.id },
            data: { submissionStatus: 'FAILED', errorMessage: message },
        });
        return { success: false, error: message };
    }
}
/**
 * @deprecated Prefer submitInvoiceToEbm({ saleId, organizationId }) — queue stores v2 payload only.
 */
async function queueInvoiceForEbm(_data, priority = 0) {
    await prisma_1.prisma.ebmQueue.create({
        data: {
            organizationId: _data.organizationId,
            saleId: _data.saleId,
            invoiceNumber: _data.invoiceNumber ?? null,
            payload: {
                version: 2,
                saleId: _data.saleId,
                organizationId: _data.organizationId,
            },
            priority,
            nextRetryAt: new Date(),
            submissionStatus: 'PENDING',
        },
    });
}
/**
 * Process pending EBM queue rows (called from cron job).
 */
async function processEbmQueueBatch(limit = 25) {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const rows = await prisma_1.prisma.ebmQueue.findMany({
        where: {
            submissionStatus: 'PENDING',
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
            retryCount: { lt: config_1.config.ebm.maxQueueRetries },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: limit,
    });
    for (const row of rows) {
        processed += 1;
        const p = row.payload;
        if (!isQueuePayloadV2(p)) {
            await prisma_1.prisma.ebmQueue.update({
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
            await prisma_1.prisma.ebmQueue.update({
                where: { id: row.id },
                data: { submissionStatus: 'SUCCESS', lastError: null },
            });
            succeeded += 1;
        }
        else {
            const nextRetry = Math.min(60 * 60 * 1000, 2 * 60 * 1000 * Math.pow(2, row.retryCount));
            await prisma_1.prisma.ebmQueue.update({
                where: { id: row.id },
                data: {
                    retryCount: { increment: 1 },
                    lastError: result.error ?? 'Unknown error',
                    nextRetryAt: new Date(Date.now() + nextRetry),
                    submissionStatus: row.retryCount + 1 >= config_1.config.ebm.maxQueueRetries ? 'FAILED' : 'PENDING',
                },
            });
            if (row.retryCount + 1 >= config_1.config.ebm.maxQueueRetries) {
                failed += 1;
            }
        }
    }
    return { processed, succeeded, failed };
}
