import { prisma } from '../lib/prisma';
import { config } from '../config';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, saveItem } from './vsdc-api.service';
import { itemTypeCodeDigit, getOriginNationCode } from './item-code.service';

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
  branchId?: number | null,
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
  // itemClsCd is required by RRA VSDC specification — fail sync if not set
  // instead of silently falling back to a generic code.
  if (!product.itemCd || !product.qtyUnitCd) {
    await prisma.product.update({
      where: { id: productId },
      data: { ebmSyncStatus: 'FAILED' },
    });
    return { success: false, error: 'Product is missing itemCd/qtyUnitCd — cannot register with RRA' };
  }

  if (!product.itemClsCd) {
    await prisma.product.update({
      where: { id: productId },
      data: { ebmSyncStatus: 'FAILED' },
    });
    return { success: false, error: 'Product is missing RRA item classification (itemClsCd) — cannot register with RRA. Please select a valid RRA item classification.' };
  }

  if (!product.pkgUnitCd) {
    await prisma.product.update({
      where: { id: productId },
      data: { ebmSyncStatus: 'FAILED' },
    });
    return { success: false, error: 'Product is missing packaging unit (pkgUnitCd) — cannot register with RRA.' };
  }

  if (!product.taxCode) {
    await prisma.product.update({
      where: { id: productId },
      data: { ebmSyncStatus: 'FAILED' },
    });
    return { success: false, error: 'Product is missing tax code (taxTyCd) — cannot register with RRA.' };
  }

  try {
    // Prefer an explicit branch; otherwise use the org default branch so ItemSaveReq
    // carries the correct RRA bhfId (HQ = "00") rather than a stale org fallback.
    let resolvedBranchId = branchId ?? null;
    if (resolvedBranchId == null) {
      const def = await prisma.branch.findFirst({
        where: { organizationId: product.organizationId, status: 'ACTIVE' },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        select: { id: true },
      });
      resolvedBranchId = def?.id ?? null;
    }
    const envelope = await buildVsdcEnvelope(product.organizationId, resolvedBranchId);

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
      : null;
    const regrNm = user?.name ?? 'System';
    const regrId = user ? String(user.id) : 'system';

    // Field names match RRA VSDC API Documentation v1.0.5 §3.3.4.1 (ItemSaveReq)
    // exactly, so the payload can be read alongside the spec without translation.
    // origin is stored on the product; fallback to org default if somehow missing
    const origin = product.origin ?? (await getOriginNationCode(product.organizationId));

    const payload: Record<string, unknown> = {
      itemCd: product.itemCd,
      itemClsCd: product.itemClsCd,
      itemTyCd: itemTypeCodeDigit(product.itemType),
      itemNm: product.name,
      itemStdNm: product.itemStandardName ?? undefined,
      orgnNatCd: origin,
      pkgUnitCd: product.pkgUnitCd,
      qtyUnitCd: product.qtyUnitCd,
      taxTyCd: product.taxCode,
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

    const requestUrl = `${(envelope.vsdcUrl ?? config.ebm.apiUrl ?? '').replace(/\/$/, '')}${config.ebm.itemPath || '/items/saveItems'}`;
    console.log(
      `[EBM][ProductSync] productId=${productId} orgId=${product.organizationId} itemCd=${product.itemCd} ` +
      `POST ${requestUrl} request=${JSON.stringify({ tin: envelope.tin, bhfId: envelope.bhfId, ...payload })}`,
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
