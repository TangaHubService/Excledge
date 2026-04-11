import { Router } from "express";
import {
  getUserOrganizations,
  getOrganizationById,
  getOrganizationVsdcReadiness,
  getOrganizationVsdcSync,
  getOrganizationVsdcStockSync,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  inviteUser,
  bulkInviteUsers,
  acceptInvitation,
  getOrganizationUsers,
  removeUserFromOrganization,
  getInvitationDetails,
  cancelInvitation,
  declineInvitation,
  runOrganizationVsdcSync,
  runOrganizationVsdcStockSyncController,
  updateOrganizationAvatar,
} from "../controllers/organization.controller";
import { authenticate } from "../middleware/auth.middleware";
import { uploadSingle } from "../middleware/upload.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";

const router = Router();

const orgAccess = requireOrganizationAccess();
const orgAccessById = requireOrganizationAccess("id");

router.get("/", authenticate, getUserOrganizations);
router.get("/:id", authenticate, orgAccessById, getOrganizationById);
router.get("/:id/vsdc-readiness", authenticate, orgAccessById, getOrganizationVsdcReadiness);
router.get("/:id/vsdc-sync", authenticate, orgAccessById, getOrganizationVsdcSync);
router.post("/:id/vsdc-sync", authenticate, orgAccessById, runOrganizationVsdcSync);
router.get("/:id/vsdc-stock-sync", authenticate, orgAccessById, getOrganizationVsdcStockSync);
router.post("/:id/vsdc-stock-sync", authenticate, orgAccessById, runOrganizationVsdcStockSyncController);
router.post("/", authenticate, createOrganization);
router.put("/:id", authenticate, orgAccessById, updateOrganization);
router.put(
  "/avatar/:id",
  authenticate,
  orgAccessById,
  uploadSingle.single("avatar"),
  updateOrganizationAvatar
);
router.delete("/:id", authenticate, orgAccessById, deleteOrganization);
router.post("/:organizationId/invite", authenticate, orgAccess, inviteUser);
router.post("/:organizationId/bulk-invite", authenticate, orgAccess, bulkInviteUsers);
router.post("/accept-invitation/:token", acceptInvitation);
router.get("/get-invitation/:token", getInvitationDetails);
router.put("/cancel-invitation/:id", cancelInvitation);
router.put("/decline-invitation/:token", declineInvitation);
router.get("/:organizationId/users", authenticate, orgAccess, getOrganizationUsers);
router.delete(
  "/:organizationId/users/:userId",
  authenticate,
  orgAccess,
  removeUserFromOrganization
);

export default router;
