import { Router } from "express";
import {
    createExpense,
    getExpenses,
    getExpenseById,
    updateExpense,
    deleteExpense
} from "../controllers/expense.controller";
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

router.post("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), createExpense);

router.get("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getExpenses);

router.get("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getExpenseById);

router.put("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), updateExpense);

router.delete("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), deleteExpense);

export default router;
