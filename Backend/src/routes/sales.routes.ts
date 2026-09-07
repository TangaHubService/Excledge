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
  getInvoice,
  getInvoicePdf,
  updateProforma,
  convertProforma,
} from "../controllers/sales.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { branchAuth } from "../middleware/branchAuth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { requireActiveSubscription } from '../middleware/feature-access.middleware';
import { vsdcOnlineGuard } from "../middleware/vsdc-offline-guard.middleware";
import { validate } from "../middleware/validate.middleware";
import { createSaleSchema, cancelSaleSchema, updateProformaSchema, convertProformaSchema } from "../validations/sales.validation";
import {
  initiateMobileMoneyPayment,
  getMobileMoneyPaymentStatus,
  cancelMobileMoneyPayment,
} from "../controllers/mobile-money.controller";

const router = Router();

const orgAccess = requireOrganizationAccess();

// Initiate and monitor a POS mobile-money collection using the configured
// Paypack or direct MTN MoMo provider. The sale is created only after the
// provider confirms that the collection completed.
router.post(
  "/:organizationId/mobile-money/initiate",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  initiateMobileMoneyPayment
);

router.get(
  "/:organizationId/mobile-money/:transactionId/status",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  getMobileMoneyPaymentStatus
);

router.post(
  "/:organizationId/mobile-money/:transactionId/cancel",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  cancelMobileMoneyPayment
);

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

// Edit a proforma's line items / customer (only before it is converted)
router.put(
  "/:organizationId/:saleId/proforma",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  validate(updateProformaSchema),
  updateProforma
);

// Convert a proforma into a real, fiscalized NS sale
router.post(
  "/:organizationId/:saleId/convert",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  vsdcOnlineGuard,
  validate(convertProformaSchema),
  convertProforma
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

// Authoritative backend-generated invoice PDF. Accepts ?format=A4|80mm (default A4).
router.get(
  "/:organizationId/invoices/:saleId/pdf",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  getInvoicePdf
);

// Composed invoice data for status/metadata and non-authoritative UI details.
router.get(
  "/:organizationId/invoices/:saleId",
  authenticate,
  orgAccess, requireActiveSubscription(),
  branchAuth,
  authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"),
  getInvoice
);

export default router;
