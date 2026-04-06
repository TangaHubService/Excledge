import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProducts,
  getExpiringProducts,
  getExpiredProducts,
  getLowStockProducts,
  adjustStock,
  markAsDamage,
  processExpiredStock,
} from "../controllers/inventory.controller";
import {
  addStockToInventory,
  removeStockFromInventory,
  adjustInventoryStock,
  getInventoryLedger,
  getInventorySummaryReport,
  getCurrentStockLevel,
  getProductInventoryHistory,
  recalculateStock,
} from "../controllers/inventory-ledger.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { branchAuth } from "../middleware/branchAuth.middleware";

const router = Router();

router.get("/products/:organizationId", authenticate, branchAuth, getProducts);
router.get("/products/:organizationId/expiring", authenticate, branchAuth, getExpiringProducts);
router.get("/products/:organizationId/expired", authenticate, branchAuth, getExpiredProducts);
router.get("/products/:organizationId/low-stock", authenticate, branchAuth, getLowStockProducts);
router.get("/:id", authenticate, getProductById);
router.post(
  "/:organizationId",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  createProduct
);
router.post(
  "/:organizationId/products",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  createProducts
);
router.put(
  "/:organizationId/product/:id",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  updateProduct
);
router.delete(
  "/:organizationId/product/:id",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  deleteProduct
);

router.post(
  "/:organizationId/product/:id/adjust",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  adjustStock
);

router.post(
  "/:organizationId/product/:id/damage",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  markAsDamage
);

router.post(
  "/:organizationId/product/:id/process-expired",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  processExpiredStock
);

// Inventory Ledger Routes - Append-only ledger for complete inventory history
router.post(
  "/:organizationId/ledger/in",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  addStockToInventory
);

router.post(
  "/:organizationId/ledger/out",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  removeStockFromInventory
);

router.post(
  "/:organizationId/ledger/adjustment",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  adjustInventoryStock
);

router.get(
  "/:organizationId/ledger",
  authenticate,
  branchAuth,
  getInventoryLedger
);

router.get(
  "/:organizationId/ledger/summary",
  authenticate,
  branchAuth,
  getInventorySummaryReport
);

router.get(
  "/:organizationId/ledger/current-stock/:productId",
  authenticate,
  branchAuth,
  getCurrentStockLevel
);

router.get(
  "/:organizationId/ledger/history/:productId",
  authenticate,
  branchAuth,
  getProductInventoryHistory
);

router.post(
  "/:organizationId/ledger/recalculate/:productId",
  authenticate,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT"),
  recalculateStock
);

export default router;
