import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { authController } from "../controllers/auth.controller";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../validations/auth.schemas";

export const authRouter = Router();

authRouter.post("/signup", validate({ body: signupSchema }), authController.signup);
authRouter.post("/register", validate({ body: signupSchema }), authController.signup);
authRouter.post("/login", validate({ body: loginSchema }), authController.login);
authRouter.post("/logout", authRequired, authController.logout);
authRouter.post("/change-password", authRequired, validate({ body: changePasswordSchema }), authController.changePassword);
authRouter.post("/forgot-password", validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRouter.post("/reset-password", validate({ body: resetPasswordSchema }), authController.resetPassword);
