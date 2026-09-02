import type { Response } from 'express';
import type { BranchAuthRequest } from '../middleware/branchAuth.middleware';
import { prisma } from '../lib/prisma';
import { success, error as apiError } from '../utils/apiResponse';
import {
  syncRraCodes,
  syncRraItemClasses,
  syncRraNotices,
  syncAllRraMasterData,
  verifyCustomerTin,
  pullRraItems,
} from '../services/rra-master-data.service';
import { processStockSyncBatch, queuePendingStockForOrg } from '../services/stock-movement-sync.service';
import { syncRraPurchases, confirmRraPurchase } from '../services/purchase-sync.service';
import { syncRraImports, actionRraImport } from '../services/rra-import.service';
import { syncProductToRra } from '../services/product-sync.service';
import { RraTaxCode } from '@prisma/client';

const branchOf = (req: BranchAuthRequest): number | null => {
  const b = req.query.branchId ?? req.body?.branchId;
  return b != null && b !== '' ? parseInt(String(b)) : null;
};

// ── Codes (§59) ───────────────────────────────────────────────

export async function syncCodes(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const outcome = await syncRraCodes(organizationId, branchOf(req));
    return outcome.ok ? res.json(success(outcome)) : res.status(502).json(apiError(outcome.error ?? 'Code sync failed', undefined, outcome));
  } catch (e: any) {
    console.error('[RRA codes sync]', e);
    res.status(500).json(apiError('Failed to sync RRA codes'));
  }
}

export async function listCodes(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const cdCls = req.query.cdCls as string | undefined;
    const rows = await prisma.rraCode.findMany({
      where: { organizationId, ...(cdCls ? { cdCls } : {}) },
      orderBy: [{ cdCls: 'asc' }, { srtOrd: 'asc' }, { cd: 'asc' }],
    });
    // Group by class for the caller's dropdowns.
    const byClass: Record<string, { cdClsNm: string | null; codes: typeof rows }> = {};
    for (const r of rows) {
      (byClass[r.cdCls] ??= { cdClsNm: r.cdClsNm, codes: [] as any }).codes.push(r);
    }
    res.json(success({ classes: byClass, count: rows.length }));
  } catch (e: any) {
    console.error('[RRA codes list]', e);
    res.status(500).json(apiError('Failed to list RRA codes'));
  }
}

// ── Item classification / UNSPSC (§61) ────────────────────────

export async function syncItemClasses(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const outcome = await syncRraItemClasses(organizationId, branchOf(req));
    return outcome.ok ? res.json(success(outcome)) : res.status(502).json(apiError(outcome.error ?? 'Item-class sync failed', undefined, outcome));
  } catch (e: any) {
    console.error('[RRA item-class sync]', e);
    res.status(500).json(apiError('Failed to sync RRA item classifications'));
  }
}

export async function searchItemClasses(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const q = (req.query.q as string | undefined)?.trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 30, 1), 100);
    const rows = await prisma.rraItemClass.findMany({
      where: {
        organizationId,
        useYn: 'Y',
        ...(q
          ? { OR: [{ itemClsCd: { contains: q } }, { itemClsNm: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ itemClsLvl: 'desc' }, { itemClsCd: 'asc' }],
      take: limit,
    });
    const total = await prisma.rraItemClass.count({ where: { organizationId } });
    res.json(success({ items: rows, cachedTotal: total }));
  } catch (e: any) {
    console.error('[RRA item-class search]', e);
    res.status(500).json(apiError('Failed to search RRA item classifications'));
  }
}

// ── Notices (§65) ─────────────────────────────────────────────

export async function syncNotices(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const outcome = await syncRraNotices(organizationId, branchOf(req));
    return outcome.ok ? res.json(success(outcome)) : res.status(502).json(apiError(outcome.error ?? 'Notice sync failed', undefined, outcome));
  } catch (e: any) {
    console.error('[RRA notices sync]', e);
    res.status(500).json(apiError('Failed to sync RRA notices'));
  }
}

export async function listNotices(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const [notices, unread] = await Promise.all([
      prisma.rraNotice.findMany({ where: { organizationId }, orderBy: { noticeNo: 'desc' }, take: 200 }),
      prisma.rraNotice.count({ where: { organizationId, readAt: null } }),
    ]);
    res.json(success({ notices, unread }));
  } catch (e: any) {
    console.error('[RRA notices list]', e);
    res.status(500).json(apiError('Failed to list RRA notices'));
  }
}

