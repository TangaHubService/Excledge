"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const expense_controller_1 = require("../controllers/expense.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const branchAuth_middleware_1 = require("../middleware/branchAuth.middleware");
const organizationAccess_middleware_1 = require("../middleware/organizationAccess.middleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_middleware_1.authenticate);
router.use((0, organizationAccess_middleware_1.requireOrganizationAccess)());
router.use(branchAuth_middleware_1.branchAuth);
/**
 * @route POST /api/expenses/:organizationId
 * @desc Create a new expense
 */
router.post("/:organizationId", expense_controller_1.createExpense);
/**
 * @route GET /api/expenses/:organizationId
 * @desc Get all expenses for an organization
 */
router.get("/:organizationId", expense_controller_1.getExpenses);
/**
 * @route GET /api/expenses/:organizationId/:id
 * @desc Get expense by ID
 */
router.get("/:organizationId/:id", expense_controller_1.getExpenseById);
/**
 * @route PUT /api/expenses/:organizationId/:id
 * @desc Update expense
 */
router.put("/:organizationId/:id", expense_controller_1.updateExpense);
/**
 * @route DELETE /api/expenses/:organizationId/:id
 * @desc Delete expense
 */
router.delete("/:organizationId/:id", expense_controller_1.deleteExpense);
exports.default = router;
