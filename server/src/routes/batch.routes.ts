import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requireOrganizationAccess } from '../middleware/organizationAccess.middleware';
import {
  getProductBatches,
  getBatch,
  createBatchController,
  selectBatches,
} from '../controllers/batch.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireOrganizationAccess());

// Get batches for a product
router.get('/:organizationId/product/:productId', getProductBatches);

// Get single batch
router.get('/:organizationId/:id', getBatch);

// Create batch (Admin/Manager only)
router.post('/:organizationId', authorize('ADMIN', 'ACCOUNTANT'), createBatchController);

// Select batches for sale (used internally)
router.post('/:organizationId/select', selectBatches);

export default router;
