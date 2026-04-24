import { Router } from "express";
import {
    createExpense,
    getExpenses,
    getExpenseById,
    updateExpense,
    deleteExpense
} from "../controllers/expense.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireOrganizationAccess());

/**
 * @route POST /api/expenses/:organizationId
 * @desc Create a new expense
 * @access Admin, Accountant, Branch Manager
 */
router.post("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), createExpense);

/**
 * @route GET /api/expenses/:organizationId
 * @desc Get all expenses for an organization
 * @access Admin, Accountant, Branch Manager, Seller
 */
router.get("/:organizationId", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER", "SELLER"), getExpenses);

/**
 * @route GET /api/expenses/:organizationId/:id
 * @desc Get expense by ID
 * @access Admin, Accountant, Branch Manager
 */
router.get("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getExpenseById);

/**
 * @route PUT /api/expenses/:organizationId/:id
 * @desc Update expense
 * @access Admin, Accountant
 */
router.put("/:organizationId/:id", authorize("ADMIN", "ACCOUNTANT"), updateExpense);

/**
 * @route DELETE /api/expenses/:organizationId/:id
 * @desc Delete expense
 * @access Admin only
 */
router.delete("/:organizationId/:id", authorize("ADMIN"), deleteExpense);

export default router;
