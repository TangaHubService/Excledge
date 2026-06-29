"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitPurchaseToEbm = submitPurchaseToEbm;
exports.submitPurchaseToEbmAsync = submitPurchaseToEbmAsync;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const rra_ebm_service_1 = require("./rra-ebm.service");
const vsdc_api_service_1 = require("./vsdc-api.service");
const tax_service_1 = require("./tax.service");
/**
 * Submit a B2B purchase order to the RRA VSDC gateway via /savePurc.
 */
async function submitPurchaseToEbm(purchaseOrderId) {
    if (!(0, rra_ebm_service_1.isEbmEnabled)()) {
        return { success: true };
    }
    const po = await prisma_1.prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
            supplier: { select: { name: true, email: true } },
            items: true,
        },
    });
    if (!po) {
        return { success: false, error: 'Purchase order not found' };
    }
    const supplierTin = po.supplier?.email ?? '';
    // Validate line-item tax codes and rates (RRA compliance)
    for (const item of po.items) {
        const taxCode = item.taxCode ?? client_1.RraTaxCode.A;
        if (!tax_service_1.TaxService.ALLOWED_TAX_CODES.has(taxCode)) {
            return {
                success: false,
                error: `Invalid tax code "${taxCode}" on item "${item.productName}"`,
            };
        }
        const itemTaxRate = Number(item.taxRate ?? 0);
        const { valid, expectedRate } = tax_service_1.TaxService.validateTaxRate(taxCode, itemTaxRate);
        if (!valid) {
            return {
                success: false,
                error: `Line item "${item.productName}" tax rate ${itemTaxRate} is not allowed for code ${taxCode}. Expected ${expectedRate}%.`,
            };
        }
    }
    try {
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(po.organizationId);
        const payload = {
            operation: 'SAVE_PURC',
            purchaseOrderNumber: po.orderNumber,
            supplierName: po.supplier?.name ?? '',
            supplierTin,
            totalAmount: Number(po.totalAmount),
            status: po.status,
            orderedAt: po.orderedAt.toISOString(),
            items: po.items.map((item) => ({
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                totalPrice: Number(item.totalPrice),
                taxCode: item.taxCode ?? 'A',
                taxRate: Number(item.taxRate ?? 0),
            })),
        };
        const result = await (0, vsdc_api_service_1.savePurc)(envelope, payload);
        if (result.success) {
            return { success: true };
        }
        return { success: false, error: result.error ?? 'VSDC purchase sync failed' };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'Purchase sync error';
        return { success: false, error: message };
    }
}
/**
 * Async fire-and-forget wrapper.
 */
function submitPurchaseToEbmAsync(purchaseOrderId) {
    submitPurchaseToEbm(purchaseOrderId).catch((err) => console.error(`[EBM] Purchase #${purchaseOrderId} sync failed:`, err));
}
