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
import { branchAuth } from "../middleware/branchAuth.middleware"
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })
const orgAccess = requireOrganizationAccess()

router.get("/:organizationId", authenticate, orgAccess, branchAuth, getCustomers)
router.get("/:organizationId/:id", authenticate, orgAccess, branchAuth, getCustomerById)
router.post("/:organizationId", authenticate, orgAccess, branchAuth, createCustomer)
router.put("/:id/:organizationId", authenticate, orgAccess, branchAuth, updateCustomer)
router.delete("/:id/:organizationId", authenticate, orgAccess, branchAuth, authorize("ADMIN"), deleteCustomer)

// Import routes (legacy - kept for backward compatibility)
router.post("/:organizationId/import", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), bulkImportCustomers)
router.get("/:organizationId/import/template", authenticate, orgAccess, branchAuth, downloadCustomerTemplate)

// New preview/confirm import routes
router.post("/:organizationId/import/preview", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT"), upload.single("file"), previewImportCustomers)
router.post("/:organizationId/import/confirm", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT"), confirmImportCustomers)
router.get("/:organizationId/import/errors/:importId", authenticate, orgAccess, branchAuth, authorize("ADMIN", "ACCOUNTANT"), downloadCustomerErrorFile)

export default router
