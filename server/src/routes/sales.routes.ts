import { Router } from "express";
import {
  createSale,
  getSales,
  getSaleById,
  payDebt,
  refundSale,
  cancelSale
} from "../controllers/sales.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { validate } from "../middleware/validate.middleware";
import { createSaleSchema, cancelSaleSchema } from "../validations/sales.validation";

const router = Router();

const orgAccess = requireOrganizationAccess();

// Create a new sale
router.post(
  "/:organizationId",
  authenticate,
  orgAccess,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  validate(createSaleSchema),
  createSale
);

// Get all sales for an organization
router.get(
  "/:organizationId",
  authenticate,
  orgAccess,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  getSales
);

// Get a specific sale by ID
router.get(
  "/:organizationId/:id",
  authenticate,
  orgAccess,
  authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"),
  getSaleById
);

// Pay off debt for a sale
router.put(
  "/:id/pay-debt/:organizationId",
  authenticate,
  orgAccess,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  payDebt
);

// Refund a sale (full or partial)
router.post(
  "/:id/refund/:organizationId",
  authenticate,
  orgAccess,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  refundSale
);

// Cancel a sale
router.post(
  "/:organizationId/:saleId/cancel",
  authenticate,
  orgAccess,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  validate(cancelSaleSchema),
  cancelSale
);

export default router;
