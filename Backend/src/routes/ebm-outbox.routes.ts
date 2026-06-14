import { Router } from 'express';
import { getEbmOutbox, checkEbmOutboxStatus } from '../controllers/ebm-outbox.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/:organizationId/ebm-outbox', authenticate, getEbmOutbox);
router.post('/:organizationId/ebm-outbox/:id/check-status', authenticate, checkEbmOutboxStatus);

export default router;
