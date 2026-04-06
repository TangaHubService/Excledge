import { Router } from "express"
import { authenticate, authorize } from "../middleware/auth.middleware"
import {
    getPurchaseOrders,
    getPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
} from "../controllers/pruchaseOrder.controller"

const router = Router()

// All routes require authentication
router.use(authenticate)

// Get all purchase orders
router.get("/:organizationId", getPurchaseOrders)

// Get single purchase order
router.get("/:organizationId/:id", getPurchaseOrder)

// Create purchase order (Admin/Manager only)
router.post("/:organizationId", authorize("ADMIN", "SELLER", "ACCOUNTANT"), createPurchaseOrder)

// Update purchase order status (Admin/Manager only)
router.patch("/:id/status", authorize("ADMIN", "SELLER", "ACCOUNTANT"), updatePurchaseOrderStatus)

// Delete purchase order (Admin only)
router.delete("/:id", authorize("ADMIN", "SELLER", "ACCOUNTANT"), deletePurchaseOrder)

export default router
