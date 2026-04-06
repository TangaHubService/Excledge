import { Router } from 'express';
import activityLogController from '../controllers/activity-log.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Get activity logs with filters
router.get('/:organizationId', authenticate, activityLogController.getActivityLogs);

// Get a specific activity log by ID
router.get('/:organizationId/:id', authenticate, activityLogController.getActivityLogById);

export default router;
