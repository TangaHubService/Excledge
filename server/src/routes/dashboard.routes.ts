import { Router } from "express";
import {
  getDashboardStats,
  getSalesTrend,
  getNotifications,
  topSellingProducts,
  getDetailedInventory,
} from "../controllers/dashboard.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/stats/:organizationId", authenticate, getDashboardStats);
router.get("/sales-trend/:organizationId", authenticate, getSalesTrend);
router.get("/notifications/:organizationId", authenticate, getNotifications);
router.get("/:organizationId/top-selling-products", authenticate, topSellingProducts);
router.get("/:organizationId/detailed-inventory", authenticate, getDetailedInventory);

export default router;
