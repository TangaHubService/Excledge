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
import { uploadSingle, handleUploadError } from "../middleware/upload.middleware";

const router = Router();

router.get(
  "/:organizationId",
  authenticate,
  authorize("ADMIN", "MANAGER"),
  getUsers
);
router.get("/:id", authenticate, getUserById);
router.post("/", authenticate, authorize("ADMIN"), createUser);
router.put("/:organizationId/update/:id", authenticate, authorize("ADMIN", "MANAGER", "SELLER"), updateUser);

// Profile image upload route with error handling
router.put(
  "/profile-image/:id",
  authenticate,
  authorize("ADMIN", "MANAGER", "SELLER"),
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
