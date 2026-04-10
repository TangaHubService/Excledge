import { Router } from "express";
import { systemOwnerController } from "../controllers/system-owner.controller";
import {
  authenticate,
  requireSystemOwner,
} from "../middleware/auth.middleware";

const router = Router();

// All routes require system owner authentication
router.use(authenticate);
router.use(requireSystemOwner);

// Dashboard stats
router.get("/dashboard/stats", systemOwnerController.getDashboardStats);

// Organization management
router.get("/organizations", systemOwnerController.getAllOrganizations);
router.get("/organizations/:id", systemOwnerController.getOrganizationDetails);
router.patch(
  "/organizations/:id/status",
  systemOwnerController.updateOrganizationStatus
);

// Subscription management
router.get("/subscriptions", systemOwnerController.getAllSubscriptions);
router.get(
  "/subscriptions/expiring",
  systemOwnerController.getExpiringSubscriptions
);

// Payment management
router.get("/payments", systemOwnerController.getAllPayments);
router.get("/payments/pending", systemOwnerController.getPendingPayments);

// Analytics
router.get("/analytics/revenue", systemOwnerController.getRevenueAnalytics);
router.get("/analytics/growth", systemOwnerController.getGrowthAnalytics);

export default router;
