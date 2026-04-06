import { Router } from 'express';
import notificationController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Create a notification for an organization
router.post('/:organizationId', authenticate, notificationController.createNotification);

// Get notifications for an organization (supports ?unread=true & pagination)
router.get('/:organizationId', authenticate, notificationController.getNotifications);

// Mark a notification as read
router.patch('/:organizationId/:id/read', authenticate, notificationController.markAsRead);

// Trigger an event that might generate notifications
router.post('/:organizationId/events', authenticate, notificationController.triggerEvent);

export default router;
