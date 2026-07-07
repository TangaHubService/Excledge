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
    getProfitReportController,
    getDailyReport,
} from "../controllers/report.controller"
import { authenticate, authorize } from "../middleware/auth.middleware"
import { branchAuth } from "../middleware/branchAuth.middleware"
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware"
import { requireActiveSubscription } from '../middleware/feature-access.middleware';

const router = Router()

const orgAccess = requireOrganizationAccess()

router.get("/sales/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getSalesReport)
router.get("/inventory/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getInventoryReport)
router.get("/debtors/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getDebtorsReport)
router.get("/debt-payments/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getDebtPaymentsReport)
router.get("/cash-flow/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getCashFlowReport)
router.get("/stock/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getStockReport)
router.get("/stock-history/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), getStockHistory)
router.get("/profit/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getProfitReportController)
router.get("/export/:reportType/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER", "BRANCH_MANAGER"), exportReport)
// C9: X/Z daily fiscal reports (RRA CIS/VSDC spec §6)
router.get("/daily/:organizationId", authenticate, orgAccess, requireActiveSubscription(), branchAuth, authorize("ADMIN", "ACCOUNTANT", "BRANCH_MANAGER"), getDailyReport)

export default router
