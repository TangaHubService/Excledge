import { Router } from "express";
import {
    recordSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentById,
    deleteSupplierPayment
} from "../controllers/supplier-payment.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireOrganizationAccess());

/**
 * @route POST /api/supplier-payments/:organizationId
 * @desc Record a new supplier payment
 * @access Admin, Accountant, Branch Manager
 */
router.post("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), recordSupplierPayment);

/**
 * @route GET /api/supplier-payments/:organizationId
 * @desc Get all supplier payments for an organization
 * @access Admin, Accountant, Branch Manager
 */
router.get("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getSupplierPayments);

/**
 * @route GET /api/supplier-payments/:organizationId/:id
 * @desc Get supplier payment by ID
 * @access Admin, Accountant, Branch Manager
 */
router.get("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getSupplierPaymentById);

/**
 * @route DELETE /api/supplier-payments/:organizationId/:id
 * @desc Delete supplier payment
 * @access Admin only
 */
router.delete("/:organizationId/:id", authorize("ADMIN"), deleteSupplierPayment);

export default router;
