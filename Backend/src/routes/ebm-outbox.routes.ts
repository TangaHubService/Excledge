import { Router } from 'express';
import { getEbmOutbox, checkEbmOutboxStatus } from '../controllers/ebm-outbox.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/feature-access.middleware';

const router = Router();

router.get('/:organizationId/ebm-outbox', authenticate, requireActiveSubscription(), getEbmOutbox);
router.post('/:organizationId/ebm-outbox/:id/check-status', authenticate, requireActiveSubscription(), checkEbmOutboxStatus);

export default router;