export async function markNoticeRead(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const noticeNo = parseInt(req.params.noticeNo);
    const updated = await prisma.rraNotice.updateMany({
      where: { organizationId, noticeNo, readAt: null },
      data: { readAt: new Date() },
    });
    res.json(success({ updated: updated.count }));
  } catch (e: any) {
    console.error('[RRA notice read]', e);
    res.status(500).json(apiError('Failed to update the notice'));
  }
}

// ── Customer verification (§62) ───────────────────────────────

export async function verifyCustomer(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const tin = String(req.params.tin ?? req.query.tin ?? '').trim();
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
    const result = await verifyCustomerTin(organizationId, tin, { branchId: branchOf(req), customerId });
    if (result.error) return res.status(502).json(apiError(result.error));
    res.json(success(result));
  } catch (e: any) {
    console.error('[RRA customer verify]', e);
    res.status(500).json(apiError('Failed to verify the customer TIN with RRA'));
  }
}

// ── Select Item reconciliation (§64) ──────────────────────────

/**
 * POST /:organizationId/rra/items/:productId/sync
 * Force-register one product with RRA (used by the reconcile view to push a
 * local-only item, or to apply RRA's value on a mismatch then re-register).
 * Optional body: { itemClsCd?, taxCode? } — applied to the product first.
 */
export async function syncOneProduct(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const productId = parseInt(req.params.productId);
    const { itemClsCd, taxCode } = req.body ?? {};

    const product = await prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true } });
    if (!product) return res.status(404).json(apiError('Product not found'));

    const data: any = { ebmSyncStatus: 'PENDING' }; // clear the SYNCED skip-guard so a re-register runs
    if (typeof itemClsCd === 'string' && itemClsCd.trim()) data.itemClsCd = itemClsCd.trim();
    if (typeof taxCode === 'string' && (RraTaxCode as any)[taxCode]) data.taxCode = taxCode;
    await prisma.product.update({ where: { id: productId }, data });

    const result = await syncProductToRra(productId, (req as any).user?.userId);
    return result.success
      ? res.json(success({ productId, ...result }))
      : res.status(502).json(apiError(result.error ?? 'Product sync failed'));
  } catch (e: any) {
    console.error('[RRA item sync]', e);
    res.status(500).json(apiError('Failed to sync the product with RRA'));
  }
}

export async function reconcileItems(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const result = await pullRraItems(organizationId, branchOf(req));
    if (!result.ok) return res.status(502).json(apiError(result.error ?? 'Item reconciliation failed'));
    res.json(success({
      pulled: result.items.length,
      diff: {
        rraOnly: result.diff.rraOnly.length,
        localOnly: result.diff.localOnly.length,
        mismatched: result.diff.mismatched.length,
      },
      details: result.diff,
    }));
  } catch (e: any) {
    console.error('[RRA item reconcile]', e);
    res.status(500).json(apiError('Failed to reconcile items with RRA'));
  }
}

// ── Combined sync + status ───────────────────────────────────

export async function syncAll(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const outcomes = await syncAllRraMasterData(organizationId, branchOf(req));
    res.json(success({ outcomes }));
  } catch (e: any) {
    console.error('[RRA master-data sync all]', e);
    res.status(500).json(apiError('Failed to sync RRA master data'));
  }
}

// ── Stock In/Out + Stock Master (§23, §72, §73) ──────────────

export async function syncStock(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const queued = await queuePendingStockForOrg(organizationId);
    const result = await processStockSyncBatch(50);
    res.json(success({ queued, ...result }));
  } catch (e: any) {
    console.error('[RRA stock sync]', e);
    res.status(500).json(apiError('Failed to sync stock with RRA'));
  }
}

export async function stockSyncStatus(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const grouped = await prisma.inventoryLedger.groupBy({
      by: ['ebmSyncStatus'],
      where: { organizationId, movementType: { not: 'SALE' } },
      _count: true,
    });
    const counts: Record<string, number> = { PENDING: 0, SYNCED: 0, FAILED: 0, NOT_APPLICABLE: 0 };
    for (const g of grouped) counts[g.ebmSyncStatus ?? 'NOT_APPLICABLE'] = (g as any)._count;
    const failures = await prisma.inventoryLedger.findMany({
      where: { organizationId, ebmSyncStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, movementType: true, quantity: true, direction: true, ebmError: true, createdAt: true, product: { select: { name: true } } },
    });
    res.json(success({ counts, failures }));
  } catch (e: any) {
    console.error('[RRA stock status]', e);
    res.status(500).json(apiError('Failed to read stock-sync status'));
  }
}

// ── B2B purchases (§70, §71) ─────────────────────────────────

export async function syncPurchases(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const result = await syncRraPurchases(organizationId, branchOf(req));
    return result.ok ? res.json(success(result)) : res.status(502).json(apiError(result.error ?? 'Purchase sync failed'));
  } catch (e: any) {
    console.error('[RRA purchases sync]', e);
    res.status(500).json(apiError('Failed to pull purchases from RRA'));
  }
}

