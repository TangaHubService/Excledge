import { Router } from "express";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserProfileImage,
  deleteUser,
} from "../controllers/user.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { requireOrganizationAccess } from "../middleware/organizationAccess.middleware";
import { uploadSingle, handleUploadError } from "../middleware/upload.middleware";

const router = Router();

const orgAccess = requireOrganizationAccess();

router.get(
  "/:organizationId",
  authenticate,
  orgAccess,
  authorize("ADMIN", "BRANCH_MANAGER"),
  getUsers
);
router.get("/:id", authenticate, getUserById);
router.post("/", authenticate, authorize("ADMIN"), createUser);
router.put("/:organizationId/update/:id", authenticate, orgAccess, authorize("ADMIN", "BRANCH_MANAGER", "SELLER"), updateUser);

// Profile image upload route with error handling
router.put(
  "/profile-image/:id",
  authenticate,
  authorize("ADMIN", "BRANCH_MANAGER", "SELLER"),
  (req, res, next) => {
    uploadSingle.single('profileImage')(req, res, (err) => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      next();
    });
  },
  updateUserProfileImage
);

router.delete("/:id", authenticate, authorize("ADMIN"), deleteUser);

export default router;
