import { prisma } from '../lib/prisma';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, savePurc } from './vsdc-api.service';

/**
 * Submit a B2B purchase order to the RRA VSDC gateway via /savePurc.
 */
export async function submitPurchaseToEbm(purchaseOrderId: number): Promise<{ success: boolean; error?: string }> {
  if (!isEbmEnabled()) {
    return { success: true };
  }

  const po = await prisma.purchaseOrder.findUnique({
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

  try {
    const envelope = await buildVsdcEnvelope(po.organizationId);

    const payload: Record<string, unknown> = {
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
      })),
    };

    const result = await savePurc(envelope, payload);

    if (result.success) {
      return { success: true };
    }

    return { success: false, error: result.error ?? 'VSDC purchase sync failed' };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Purchase sync error';
    return { success: false, error: message };
  }
}

/**
 * Async fire-and-forget wrapper.
 */
export function submitPurchaseToEbmAsync(purchaseOrderId: number): void {
  submitPurchaseToEbm(purchaseOrderId).catch((err) =>
    console.error(`[EBM] Purchase #${purchaseOrderId} sync failed:`, err),
  );
}
