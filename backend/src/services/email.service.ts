import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.secure,
  auth: env.smtp.user && env.smtp.pass ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
});

export const sendPasswordResetEmail = async (to: string, resetUrl: string) => {
  const from = env.smtp.from || "no-reply@inventory.rw";
  await transporter.sendMail({
    from,
    to,
    subject: "Reset your Inventory account password",
    text: `Reset your password using this link: ${resetUrl}`,
    html: `<p>Reset your password using this link:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
};
