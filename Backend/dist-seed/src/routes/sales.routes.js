"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sales_controller_1 = require("../controllers/sales.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const branchAuth_middleware_1 = require("../middleware/branchAuth.middleware");
const organizationAccess_middleware_1 = require("../middleware/organizationAccess.middleware");
const feature_access_middleware_1 = require("../middleware/feature-access.middleware");
const vsdc_offline_guard_middleware_1 = require("../middleware/vsdc-offline-guard.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const sales_validation_1 = require("../validations/sales.validation");
const router = (0, express_1.Router)();
const orgAccess = (0, organizationAccess_middleware_1.requireOrganizationAccess)();
// Create a new sale (vsdcOnlineGuard blocks if VSDC unreachable > 24h, per RRA requirement)
router.post("/:organizationId", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), vsdc_offline_guard_middleware_1.vsdcOnlineGuard, (0, validate_middleware_1.validate)(sales_validation_1.createSaleSchema), sales_controller_1.createSale);
// Get all sales for an organization
router.get("/:organizationId", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), sales_controller_1.getSales);
// Get a specific sale by ID
router.get("/:organizationId/:id", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), sales_controller_1.getSaleById);
// Pay off debt for a sale
router.put("/:id/pay-debt/:organizationId", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), sales_controller_1.payDebt);
// Refund a sale (full or partial)
router.post("/:id/refund/:organizationId", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), sales_controller_1.refundSale);
// Cancel a sale
router.post("/:organizationId/:saleId/cancel", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), (0, validate_middleware_1.validate)(sales_validation_1.cancelSaleSchema), sales_controller_1.cancelSale);
// Reprint a sale receipt (increments reprintCount, returns isCopy=true)
router.post("/:organizationId/:saleId/reprint", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), sales_controller_1.reprintSaleReceipt);
// Regenerate invoice (new invoice number, preserves history)
router.post("/:organizationId/:saleId/regenerate-invoice", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), sales_controller_1.regenerateInvoice);
// E3: Get EBM/SDC fiscal data for a sale (polls after outbox worker runs)
router.get("/:organizationId/:saleId/ebm-receipt", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), sales_controller_1.getEbmReceipt);
// Composed ERP invoice payload for the modern invoice renderer
// GET /api/organizations/:orgId/invoices/:saleId
router.get("/:organizationId/invoices/:saleId", auth_middleware_1.authenticate, orgAccess, (0, feature_access_middleware_1.requireActiveSubscription)(), branchAuth_middleware_1.branchAuth, (0, auth_middleware_1.authorize)("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), sales_controller_1.getInvoice);
exports.default = router;
