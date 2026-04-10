import { Router } from "express";
import {
    recordSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentById,
    deleteSupplierPayment
} from "../controllers/supplier-payment.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireOrganizationAccess());

/**
 * @route POST /api/supplier-payments/:organizationId
 * @desc Record a new supplier payment
 */
router.post("/:organizationId", recordSupplierPayment);

/**
 * @route GET /api/supplier-payments/:organizationId
 * @desc Get all supplier payments for an organization
 */
router.get("/:organizationId", getSupplierPayments);

/**
 * @route GET /api/supplier-payments/:organizationId/:id
 * @desc Get supplier payment by ID
 */
router.get("/:organizationId/:id", getSupplierPaymentById);

/**
 * @route DELETE /api/supplier-payments/:organizationId/:id
 * @desc Delete supplier payment
 */
router.delete("/:organizationId/:id", deleteSupplierPayment);

export default router;
