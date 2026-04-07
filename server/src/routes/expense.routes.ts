import { Router } from "express";
import {
    createExpense,
    getExpenses,
    getExpenseById,
    updateExpense,
    deleteExpense
} from "../controllers/expense.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireOrganizationAccess());

/**
 * @route POST /api/expenses/:organizationId
 * @desc Create a new expense
 */
router.post("/:organizationId", createExpense);

/**
 * @route GET /api/expenses/:organizationId
 * @desc Get all expenses for an organization
 */
router.get("/:organizationId", getExpenses);

/**
 * @route GET /api/expenses/:organizationId/:id
 * @desc Get expense by ID
 */
router.get("/:organizationId/:id", getExpenseById);

/**
 * @route PUT /api/expenses/:organizationId/:id
 * @desc Update expense
 */
router.put("/:organizationId/:id", updateExpense);

/**
 * @route DELETE /api/expenses/:organizationId/:id
 * @desc Delete expense
 */
router.delete("/:organizationId/:id", deleteExpense);

export default router;
