import { Router } from "express"
import multer from "multer"
import { authenticate, authorize } from "../middleware/auth.middleware"
import {
    getSuppliers,
    getSupplier,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    bulkImportSuppliers,
    downloadSupplierTemplate,
    previewImportSuppliers,
    confirmImportSuppliers,
    downloadSupplierErrorFile,
} from "../controllers/supplier.controller"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// All routes require authentication
router.use(authenticate)

// Get all suppliers
router.get("/:organizationId", getSuppliers)

// Get single supplier
router.get("/:organizationId/:id", getSupplier)

// Create supplier (Admin/Manager only)
router.post("/:organizationId", authorize("ADMIN", "ACCOUNTANT"), createSupplier)

// Update supplier (Admin/Manager only)
router.put("/:id", authorize("ADMIN", "ACCOUNTANT"), updateSupplier)

// Delete supplier (Admin only)
router.delete("/:id", authorize("ADMIN", "ACCOUNTANT"), deleteSupplier)

// Import routes (legacy - kept for backward compatibility)
router.post("/:organizationId/import", authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), bulkImportSuppliers)
router.get("/:organizationId/import/template", downloadSupplierTemplate)

// New preview/confirm import routes
router.post("/:organizationId/import/preview", authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), previewImportSuppliers)
router.post("/:organizationId/import/confirm", authorize("ADMIN", "ACCOUNTANT"), confirmImportSuppliers)
router.get("/:organizationId/import/errors/:importId", authorize("ADMIN", "ACCOUNTANT"), downloadSupplierErrorFile)

export default router
