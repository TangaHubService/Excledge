import { Router } from "express";
import {
    recordSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentById,
    deleteSupplierPayment
} from "../controllers/supplier-payment.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { branchAuth } from "../middleware/branchAuth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { requireActiveSubscription } from "../middleware/feature-access.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireOrganizationAccess());
router.use('/:organizationId', requireActiveSubscription());
router.use(branchAuth);

router.post("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), recordSupplierPayment);

router.get("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getSupplierPayments);

router.get("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getSupplierPaymentById);

router.delete("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), deleteSupplierPayment);

export default router;
