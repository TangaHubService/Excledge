import { Router } from "express"
import { authenticate, authorize } from "../middleware/auth.middleware"
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware"
import {
    getPurchaseOrders,
    getPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
} from "../controllers/purchaseOrder.controller"

const router = Router()

// All routes require authentication
router.use(authenticate)

const orgAccess = requireOrganizationAccess()

// Get all purchase orders
router.get("/:organizationId", orgAccess, getPurchaseOrders)

// Get single purchase order
router.get("/:organizationId/:id", orgAccess, getPurchaseOrder)

// Create purchase order (Admin/Manager only)
router.post("/:organizationId", orgAccess, authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), createPurchaseOrder)

// Update purchase order status (Admin/Manager only)
router.patch("/:organizationId/:id/status", orgAccess, authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), updatePurchaseOrderStatus)

// Delete purchase order (Admin only)
router.delete("/:organizationId/:id", orgAccess, authorize("ADMIN", "SELLER", "ACCOUNTANT", "BRANCH_MANAGER"), deletePurchaseOrder)

export default router
