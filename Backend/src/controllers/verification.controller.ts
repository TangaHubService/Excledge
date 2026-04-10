import { Request, Response } from "express";
import { emailService } from "../services/email.service";
import { generateVerificationToken, generatePasswordResetToken, isTokenExpired } from "../utils/token.utils";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

// Verify user's email with verification code
export const verifyAccount = async (req: Request, res: Response) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: "Verification code is required" });
        }

        // Find user by email
        const user = await prisma.user.findFirst({
            where: { verificationToken: code },
        });

        if (!user) {
            return res.status(404).json({ error: "Invalid or expired verification code" });
        }

        // Check if user is already verified
        if (user.isEmailVerified) {
            return res.status(400).json({ error: "Email is already verified" });
        }

        // Check if verification code matches and is not expired
        if (
            user.verificationToken !== code ||
            !user.verificationExpiry ||
            isTokenExpired(user.verificationExpiry)
        ) {
            return res.status(400).json({ error: "Invalid or expired verification code" });
        }

        // Update user as verified
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                isActive: true,
                verificationToken: null,
                verificationExpiry: null,
            },
        });

        return res.json({ message: "Email verified successfully" });
    } catch (error) {
        console.error("[Verify Account Error]:", error);
        return res.status(500).json({ error: "Failed to verify account" });
    }
};

// Resend verification email
export const resendVerification = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if user is already verified
        if (user.isEmailVerified) {
            return res.status(400).json({ error: "Email is already verified" });
        }

        // Generate new verification token
        const { token, expires } = generateVerificationToken();

        // Update user with new verification token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                verificationToken: token,
                verificationExpiry: expires,
            },
        });

        // Send verification email
        await emailService.sendVerificationEmail(user.email, user.name, token);

        return res.json({ message: "Verification email sent successfully" });
    } catch (error) {
        console.error("[Resend Verification Error]:", error);
        return res.status(500).json({ error: "Failed to resend verification email" });
    }
};

// Request password reset
export const requestPasswordReset = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            // For security, don't reveal if the email exists or not
            return res.json({ message: "If an account exists with this email, a password reset link has been sent" });
        }

        // Generate password reset token
        const { token } = generatePasswordResetToken(user.email);
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Update user with password reset token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: hashedToken,
            },
        });

        // Send password reset email
        await emailService.sendPasswordResetEmail(user.email, user.name, token);

        return res.json({ message: "Password reset email sent successfully" });
    } catch (error) {
        console.error("[Request Password Reset Error]:", error);
        return res.status(500).json({ error: "Failed to process password reset request" });
    }
};

// Reset password with token
export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { code, newPassword } = req.body;

        if (!code || !newPassword) {
            return res.status(400).json({ error: "Verification code and new password are required" });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters long" });
        }
        const { email } = jwt.verify(code, process.env.JWT_SECRET as string) as { email: string };
        // Find user by email
        const user = await prisma.user.findFirst({
            where: { email },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if reset token is valid and not expired
        const incomingTokenHash = crypto.createHash('sha256').update(code).digest('hex');

        if (
            !user.passwordResetToken ||
            user.passwordResetToken !== incomingTokenHash
        ) {
            return res.status(400).json({ error: "Invalid or expired password reset code" });
        }

        // Hash new password
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password and clear reset token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetToken: null,
                requirePasswordChange: false,
            },
        });

        // Send password reset confirmation email
        await emailService.sendPasswordResetConfirmation(user.email, user.name);

        return res.json({ message: "Password reset successful" });
    } catch (error) {
        console.error("[Reset Password Error]:", error);
        return res.status(500).json({ error: "Failed to reset password" });
    }
};
