import { Router } from 'express';
import {
  getEbmOutbox,
  checkEbmOutboxStatus,
  getEbmStatus,
  submitZReport,
  getZReportStatus,
  initializeDevice,
} from '../controllers/ebm-outbox.controller';
import {
  syncCodes,
  listCodes,
  syncItemClasses,
  searchItemClasses,
  syncNotices,
  listNotices,
  markNoticeRead,
  verifyCustomer,
  reconcileItems,
  syncOneProduct,
  syncAll,
  masterDataStatus,
  syncStock,
  stockSyncStatus,
  syncPurchases,
  listRraPurchases,
  confirmPurchase,
  syncImports,
  listRraImports,
  actionImport,
} from '../controllers/ebm-master-data.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/feature-access.middleware';

const router = Router();

router.get('/:organizationId/ebm-status', authenticate, requireActiveSubscription(), getEbmStatus);
router.get('/:organizationId/ebm-outbox', authenticate, requireActiveSubscription(), getEbmOutbox);
router.post('/:organizationId/ebm-outbox/:id/check-status', authenticate, requireActiveSubscription(), checkEbmOutboxStatus);
router.post('/:organizationId/z-report', authenticate, requireActiveSubscription(), submitZReport);
router.get('/:organizationId/z-report', authenticate, requireActiveSubscription(), getZReportStatus);
router.post('/:organizationId/ebm/initialize', authenticate, requireActiveSubscription(), initializeDevice);

// ── RRA master-data (Codes §59 / Item Class §61 / Customer §62 / Select Item §64 / Notices §65) ──
router.get('/:organizationId/rra/status', authenticate, requireActiveSubscription(), masterDataStatus);
router.post('/:organizationId/rra/sync-all', authenticate, requireActiveSubscription(), syncAll);

router.get('/:organizationId/rra/codes', authenticate, requireActiveSubscription(), listCodes);
router.post('/:organizationId/rra/codes/sync', authenticate, requireActiveSubscription(), syncCodes);

router.get('/:organizationId/rra/item-classes', authenticate, requireActiveSubscription(), searchItemClasses);
router.post('/:organizationId/rra/item-classes/sync', authenticate, requireActiveSubscription(), syncItemClasses);

router.get('/:organizationId/rra/notices', authenticate, requireActiveSubscription(), listNotices);
router.post('/:organizationId/rra/notices/sync', authenticate, requireActiveSubscription(), syncNotices);
router.post('/:organizationId/rra/notices/:noticeNo/read', authenticate, requireActiveSubscription(), markNoticeRead);

router.get('/:organizationId/rra/customers/:tin', authenticate, requireActiveSubscription(), verifyCustomer);
router.post('/:organizationId/rra/items/reconcile', authenticate, requireActiveSubscription(), reconcileItems);
router.post('/:organizationId/rra/items/:productId/sync', authenticate, requireActiveSubscription(), syncOneProduct);

// ── Stock In/Out §23/§72/§73 + B2B purchases §70/§71 ──
router.get('/:organizationId/rra/stock', authenticate, requireActiveSubscription(), stockSyncStatus);
router.post('/:organizationId/rra/stock/sync', authenticate, requireActiveSubscription(), syncStock);

router.get('/:organizationId/rra/purchases', authenticate, requireActiveSubscription(), listRraPurchases);
router.post('/:organizationId/rra/purchases/sync', authenticate, requireActiveSubscription(), syncPurchases);
router.post('/:organizationId/rra/purchases/:id/confirm', authenticate, requireActiveSubscription(), confirmPurchase);

// ── Import declarations §66/§67/§68 ──
router.get('/:organizationId/rra/imports', authenticate, requireActiveSubscription(), listRraImports);
router.post('/:organizationId/rra/imports/sync', authenticate, requireActiveSubscription(), syncImports);
router.post('/:organizationId/rra/imports/:id/:action', authenticate, requireActiveSubscription(), actionImport);

export default router;
