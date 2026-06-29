"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEbmOutbox = getEbmOutbox;
exports.checkEbmOutboxStatus = checkEbmOutboxStatus;
const prisma_1 = require("../lib/prisma");
const apiResponse_1 = require("../utils/apiResponse");
async function getEbmOutbox(req, res) {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const entries = await prisma_1.prisma.ebmOutbox.findMany({
            where: { organizationId },
            include: {
                sale: {
                    select: {
                        saleNumber: true,
                        invoiceNumber: true,
                        totalAmount: true,
                        createdAt: true,
                    },
                },
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 200,
        });
        res.json((0, apiResponse_1.success)(entries));
    }
    catch (error) {
        console.error('[EbmOutbox] Failed to fetch:', error);
        res.status(500).json((0, apiResponse_1.error)('Failed to fetch EBM outbox entries'));
    }
}
async function checkEbmOutboxStatus(req, res) {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const id = parseInt(req.params.id);
        const { idempotencyKey } = req.body;
        const entry = await prisma_1.prisma.ebmOutbox.findFirst({
            where: { id, organizationId },
        });
        if (!entry) {
            return res.status(404).json((0, apiResponse_1.error)('Outbox entry not found'));
        }
        // If there's a status check path configured, query VSDC
        // For now, verify against EbmTransaction table
        const tx = await prisma_1.prisma.ebmTransaction.findFirst({
            where: {
                idempotencyKey,
                submissionStatus: 'SUCCESS',
                ebmInvoiceNumber: { not: null },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (tx?.ebmInvoiceNumber) {
            await prisma_1.prisma.ebmOutbox.update({
                where: { id },
                data: {
                    status: 'SUCCEEDED',
                    sdcDateTime: tx.sdcDateTime,
                    lastError: null,
                },
            });
            return res.json((0, apiResponse_1.success)({ resolved: true, ebmInvoiceNumber: tx.ebmInvoiceNumber }));
        }
        res.json((0, apiResponse_1.success)({ resolved: false }));
    }
    catch (error) {
        console.error('[EbmOutbox] Status check failed:', error);
        res.status(500).json((0, apiResponse_1.error)('Failed to check outbox status'));
    }
}
