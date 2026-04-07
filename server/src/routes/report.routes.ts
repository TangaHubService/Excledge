import { Router } from "express"
import {
    getSalesReport,
    getInventoryReport,
    getDebtorsReport,
    exportReport,
    getDebtPaymentsReport,
    getCashFlowReport,
    getStockReport,
    getStockHistory,
    getProfitReportController
} from "../controllers/report.controller"
import { authenticate, authorize } from "../middleware/auth.middleware"
import { branchAuth } from "../middleware/branchAuth.middleware"
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware"

const router = Router()

const orgAccess = requireOrganizationAccess()

router.get("/sales/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getSalesReport)
router.get("/inventory/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getInventoryReport)
router.get("/debtors/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getDebtorsReport)
router.get("/debt-payments/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getDebtPaymentsReport)
router.get("/cash-flow/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getCashFlowReport)
router.get("/stock/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getStockReport)
router.get("/stock-history/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getStockHistory)
router.get("/profit/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getProfitReportController)
router.get("/export/:reportType/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), exportReport)


export default router
