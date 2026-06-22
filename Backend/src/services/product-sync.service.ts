import { prisma } from '../lib/prisma';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, saveItem } from './vsdc-api.service';

/**
 * Synchronize a product with the RRA VSDC gateway via /saveItem.
 *
 * Idempotent: if the product is already SYNCED and no relevant fields
 * have changed, the call is skipped.
 */
export async function syncProductToRra(productId: number): Promise<{ success: boolean; error?: string }> {
  if (!isEbmEnabled()) {
    return { success: true };
  }

  const product = await prisma.product.findUnique({
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
    const envelope = await buildVsdcEnvelope(product.organizationId);

    const payload: Record<string, unknown> = {
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

    const result = await saveItem(envelope, payload);

    if (result.success) {
      await prisma.product.update({
        where: { id: productId },
        data: {
          ebmSyncStatus: 'SYNCED',
          ebmSyncedAt: new Date(),
        },
      });
      return { success: true };
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        ebmSyncStatus: 'FAILED',
      },
    });

    return { success: false, error: result.error ?? 'VSDC sync failed' };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Product sync error';

    await prisma.product.update({
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
export function syncProductToRraAsync(productId: number): void {
  syncProductToRra(productId).catch((err) =>
    console.error(`[EBM] Product sync #${productId} failed:`, err),
  );
}
