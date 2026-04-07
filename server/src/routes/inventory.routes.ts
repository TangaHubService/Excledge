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
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";

const router = Router();

const orgAccess = requireOrganizationAccess();

router.get("/products/:organizationId", authenticate, orgAccess, branchAuth, getProducts);
router.get("/products/:organizationId/expiring", authenticate, orgAccess, branchAuth, getExpiringProducts);
router.get("/products/:organizationId/expired", authenticate, orgAccess, branchAuth, getExpiredProducts);
router.get("/products/:organizationId/low-stock", authenticate, orgAccess, branchAuth, getLowStockProducts);
router.get("/:id", authenticate, getProductById);
router.post(
  "/:organizationId",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  createProduct
);
router.post(
  "/:organizationId/products",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  createProducts
);
router.put(
  "/:organizationId/product/:id",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  updateProduct
);
router.delete(
  "/:organizationId/product/:id",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  deleteProduct
);

router.post(
  "/:organizationId/product/:id/adjust",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  adjustStock
);

router.post(
  "/:organizationId/product/:id/damage",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  markAsDamage
);

router.post(
  "/:organizationId/product/:id/process-expired",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  processExpiredStock
);

// Inventory Ledger Routes - Append-only ledger for complete inventory history
router.post(
  "/:organizationId/ledger/in",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  addStockToInventory
);

router.post(
  "/:organizationId/ledger/out",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  removeStockFromInventory
);

router.post(
  "/:organizationId/ledger/adjustment",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  adjustInventoryStock
);

router.get(
  "/:organizationId/ledger",
  authenticate,
  orgAccess,
  branchAuth,
  getInventoryLedger
);

router.get(
  "/:organizationId/ledger/summary",
  authenticate,
  orgAccess,
  branchAuth,
  getInventorySummaryReport
);

router.get(
  "/:organizationId/ledger/current-stock/:productId",
  authenticate,
  orgAccess,
  branchAuth,
  getCurrentStockLevel
);

router.get(
  "/:organizationId/ledger/history/:productId",
  authenticate,
  orgAccess,
  branchAuth,
  getProductInventoryHistory
);

router.post(
  "/:organizationId/ledger/recalculate/:productId",
  authenticate,
  orgAccess,
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"),
  recalculateStock
);

export default router;
