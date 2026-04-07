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
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })
const orgAccess = requireOrganizationAccess()

router.get("/:organizationId", authenticate, orgAccess, getCustomers)
router.get("/:organizationId/:id", authenticate, orgAccess, getCustomerById)
router.post("/:organizationId", authenticate, orgAccess, createCustomer)
router.put("/:id/:organizationId", authenticate, orgAccess, updateCustomer)
router.delete("/:id/:organizationId", authenticate, orgAccess, authorize("ADMIN"), deleteCustomer)

// Import routes (legacy - kept for backward compatibility)
router.post("/:organizationId/import", authenticate, orgAccess, authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), bulkImportCustomers)
router.get("/:organizationId/import/template", authenticate, orgAccess, downloadCustomerTemplate)

// New preview/confirm import routes
router.post("/:organizationId/import/preview", authenticate, orgAccess, authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), previewImportCustomers)
router.post("/:organizationId/import/confirm", authenticate, orgAccess, authorize("ADMIN", "ACCOUNTANT"), confirmImportCustomers)
router.get("/:organizationId/import/errors/:importId", authenticate, orgAccess, authorize("ADMIN", "ACCOUNTANT"), downloadCustomerErrorFile)

export default router
