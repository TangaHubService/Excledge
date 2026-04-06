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

const router = Router()

router.get("/sales/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER"), getSalesReport)
router.get("/inventory/:organizationId", authenticate, branchAuth, authorize("ADMIN", "PHARMACIST"), getInventoryReport)
router.get("/debtors/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER"), getDebtorsReport)
router.get("/debt-payments/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT"), getDebtPaymentsReport)
router.get("/cash-flow/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT"), getCashFlowReport)
router.get("/stock/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT", "PHARMACIST"), getStockReport)
router.get("/stock-history/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT", "PHARMACIST"), getStockHistory)
router.get("/profit/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT"), getProfitReportController)
router.get("/export/:reportType/:organizationId", authenticate, branchAuth, authorize("ADMIN", "ACCOUNTANT", "SELLER"), exportReport)


export default router