export async function listRraPurchases(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const status = req.query.status as string | undefined;
    const rows = await prisma.rraPurchase.findMany({
      where: { organizationId, ...(status ? { status: status as any } : {}) },
      include: { items: { orderBy: { itemSeq: 'asc' } } },
      orderBy: { pulledAt: 'desc' },
      take: 200,
    });
    const pending = await prisma.rraPurchase.count({ where: { organizationId, status: 'PENDING' } });
    // spplrInvcNo is a BigInt column — JSON.stringify cannot serialize it.
    const purchases = rows.map((r) => ({ ...r, spplrInvcNo: r.spplrInvcNo.toString() }));
    res.json(success({ purchases, pending }));
  } catch (e: any) {
    console.error('[RRA purchases list]', e);
    res.status(500).json(apiError('Failed to list RRA purchases'));
  }
}

export async function confirmPurchase(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const id = parseInt(req.params.id);
    const reject = req.query.reject === 'true' || req.body?.reject === true;
    const result = await confirmRraPurchase(organizationId, id, {
      branchId: branchOf(req),
      userId: (req as any).user?.userId,
      reject,
      prcOrdCd: req.body?.prcOrdCd,
    });
    return result.success ? res.json(success(result)) : res.status(502).json(apiError(result.error ?? 'Purchase confirmation failed'));
  } catch (e: any) {
    console.error('[RRA purchase confirm]', e);
    res.status(500).json(apiError('Failed to confirm the purchase'));
  }
}

// ── Import declarations (§66, §67, §68) ──────────────────────

export async function syncImports(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const requestDate = (req.body?.requestDate ?? req.query.requestDate) as string | undefined;
    const result = await syncRraImports(organizationId, { branchId: branchOf(req), requestDate });
    return result.ok ? res.json(success(result)) : res.status(400).json(apiError(result.error ?? 'Import sync failed', undefined, result));
  } catch (e: any) {
    console.error('[RRA imports sync]', e);
    res.status(500).json(apiError('Failed to pull import declarations from RRA'));
  }
}

export async function listRraImports(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const status = req.query.status as string | undefined;
    const [rows, pending, cursor] = await Promise.all([
      prisma.rraImportItem.findMany({
        where: { organizationId, ...(status ? { status: status as any } : {}) },
        orderBy: [{ dclDe: 'desc' }, { itemSeq: 'asc' }],
        take: 300,
      }),
      prisma.rraImportItem.count({ where: { organizationId, status: 'PENDING' } }),
      prisma.rraSyncCursor.findUnique({ where: { organizationId_resource: { organizationId, resource: 'imports' } } }),
    ]);
    res.json(success({ imports: rows, pending, lastRequestDate: cursor?.lastReqDt?.slice(0, 8) ?? null }));
  } catch (e: any) {
    console.error('[RRA imports list]', e);
    res.status(500).json(apiError('Failed to list import declarations'));
  }
}

export async function actionImport(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const id = parseInt(req.params.id);
    const action = req.params.action === 'reject' ? 'reject' : 'approve';
    const { itemClsCd, itemCd, linkProductId, remark } = req.body ?? {};
    const result = await actionRraImport(organizationId, id, action, {
      branchId: branchOf(req),
      userId: (req as any).user?.userId,
      itemClsCd,
      itemCd,
      linkProductId: linkProductId != null ? parseInt(String(linkProductId)) : undefined,
      remark,
    });
    return result.success ? res.json(success(result)) : res.status(502).json(apiError(result.error ?? 'Import action failed'));
  } catch (e: any) {
    console.error('[RRA import action]', e);
    res.status(500).json(apiError('Failed to update the import declaration'));
  }
}

export async function masterDataStatus(req: BranchAuthRequest, res: Response) {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const [cursors, codeCount, classCount, noticeCount, unread] = await Promise.all([
      prisma.rraSyncCursor.findMany({ where: { organizationId } }),
      prisma.rraCode.count({ where: { organizationId } }),
      prisma.rraItemClass.count({ where: { organizationId } }),
      prisma.rraNotice.count({ where: { organizationId } }),
      prisma.rraNotice.count({ where: { organizationId, readAt: null } }),
    ]);
    res.json(success({
      cursors,
      counts: { codes: codeCount, itemClasses: classCount, notices: noticeCount, unreadNotices: unread },
    }));
  } catch (e: any) {
    console.error('[RRA master-data status]', e);
    res.status(500).json(apiError('Failed to read RRA master-data status'));
  }
}
