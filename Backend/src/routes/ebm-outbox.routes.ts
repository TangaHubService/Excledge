import { Router } from 'express';
import {
  getEbmOutbox,
  checkEbmOutboxStatus,
  getEbmStatus,
  submitZReport,
  getZReportStatus,
} from '../controllers/ebm-outbox.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/feature-access.middleware';

const router = Router();

router.get('/:organizationId/ebm-status', authenticate, requireActiveSubscription(), getEbmStatus);
router.get('/:organizationId/ebm-outbox', authenticate, requireActiveSubscription(), getEbmOutbox);
router.post('/:organizationId/ebm-outbox/:id/check-status', authenticate, requireActiveSubscription(), checkEbmOutboxStatus);
router.post('/:organizationId/z-report', authenticate, requireActiveSubscription(), submitZReport);
router.get('/:organizationId/z-report', authenticate, requireActiveSubscription(), getZReportStatus);

export default router;
