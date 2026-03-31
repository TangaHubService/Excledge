import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { env } from "../config/env";
import { ApiError } from "../common/http";
import { User } from "../entities/User";
import { Role } from "../entities/Role";
import { writeAudit } from "./audit.service";
import { sendPasswordResetEmail } from "./email.service";
import {
  ChangePasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
} from "../dto/auth.dto";

export const authService = {
  async signup(input: SignupDto) {
    const repo = AppDataSource.getRepository(User);
    const existing = await repo.findOne({ where: { email: input.email } });
    if (existing) throw new ApiError("CONFLICT", 409, "User email already exists");

    let roleId = input.roleId;
    if (!roleId) {
      const role = await AppDataSource.getRepository(Role).findOne({ where: { name: "CASHIER" } });
      if (!role) throw new ApiError("VALIDATION_ERROR", 400, "Default CASHIER role not found. Run seed first.");
      roleId = role.id;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = repo.create({ email: input.email, fullName: input.fullName, roleId, branchId: input.branchId, passwordHash });
    await repo.save(user);
    await writeAudit({ action: "REGISTER_USER", entityType: "User", entityId: user.id, actorId: user.id });
    return { id: user.id, email: user.email, fullName: user.fullName };
  },

  async login(input: LoginDto) {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { email: input.email }, relations: ["role"] });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new ApiError("UNAUTHORIZED", 401, "Invalid credentials");
    }
    const token = jwt.sign({ id: user.id, role: user.role.name, branchId: user.branchId }, env.jwtSecret, {
      expiresIn: "8h",
    });
    return { token };
  },

  async logout(userId: string) {
    await writeAudit({ action: "LOGOUT", entityType: "User", entityId: userId, actorId: userId });
    return { message: "Logged out" };
  },

  async changePassword(userId: string, input: ChangePasswordDto) {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ id: userId });
    if (!user) throw new ApiError("NOT_FOUND", 404, "User not found");
    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!ok) throw new ApiError("UNAUTHORIZED", 401, "Current password is incorrect");
    user.passwordHash = await bcrypt.hash(input.newPassword, 10);
    await repo.save(user);
    await writeAudit({ action: "CHANGE_PASSWORD", entityType: "User", entityId: user.id, actorId: user.id });
    return { message: "Password changed successfully" };
  },

  async forgotPassword(email: string) {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
      user.resetPasswordToken = hashed;
      user.resetPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 30);
      await repo.save(user);
      await sendPasswordResetEmail(user.email, `${env.appBaseUrl}/reset-password?token=${rawToken}`);
      await writeAudit({ action: "REQUEST_PASSWORD_RESET", entityType: "User", entityId: user.id, actorId: user.id });
    }
    return { message: "If the email exists, a reset link has been sent." };
  },

  async resetPassword(input: ResetPasswordDto) {
    const hashed = crypto.createHash("sha256").update(input.token).digest("hex");
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ resetPasswordToken: hashed });
    if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt.getTime() < Date.now()) {
      throw new ApiError("BAD_REQUEST", 400, "Reset token is invalid or expired");
    }
    user.passwordHash = await bcrypt.hash(input.newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiresAt = undefined;
    await repo.save(user);
    await writeAudit({ action: "RESET_PASSWORD", entityType: "User", entityId: user.id, actorId: user.id });
    return { message: "Password has been reset successfully" };
  },
};
