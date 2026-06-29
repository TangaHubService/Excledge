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
exports.buildSaleGatewayPayload = buildSaleGatewayPayload;
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
async function nextInvoiceSequenceFromCounterTable(organizationId, branchId) {
    const rows = await prisma_1.prisma.$queryRaw `
    INSERT INTO "organization_invoice_counters" ("organizationId", "branchId", "nextSequence", "updatedAt")
    VALUES (${organizationId}, ${branchId}, 1, NOW())
    ON CONFLICT ("organizationId", "branchId") DO UPDATE
    SET "nextSequence" = "organization_invoice_counters"."nextSequence" + 1,
        "updatedAt" = NOW()
    RETURNING "nextSequence"
  `;
    return Number(rows[0]?.nextSequence ?? 0);
}
async function nextInvoiceSequenceFromLegacySequence() {
    const rows = await prisma_1.prisma.$queryRaw `
    SELECT nextval('invoice_seq')::bigint AS "nextSequence"
  `;
    return Number(rows[0]?.nextSequence ?? 0);
}
async function allocateNextInvoiceSequence(organizationId, branchId) {
    if (invoiceSequenceMode === 'per_org') {
        return nextInvoiceSequenceFromCounterTable(organizationId, branchId);
    }
    if (invoiceSequenceMode === 'legacy_sequence') {
        return nextInvoiceSequenceFromLegacySequence();
    }
    try {
        const sequence = await nextInvoiceSequenceFromCounterTable(organizationId, branchId);
        invoiceSequenceMode = 'per_org';
        return sequence;
    }
    catch (error) {
        if (!isMissingDatabaseObjectError(error, 'organization_invoice_counters')) {
            throw error;
        }
    }
    try {
        const sequence = await nextInvoiceSequenceFromLegacySequence();
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
function rcptLabelToRra(label) {
    switch (label) {
        case 'NR': return { rcptTyCd: 'R' };
        case 'CS': return { rcptTyCd: 'CS' };
        case 'CR': return { rcptTyCd: 'CR' };
        case 'TS': return { rcptTyCd: 'TS' };
        case 'TR': return { rcptTyCd: 'TR' };
        case 'PS': return { rcptTyCd: 'P' };
        default: return { rcptTyCd: 'S' }; // NS = Normal Sale
    }
}
function pmtTypeCd(paymentType) {
    switch (paymentType) {
        case 'CASH': return '01';
        case 'CREDIT_CARD': return '02';
        case 'MOBILE_MONEY': return '04';
        case 'INSURANCE': return '05';
        default: return '03'; // bank / other
    }
}
/**
 * C4: Build the RRA ALGO EBM API v8.2 /saveInvc payload.
 * Replaces the old buildSaleGatewayPayload which used wrong field names, ISO dates, and no tax slots.
 */
function buildRraSendReceiptPayload(sale, _org) {
    const { rcptTyCd } = rcptLabelToRra(sale.rcptLabel);
    // Per-tax-code accumulators: slot 1=A(exempt), 2=B(VAT18%), 3=C(zero-rated), 4=D(non-taxable)
    const taxblAmt = [0, 0, 0, 0];
    const taxAmt = [0, 0, 0, 0];
    const codeToSlot = { A: 0, B: 1, C: 2, D: 3 };
    const itemList = sale.saleItems.map((si, idx) => {
        const slot = codeToSlot[(si.taxCode ?? 'A').toUpperCase()] ?? 0;
        const tAmt = fix2(si.taxAmount.toNumber());
        const tbAmt = fix2(si.totalPrice.toNumber() - tAmt);
        taxblAmt[slot] = fix2(taxblAmt[slot] + tbAmt);
        taxAmt[slot] = fix2(taxAmt[slot] + tAmt);
        return {
            itemSeq: idx + 1,
            itemCd: si.product?.itemCd ?? `P${si.productId ?? idx + 1}`,
            itemClsCd: si.product?.itemClsCd ?? '5020230302',
            itemNm: si.product?.name ?? 'Item',
            orgnNatCd: 'RW',
            pkg: si.quantity,
            pkgUnitCd: si.product?.pkgUnitCd ?? 'CT',
            qty: si.quantity,
            qtyUnitCd: si.product?.qtyUnitCd ?? 'U',
            prc: fix2(si.unitPrice.toNumber()),
            splyAmt: fix2(tbAmt),
            dcRt: fix2(si.dcRate.toNumber()),
            dcAmt: fix2(si.dcAmt.toNumber()),
            taxTyCd: (si.taxCode ?? 'A').toUpperCase(),
            taxblAmt: fix2(tbAmt),
            taxAmt: fix2(tAmt),
            totAmt: fix2(si.totalPrice.toNumber()),
        };
    });
    const totTaxAmt = fix2(taxAmt.reduce((s, v) => s + v, 0));
    const totTaxblAmt = fix2(taxblAmt.reduce((s, v) => s + v, 0));
    const totAmt = fix2(sale.totalAmount.toNumber());
    const now = sale.createdAt;
    return {
        invcNo: sale.invoiceNumber ?? sale.saleNumber,
        orgInvcNo: 0,
        custTin: sale.customer.TIN ?? '',
        custMblNo: sale.customer.phone ?? '',
        remark: '',
        rcptTyCd,
        pmtTyCd: pmtTypeCd(sale.paymentType),
        salesDt: toRraDate(now),
        stockRlsDt: toRraDateTime(now),
        totItemCnt: itemList.length,
        taxblAmt1: taxblAmt[0],
        taxblAmt2: taxblAmt[1],
        taxblAmt3: taxblAmt[2],
        taxblAmt4: taxblAmt[3],
        taxAmt1: taxAmt[0],
        taxAmt2: taxAmt[1],
        taxAmt3: taxAmt[2],
        taxAmt4: taxAmt[3],
        totTaxblAmt,
        totTaxAmt,
        totAmt,
        prchrAcptcYn: 'N',
        itemList,
    };
}
/** @deprecated Use buildRraSendReceiptPayload instead. */
function buildSaleGatewayPayload(sale, org) {
    return buildRraSendReceiptPayload(sale, org);
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
 */
async function generateInvoiceNumber(organizationId, branchId) {
    const sequence = (await allocateNextInvoiceSequence(organizationId, branchId))
        .toString()
        .padStart(6, '0');
    const organization = await prisma_1.prisma.organization.findUnique({
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
        select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
    });
    if (!org) {
        return { success: false, error: 'Organization not found' };
    }
    const payload = buildRraSendReceiptPayload(sale, org);
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
    if (config_1.config.ebm.useMock) {
        const mockRef = `MOCK-EBM-${txRow.id}`;
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: txRow.id },
            data: {
                submissionStatus: 'SUCCESS',
                ebmInvoiceNumber: mockRef,
                submittedAt: new Date(),
                responseData: {
                    mock: true,
                    environment: config_1.config.ebm.environment,
                    requestPayload: payload,
                    normalized: { ebmInvoiceNumber: mockRef },
                },
            },
        });
        return { success: true, ebmInvoiceNumber: mockRef };
    }
    if (!config_1.config.ebm.apiUrl) {
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
            select: { invoiceNumber: true, saleNumber: true, totalAmount: true, vatAmount: true },
        }),
        prisma_1.prisma.sale.findFirst({
            where: { id: params.refundSaleId, organizationId: params.organizationId },
            select: { saleNumber: true, totalAmount: true, vatAmount: true },
        }),
        prisma_1.prisma.organization.findUnique({
            where: { id: params.organizationId },
            select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
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
    const body = {
        environment: config_1.config.ebm.environment,
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
    if (config_1.config.ebm.useMock) {
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: refundRow.id },
            data: {
                submissionStatus: 'SUCCESS',
                ebmInvoiceNumber: `MOCK-REFUND-${refundRow.id}`,
                submittedAt: new Date(),
                responseData: { mock: true, requestPayload: body },
            },
        });
        return { success: true };
    }
    if (!config_1.config.ebm.apiUrl) {
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
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(params.organizationId);
        body.operation = 'REFUND';
        const result = await (0, vsdc_api_service_1.saveInvc)(envelope, body);
        if (!result.success) {
            const msg = result.error ?? 'Refund VSDC error';
            await prisma_1.prisma.ebmTransaction.update({
                where: { id: refundRow.id },
                data: {
                    submissionStatus: 'FAILED',
                    errorMessage: msg,
                    responseData: { vsdcResult: result, requestPayload: body },
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
                responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: body },
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
    const sale = await prisma_1.prisma.sale.findFirst({
        where: { id: params.saleId, organizationId: params.organizationId },
        select: { invoiceNumber: true, saleNumber: true },
    });
    const org = await prisma_1.prisma.organization.findUnique({
        where: { id: params.organizationId },
        select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
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
    const body = {
        environment: config_1.config.ebm.environment,
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
    if (config_1.config.ebm.useMock) {
        await prisma_1.prisma.ebmTransaction.update({
            where: { id: voidRow.id },
            data: {
                submissionStatus: 'SUCCESS',
                ebmInvoiceNumber: `MOCK-VOID-${voidRow.id}`,
                submittedAt: new Date(),
                responseData: { mock: true, requestPayload: body },
            },
        });
        return { success: true };
    }
    if (!config_1.config.ebm.apiUrl) {
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
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(params.organizationId);
        body.operation = 'VOID';
        const result = await (0, vsdc_api_service_1.saveInvc)(envelope, body);
        if (!result.success) {
            const msg = result.error ?? 'Void VSDC error';
            await prisma_1.prisma.ebmTransaction.update({
                where: { id: voidRow.id },
                data: {
                    submissionStatus: 'FAILED',
                    errorMessage: msg,
                    responseData: { vsdcResult: result, requestPayload: body },
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
                responseData: { raw: result.rawBody, normalized: vsdc, requestPayload: body },
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
