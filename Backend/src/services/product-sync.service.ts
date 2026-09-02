import { prisma } from '../lib/prisma';
import { config } from '../config';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, saveItem } from './vsdc-api.service';
import { DEFAULT_ITEM_CLASSIFICATION_CD, itemTypeCodeDigit, ORIGIN_NATION_CODE } from './item-code.service';

/**
 * Synchronize a product with the RRA VSDC gateway via POST /items/saveItems
 * (VSDC API Documentation v1.0.5 §3.3.4.1 — the "ItemSaveReq" shape).
 *
 * Idempotent: if the product is already SYNCED and no relevant fields
 * have changed, the call is skipped.
 */
export async function syncProductToRra(
  productId: number,
  userId?: number,
): Promise<{ success: boolean; error?: string }> {
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

  // itemCd/qtyUnitCd are required by the real ItemSaveReq shape and are
  // always allocated at product-creation time (see inventory.controller.ts).
  // If either is still missing, refuse to sync rather than invent one — a
  // fabricated itemCd would corrupt RRA's item registry for this taxpayer.
  // (itemClsCd, by contrast, falls back to DEFAULT_ITEM_CLASSIFICATION_CD
  // below — see that constant's comment for why.)
  if (!product.itemCd || !product.qtyUnitCd) {
    await prisma.product.update({
      where: { id: productId },
      data: { ebmSyncStatus: 'FAILED' },
    });
    return { success: false, error: 'Product is missing itemCd/qtyUnitCd — cannot register with RRA' };
  }

  try {
    const envelope = await buildVsdcEnvelope(product.organizationId);

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
      : null;
    const regrNm = user?.name ?? 'System';
    const regrId = user ? String(user.id) : 'system';

    // Field names match RRA VSDC API Documentation v1.0.5 §3.3.4.1 (ItemSaveReq)
    // exactly, so the payload can be read alongside the spec without translation.
    const payload: Record<string, unknown> = {
      itemCd: product.itemCd,
      itemClsCd: product.itemClsCd ?? DEFAULT_ITEM_CLASSIFICATION_CD,
      itemTyCd: itemTypeCodeDigit(product.itemType),
      itemNm: product.name,
      itemStdNm: product.itemStandardName ?? undefined,
      orgnNatCd: product.origin ?? ORIGIN_NATION_CODE,
      pkgUnitCd: product.pkgUnitCd ?? 'CT',
      qtyUnitCd: product.qtyUnitCd,
      taxTyCd: product.taxCode ?? 'B',
      btchNo: product.batchNumber ?? undefined,
      bcd: product.barcode ?? undefined,
      dftPrc: Number(product.unitPrice),
      grpPrcL1: product.l1SalePrice != null ? Number(product.l1SalePrice) : undefined,
      grpPrcL2: product.l2SalePrice != null ? Number(product.l2SalePrice) : undefined,
      grpPrcL3: product.l3SalePrice != null ? Number(product.l3SalePrice) : undefined,
      grpPrcL4: product.l4SalePrice != null ? Number(product.l4SalePrice) : undefined,
      grpPrcL5: product.l5SalePrice != null ? Number(product.l5SalePrice) : undefined,
      addInfo: product.additionalInfo ?? undefined,
      sftyQty: product.minStock,
      isrcAplcbYn: product.useInsurance ? 'Y' : 'N',
      useYn: product.isActive ? 'Y' : 'N',
      regrNm,
      regrId,
      modrNm: regrNm,
      modrId: regrId,
    };

    const requestUrl = `${(envelope.vsdcUrl ?? '').replace(/\/$/, '')}${config.ebm.itemPath || '/items/saveItems'}`;
    console.log(
      `[EBM][ProductSync] productId=${productId} orgId=${product.organizationId} itemCd=${product.itemCd} ` +
      `POST ${requestUrl} request=${JSON.stringify({ ...envelope, vsdcUrl: undefined, ...payload })}`,
    );

    const result = await saveItem(envelope, payload);

    console.log(
      `[EBM][ProductSync] productId=${productId} itemCd=${product.itemCd} ` +
      `success=${result.success} httpStatus=${result.rawStatus} ` +
      `response=${JSON.stringify(result.rawBody)}${result.error ? ` error=${result.error}` : ''}`,
    );

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

    console.error(`[EBM][ProductSync] productId=${productId} exception: ${message}`);

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
export function syncProductToRraAsync(productId: number, userId?: number): void {
  syncProductToRra(productId, userId).catch((err) =>
    console.error(`[EBM] Product sync #${productId} failed:`, err),
  );
}
