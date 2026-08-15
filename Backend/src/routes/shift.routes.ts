import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { branchAuth } from '../middleware/branchAuth.middleware';
import { requireOrganizationAccess } from '../middleware/organizationAccess.middleware';
import { requireActiveSubscription } from '../middleware/feature-access.middleware';
import {
  openShiftController,
  getActiveShiftController,
  getShiftSummaryController,
  closeShiftController,
} from '../controllers/shift.controller';

const router = Router();
const orgAccess = requireOrganizationAccess();
const roles = authorize('ADMIN', 'SELLER', 'ACCOUNTANT', 'BRANCH_MANAGER');

router.use(authenticate);

router.post('/:organizationId', orgAccess, requireActiveSubscription(), branchAuth, roles, openShiftController);
router.get('/:organizationId/active', orgAccess, requireActiveSubscription(), branchAuth, roles, getActiveShiftController);
router.get('/:organizationId/:id/summary', orgAccess, requireActiveSubscription(), branchAuth, roles, getShiftSummaryController);
router.put('/:organizationId/:id/close', orgAccess, requireActiveSubscription(), branchAuth, roles, closeShiftController);

export default router;
