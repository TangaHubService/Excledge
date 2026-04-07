import { Router } from "express";
import {
  getDashboardStats,
  getSalesTrend,
  getNotifications,
  topSellingProducts,
  getDetailedInventory,
} from "../controllers/dashboard.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { branchAuth } from "../middleware/branchAuth.middleware";

const router = Router();

const orgAccess = requireOrganizationAccess();

router.get("/stats/:organizationId", authenticate, orgAccess, branchAuth, getDashboardStats);
router.get("/sales-trend/:organizationId", authenticate, orgAccess, branchAuth, getSalesTrend);
router.get("/notifications/:organizationId", authenticate, orgAccess, branchAuth, getNotifications);
router.get("/:organizationId/top-selling-products", authenticate, orgAccess, branchAuth, topSellingProducts);
router.get("/:organizationId/detailed-inventory", authenticate, orgAccess, branchAuth, getDetailedInventory);

export default router;
