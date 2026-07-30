import { Router } from "express";
import {
  createSale,
  getSales,
  getSaleById,
  payDebt,
  refundSale,
  cancelSale,
  reprintSaleReceipt,
  regenerateInvoice,
  getEbmReceipt,
} from "../controllers/sales.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { branchAuth } from "../middleware/branchAuth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { requireActiveSubscription } from '../middleware/feature-access.middleware';
import { vsdcOnlineGuard } from "../middleware/vsdc-offline-guard.middleware";
import { validate } from "../middleware/validate.middleware";
import { createSaleSchema, cancelSaleSchema } from "../validations/sales.validation";

const router = Router();

const orgAccess = requireOrganizationAccess();

// Create a new sale (vsdcOnlineGuard blocks if VSDC unreachable > 24h, per RRA requirement)
router.post(
  "/:organizationId",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  vsdcOnlineGuard,
  validate(createSaleSchema),
  createSale
);

// Get all sales for an organization
router.get(
  "/:organizationId",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  getSales
);

// Get a specific sale by ID
router.get(
  "/:organizationId/:id",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  getSaleById
);

// Pay off debt for a sale
router.put(
  "/:id/pay-debt/:organizationId",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  payDebt
);

// Refund a sale (full or partial)
router.post(
  "/:id/refund/:organizationId",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  refundSale
);

// Cancel a sale
router.post(
  "/:organizationId/:saleId/cancel",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  validate(cancelSaleSchema),
  cancelSale
);

// Reprint a sale receipt (increments reprintCount, returns isCopy=true)
router.post(
  "/:organizationId/:saleId/reprint",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  reprintSaleReceipt
);

// Regenerate invoice (new invoice number, preserves history)
router.post(
  "/:organizationId/:saleId/regenerate-invoice",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"),
  regenerateInvoice
);

// E3: Get EBM/SDC fiscal data for a sale (polls after outbox worker runs)
router.get(
  "/:organizationId/:saleId/ebm-receipt",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  getEbmReceipt
);

export default router;
