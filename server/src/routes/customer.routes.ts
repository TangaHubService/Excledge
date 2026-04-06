import { Router } from "express"
import multer from "multer"
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  bulkImportCustomers,
  downloadCustomerTemplate,
  previewImportCustomers,
  confirmImportCustomers,
  downloadCustomerErrorFile,
} from "../controllers/customer.controller"
import { authenticate, authorize } from "../middleware/auth.middleware"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get("/:organizationId", authenticate, getCustomers)
router.get("/:id", authenticate, getCustomerById)
router.post("/:organizationId", authenticate, createCustomer)
router.put("/:id/:organizationId", authenticate, updateCustomer)
router.delete("/:id", authenticate, authorize("ADMIN"), deleteCustomer)

// Import routes (legacy - kept for backward compatibility)
router.post("/:organizationId/import", authenticate, authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), bulkImportCustomers)
router.get("/:organizationId/import/template", authenticate, downloadCustomerTemplate)

// New preview/confirm import routes
router.post("/:organizationId/import/preview", authenticate, authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), previewImportCustomers)
router.post("/:organizationId/import/confirm", authenticate, authorize("ADMIN", "ACCOUNTANT"), confirmImportCustomers)
router.get("/:organizationId/import/errors/:importId", authenticate, authorize("ADMIN", "ACCOUNTANT"), downloadCustomerErrorFile)

export default router
