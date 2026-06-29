"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncProductToRra = syncProductToRra;
exports.syncProductToRraAsync = syncProductToRraAsync;
const prisma_1 = require("../lib/prisma");
const rra_ebm_service_1 = require("./rra-ebm.service");
const vsdc_api_service_1 = require("./vsdc-api.service");
/**
 * Synchronize a product with the RRA VSDC gateway via /saveItem.
 *
 * Idempotent: if the product is already SYNCED and no relevant fields
 * have changed, the call is skipped.
 */
async function syncProductToRra(productId) {
    if (!(0, rra_ebm_service_1.isEbmEnabled)()) {
        return { success: true };
    }
    const product = await prisma_1.prisma.product.findUnique({
        where: { id: productId },
        include: { organization: true },
    });
    if (!product) {
        return { success: false, error: 'Product not found' };
    }
    // Skip if already synced (re-sync will be triggered on update)
    if (product.ebmSyncStatus === 'SYNCED') {
        return { success: true };
    }
    try {
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(product.organizationId);
        const payload = {
            operation: 'SAVE_ITEM',
            itemCode: String(product.id),
            itemName: product.name,
            itemSku: product.sku ?? '',
            barcode: product.barcode ?? '',
            unitPrice: Number(product.unitPrice),
            taxCode: product.taxCode ?? 'A',
            taxCategory: product.taxCategory,
            measurementUnit: product.measurementUnit,
            isActive: product.isActive,
        };
        const result = await (0, vsdc_api_service_1.saveItem)(envelope, payload);
        if (result.success) {
            await prisma_1.prisma.product.update({
                where: { id: productId },
                data: {
                    ebmSyncStatus: 'SYNCED',
                    ebmSyncedAt: new Date(),
                },
            });
            return { success: true };
        }
        await prisma_1.prisma.product.update({
            where: { id: productId },
            data: {
                ebmSyncStatus: 'FAILED',
            },
        });
        return { success: false, error: result.error ?? 'VSDC sync failed' };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'Product sync error';
        await prisma_1.prisma.product.update({
            where: { id: productId },
            data: {
                ebmSyncStatus: 'FAILED',
            },
        });
        return { success: false, error: message };
    }
}
/**
 * Async fire-and-forget wrapper for product sync.
 * Called from controller routes — never blocks the response.
 */
function syncProductToRraAsync(productId) {
    syncProductToRra(productId).catch((err) => console.error(`[EBM] Product sync #${productId} failed:`, err));
}
