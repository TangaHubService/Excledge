import { prisma } from '../lib/prisma';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, selectMvmt } from './vsdc-api.service';

/**
 * Submit a stock movement/adjustment to the RRA VSDC gateway via /selectMvmt.
 */
export async function submitStockMovementToEbm(movementId: number): Promise<{ success: boolean; error?: string }> {
  if (!isEbmEnabled()) {
    return { success: true };
  }

  const movement = await prisma.stockMovement.findUnique({
    where: { id: movementId },
    include: {
      product: { select: { name: true, sku: true } },
      branch: { select: { id: true, code: true, name: true } },
    },
  });

  if (!movement) {
    return { success: false, error: 'Stock movement not found' };
  }

  try {
    const envelope = await buildVsdcEnvelope(movement.organizationId, movement.branchId);

    const payload: Record<string, unknown> = {
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

    const result = await selectMvmt(envelope, payload);

    if (result.success) {
      return { success: true };
    }

    return { success: false, error: result.error ?? 'VSDC movement sync failed' };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Stock movement sync error';
    return { success: false, error: message };
  }
}

/**
 * Async fire-and-forget wrapper.
 */
export function submitStockMovementToEbmAsync(movementId: number): void {
  submitStockMovementToEbm(movementId).catch((err) =>
    console.error(`[EBM] Stock movement #${movementId} sync failed:`, err),
  );
}
