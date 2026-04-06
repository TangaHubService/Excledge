import { Router } from "express";
import {
  getUserOrganizations,
  getOrganizationById,
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
  updateOrganizationAvatar,
} from "../controllers/organization.controller";
import { authenticate } from "../middleware/auth.middleware";
import { uploadSingle } from "../middleware/upload.middleware";

const router = Router();
router.get("/", authenticate, getUserOrganizations);
router.get("/:id", authenticate, getOrganizationById);
router.post("/", authenticate, createOrganization);
router.put("/:id", authenticate, updateOrganization);
router.put("/avatar/:id", authenticate, uploadSingle.single('avatar'),
  updateOrganizationAvatar);
router.delete("/:id", authenticate, deleteOrganization);
router.post("/:organizationId/invite", authenticate, inviteUser);
router.post("/:organizationId/bulk-invite", authenticate, bulkInviteUsers);
router.post("/accept-invitation/:token", acceptInvitation);
router.get("/get-invitation/:token", getInvitationDetails),
  router.put("/cancel-invitation/:id", cancelInvitation),
  router.put("/decline-invitation/:token", declineInvitation),
  router.get("/:organizationId/users", authenticate, getOrganizationUsers);
router.delete(
  "/:organizationId/users/:userId",
  authenticate,
  removeUserFromOrganization
);

export default router;
