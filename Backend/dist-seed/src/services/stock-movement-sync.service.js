"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitStockMovementToEbm = submitStockMovementToEbm;
exports.submitStockMovementToEbmAsync = submitStockMovementToEbmAsync;
const prisma_1 = require("../lib/prisma");
const rra_ebm_service_1 = require("./rra-ebm.service");
const vsdc_api_service_1 = require("./vsdc-api.service");
/**
 * Submit a stock movement/adjustment to the RRA VSDC gateway via /selectMvmt.
 */
async function submitStockMovementToEbm(movementId) {
    if (!(0, rra_ebm_service_1.isEbmEnabled)()) {
        return { success: true };
    }
    const movement = await prisma_1.prisma.stockMovement.findUnique({
        where: { id: movementId },
        include: {
            product: { select: { name: true, sku: true } },
            branch: { select: { id: true, code: true, name: true } },
        },
    });
    if (!movement) {
        return { success: false, error: 'Stock movement not found' };
    }
    // RRA requires a non-empty reference (document ID) for inventory transactions
    if (!movement.reference || movement.reference.trim() === '') {
        return { success: false, error: 'Please provide inventory document Id' };
    }
    try {
        const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(movement.organizationId, movement.branchId);
        const payload = {
            operation: 'SELECT_MVMT',
            movementType: movement.type,
            productId: movement.productId,
            productName: movement.product?.name ?? '',
            quantity: movement.quantity,
            previousStock: movement.previousStock,
            newStock: movement.newStock,
            movementDate: movement.createdAt.toISOString(),
            branchCode: movement.branch?.code ?? '',
            reference: movement.reference ?? '',
            note: movement.note ?? '',
        };
        const result = await (0, vsdc_api_service_1.selectMvmt)(envelope, payload);
        if (result.success) {
            return { success: true };
        }
        return { success: false, error: result.error ?? 'VSDC movement sync failed' };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'Stock movement sync error';
        return { success: false, error: message };
    }
}
/**
 * Async fire-and-forget wrapper.
 */
function submitStockMovementToEbmAsync(movementId) {
    submitStockMovementToEbm(movementId).catch((err) => console.error(`[EBM] Stock movement #${movementId} sync failed:`, err));
}
