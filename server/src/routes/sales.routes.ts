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
import { validate } from "../middleware/validate.middleware";
import { createSaleSchema, cancelSaleSchema } from "../validations/sales.validation";

const router = Router();

// Create a new sale
router.post(
  "/:organizationId",
  authenticate,
  authorize("ADMIN", "SELLER", "ACCOUNTANT"),
  validate(createSaleSchema),
  createSale
);

// Get all sales for an organization
router.get(
  "/:organizationId",
  authenticate,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  getSales
);

// Get a specific sale by ID
router.get(
  "/:organizationId/:id",
  authenticate,
  authorize("ADMIN", "ACCOUNTANT", "SELLER"),
  getSaleById
);

// Pay off debt for a sale
router.put(
  "/:id/pay-debt/:organizationId",
  authenticate,
  authorize("ADMIN", "SELLER", "ACCOUNTANT"),
  payDebt
);

// Refund a sale (full or partial)
router.post(
  "/:id/refund/:organizationId",
  authenticate,
  authorize("ADMIN", "SELLER", "ACCOUNTANT"),
  refundSale
);

// Cancel a sale
router.post(
  "/:organizationId/:saleId/cancel",
  authenticate,
  authorize("ADMIN", "SELLER", "ACCOUNTANT"),
  validate(cancelSaleSchema),
  cancelSale
);

export default router;
