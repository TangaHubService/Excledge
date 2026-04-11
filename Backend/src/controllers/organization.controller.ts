import { prisma } from "../lib/prisma";
import * as XLSX from "xlsx";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { emailService } from "../services/email.service";
import { generateStrongPassword } from "../utils/generatePassword";
import { auditLogger } from "../utils/auditLogger";
import { deleteFromCloudinary, uploadToCloudinary } from "../config/cloudinary";
import { SubscriptionService } from "../services/subscription.service";
import {
  getOrganizationVsdcSyncReport,
  getOrganizationVsdcStockSyncReport,
  runOrganizationVsdcReferenceSync,
  runOrganizationVsdcStockSync,
} from "../services/rra-ebm.service";

import type { Request, Response } from "express";

const hasNonEmptyText = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

export const getUserOrganizations = async (req: Request, res: Response) => {
  try {
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);
    const userOrganizations = await prisma.userOrganization.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            subscriptions: true,
          },
        },
      },
    });

    res.json({
      organizations: userOrganizations.map((uo) => ({
        id: uo.organization.id,
        name: uo.organization.name,
        businessType: uo.organization.businessType,
        address: uo.organization.address,
        phone: uo.organization.phone,
        email: uo.organization.email,
        role: uo.role,
        isActive: uo.organization.isActive,
        subscription: uo.organization.subscriptions,
      })),
    });
  } catch (error) {
    console.error("Error fetching user organizations:", error);
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
};

export const getOrganizationById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: {
            createdAt: 'desc'
          }
        },
      },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const organizationUsers = await prisma.userOrganization.findMany({
      where: { organizationId: id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Check subscription status
    const now = new Date();
    const activeSubscription = organization.subscriptions.find(sub =>
      (sub.status === 'ACTIVE' || sub.status === 'TRIALING') &&
      (!sub.endDate || new Date(sub.endDate) > now)
    );

    const hasActiveSubscription = !!activeSubscription;
    const subscriptionStatus = activeSubscription?.status || null;
    const subscriptionEndDate = activeSubscription?.endDate || null;

    res.json({
      organization: {
        ...organization,
        hasActiveSubscription,
        subscriptionStatus,
        subscriptionEndDate
      },
      users: organizationUsers
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    res.status(500).json({ error: "Failed to fetch organization" });
  }
};

export const getOrganizationVsdcReadiness = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const [organization, branches, products] = await Promise.all([
      prisma.organization.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          TIN: true,
          ebmDeviceId: true,
          ebmSerialNo: true,
        },
      }),
      prisma.branch.findMany({
        where: {
          organizationId: id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          code: true,
          bhfId: true,
          location: true,
          address: true,
          status: true,
        },
        orderBy: [
          { name: 'asc' },
        ],
      }),
      prisma.product.findMany({
        where: {
          organizationId: id,
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          batchNumber: true,
          quantity: true,
          itemCode: true,
          itemClassCode: true,
          packageUnitCode: true,
          quantityUnitCode: true,
        },
        orderBy: [
          { name: 'asc' },
        ],
      }),
    ]);

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const organizationMissingFields = [
      !hasNonEmptyText(organization.TIN) ? 'TIN' : null,
      !hasNonEmptyText(organization.ebmDeviceId) ? 'ebmDeviceId' : null,
      !hasNonEmptyText(organization.ebmSerialNo) ? 'ebmSerialNo' : null,
    ].filter(Boolean) as string[];

    const branchItems = branches.map((branch) => {
      const missingFields = [
        !hasNonEmptyText(branch.bhfId) ? 'bhfId' : null,
      ].filter(Boolean) as string[];

      return {
        ...branch,
        missingFields,
      };
    });

    const productItems = products.map((product) => {
      const missingFields = [
        !hasNonEmptyText(product.itemCode) ? 'itemCode' : null,
        !hasNonEmptyText(product.itemClassCode) ? 'itemClassCode' : null,
        !hasNonEmptyText(product.packageUnitCode) ? 'packageUnitCode' : null,
        !hasNonEmptyText(product.quantityUnitCode) ? 'quantityUnitCode' : null,
      ].filter(Boolean) as string[];

      return {
        ...product,
        itemCode: product.itemCode,
        itemClassCode: product.itemClassCode,
        packageUnitCode: product.packageUnitCode,
        quantityUnitCode: product.quantityUnitCode,
        missingFields,
      };
    });

    const branchMissingItems = branchItems.filter((branch) => branch.missingFields.length > 0);
    const productMissingItems = productItems.filter((product) => product.missingFields.length > 0);

    const readinessReport = {
      summary: {
        ready:
          organizationMissingFields.length === 0 &&
          branchMissingItems.length === 0 &&
          productMissingItems.length === 0,
        organizationReady: organizationMissingFields.length === 0,
        branchesReady: branchMissingItems.length === 0,
        productsReady: productMissingItems.length === 0,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        missingFields: organizationMissingFields,
      },
      branches: {
        total: branchItems.length,
        readyCount: branchItems.length - branchMissingItems.length,
        missingCount: branchMissingItems.length,
        missingFieldCounts: {
          bhfId: branchMissingItems.filter((branch) => branch.missingFields.includes('bhfId')).length,
        },
        items: branchMissingItems,
      },
      products: {
        total: productItems.length,
        readyCount: productItems.length - productMissingItems.length,
        missingCount: productMissingItems.length,
        missingFieldCounts: {
          itemCode: productMissingItems.filter((product) => product.missingFields.includes('itemCode')).length,
          itemClassCode: productMissingItems.filter((product) => product.missingFields.includes('itemClassCode')).length,
          packageUnitCode: productMissingItems.filter((product) => product.missingFields.includes('packageUnitCode')).length,
          quantityUnitCode: productMissingItems.filter((product) => product.missingFields.includes('quantityUnitCode')).length,
        },
        items: productMissingItems,
      },
    };

    res.json({ readiness: readinessReport });
  } catch (error) {
    console.error("Error fetching VSDC readiness:", error);
    res.status(500).json({ error: "Failed to fetch VSDC readiness" });
  }
};

export const getOrganizationVsdcSync = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const sync = await getOrganizationVsdcSyncReport(id);
    res.json({ sync });
  } catch (error) {
    console.error("Error fetching VSDC sync status:", error);
    res.status(500).json({ error: "Failed to fetch VSDC sync status" });
  }
};

export const runOrganizationVsdcSync = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);
    const requestedTarget =
      typeof req.body?.target === "string" && req.body.target.trim().length > 0
        ? req.body.target.trim().toUpperCase()
        : "ALL";

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const sync = await runOrganizationVsdcReferenceSync({
      organizationId: id,
      target: requestedTarget as
        | "ALL"
        | "INIT_INFO"
        | "CODE_TABLES"
        | "BRANCHES"
        | "NOTICES",
    });

    await auditLogger.system(req, {
      type: "ORGANIZATION_UPDATE",
      description: `VSDC reference sync executed (${requestedTarget})`,
      entityType: "Organization",
      entityId: id.toString(),
      metadata: {
        target: requestedTarget,
        canSync: sync.canSync,
        snapshots: Object.entries(sync.snapshots).reduce<Record<string, string | null>>(
          (acc, [key, value]) => {
            acc[key] = value?.submissionStatus ?? null;
            return acc;
          },
          {}
        ),
      },
    });

    res.json({
      message: `VSDC reference sync completed for ${requestedTarget}`,
      sync,
    });
  } catch (error: any) {
    console.error("Error running VSDC sync:", error);
    const message = error?.message || "Failed to run VSDC sync";
    const status = /required|configure|unsupported/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
};

export const getOrganizationVsdcStockSync = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const stockSync = await getOrganizationVsdcStockSyncReport(id);
    res.json({ stockSync });
  } catch (error) {
    console.error("Error fetching VSDC stock sync status:", error);
    res.status(500).json({ error: "Failed to fetch VSDC stock sync status" });
  }
};

export const runOrganizationVsdcStockSyncController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);
    const requestedTarget =
      typeof req.body?.target === "string" && req.body.target.trim().length > 0
        ? req.body.target.trim().toUpperCase()
        : "ALL";

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const stockSync = await runOrganizationVsdcStockSync({
      organizationId: id,
      target: requestedTarget as
        | "ALL"
        | "BRANCH_MASTER"
        | "ITEM_MASTER"
        | "STOCK_MASTER"
        | "STOCK_MOVEMENTS",
    });

    await auditLogger.system(req, {
      type: "ORGANIZATION_UPDATE",
      description: `VSDC stock sync executed (${requestedTarget})`,
      entityType: "Organization",
      entityId: id.toString(),
      metadata: {
        target: requestedTarget,
        canSync: stockSync.canSync,
        snapshots: Object.entries(stockSync.snapshots).reduce<Record<string, string | null>>(
          (acc, [key, value]) => {
            acc[key] = value?.submissionStatus ?? null;
            return acc;
          },
          {}
        ),
      },
    });

    res.json({
      message: `VSDC stock sync completed for ${requestedTarget}`,
      stockSync,
    });
  } catch (error: any) {
    console.error("Error running VSDC stock sync:", error);
    const message = error?.message || "Failed to run VSDC stock sync";
    const status = /required|configure|unsupported|complete/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
};

export const createOrganization = async (req: Request, res: Response) => {
  try {
    const { name, businessType, address, phone, email } = req.body;
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    if (!name || !businessType || !address || !email) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        businessType,
        address,
        phone,
        email,
        isActive: true,
      },
    });

    await prisma.$transaction(async (tx: any) => {
      await tx.userOrganization.create({
        data: {
          userId: userId!,
          organizationId: organization.id,
          role: "ADMIN",
          isOwner: true,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { role: "ADMIN" },
      });
      // Create default branch
      const branch = await tx.branch.create({
        data: {
          name: "Main Branch",
          code: "MAIN-001",
          organizationId: organization.id,
          status: 'ACTIVE',
        },
      });
      // Assign user to branch as primary
      await tx.userBranch.create({
        data: {
          userId: userId!,
          branchId: branch.id,
          isPrimary: true,
        },
      });
    });
    try {
      const freeTrialPlan = await prisma.subscriptionPlan.findFirst({
        where: { name: "Free Trial" }
      });

      if (!freeTrialPlan) {
        return res.status(400).json({ error: 'Free Trial plan not found. Please contact support.' });
      } else {
        const subscriptionService = new SubscriptionService(prisma);
        await subscriptionService.createTrial(organization.id, freeTrialPlan.id);
      }
    } catch (subscriptionError) {
      await prisma.organization.delete({ where: { id: organization.id } });
      return res.status(500).json({ error: 'Failed to create free trial subscription' });
    }

    // Fetch updated user data to include in response
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      }
    });

    res.status(201).json({
      message: "Organization created successfully",
      organization: {
        id: organization.id,
        name: organization.name,
        businessType: organization.businessType,
        address: organization.address,
        phone: organization.phone,
        email: organization.email,
        role: "ADMIN",
        isOwner: true,
      },
      user: updatedUser, // Include updated user data
    });
  } catch (error) {
    console.error("Error creating organization:", error);
    res.status(500).json({ error: "Failed to create organization" });
  }
};

export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name,
      businessType,
      address,
      phone,
      email,
      TIN,
      currency,
      ebmDeviceId,
      ebmSerialNo,
    } = req.body;
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
        role: "ADMIN",
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Only admins can update organization details" });
    }

    if (ebmDeviceId !== undefined && ebmDeviceId !== null && typeof ebmDeviceId !== "string") {
      return res.status(400).json({ error: "ebmDeviceId must be a string" });
    }
    if (ebmSerialNo !== undefined && ebmSerialNo !== null && typeof ebmSerialNo !== "string") {
      return res.status(400).json({ error: "ebmSerialNo must be a string" });
    }

    const organization = await prisma.organization.update({
      where: { id },
      data: {
        name,
        businessType,
        address,
        phone,
        email,
        TIN,
        currency,
        ...(ebmDeviceId !== undefined
          ? { ebmDeviceId: ebmDeviceId === "" ? null : ebmDeviceId }
          : {}),
        ...(ebmSerialNo !== undefined
          ? { ebmSerialNo: ebmSerialNo === "" ? null : ebmSerialNo }
          : {}),
      },
    });

    await auditLogger.system(req, {
      type: 'SETTINGS_UPDATE',
      description: `Organization "${organization.name}" details updated`,
      entityType: 'Organization',
      entityId: organization.id,
      metadata: { updates: req.body }
    });

    res.json({
      message: "Organization updated successfully",
      organization,
    });
  } catch (error) {
    console.error("Error updating organization:", error);
    res.status(500).json({ error: "Failed to update organization" });
  }
};

export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId: id,
        role: "ADMIN",
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Only admins can delete organization" });
    }

    await prisma.organization.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: "Organization deleted successfully" });
  } catch (error) {
    console.error("Error deleting organization:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
};

export const inviteUser = async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { email, role } = req.body;
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const requiredFields = { email, role };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({ error: `${key} is required` });
      }
    }

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId,
        role: { in: ["ADMIN"] },
      },
    });

    if (!userOrganization) {
      return res.status(403).json({ error: "Only admins can invite users" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const existingUserOrganization = await prisma.userOrganization.findFirst({
        where: {
          userId: existingUser.id,
          organizationId,
        },
      });

      if (existingUserOrganization) {
        return res
          .status(400)
          .json({ error: "User already exists in this organization" });
      }

      // For existing users, still create an invitation and send email
      // They need to accept it to join the organization
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Fetch organization details
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId! },
        select: { name: true, email: true },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const invitation = await prisma.organizationInvitation.create({
        data: {
          organizationId: organizationId!,
          email,
          role,
          token,
          invitedBy: userId!,
          expiresAt,
          invitedUserId: existingUser.id, // Link to existing user
          defaultPassword: "",
        },
      });

      await emailService.sendInvitationEmail(
        email,
        organization.name,
        role,
        token,
        null // No password needed for existing users
      );

      await auditLogger.users(req, {
        type: 'USER_INVITE',
        description: `Invitation sent to existing user: ${email}`,
        entityType: 'User',
        entityId: existingUser.id,
        metadata: {
          email,
          role,
        }
      });

      return res.json({
        message: "Invitation sent to existing user successfully. They need to accept it to join the organization.",
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const plainPassword = generateStrongPassword(12);
    const defaultPassword = await bcrypt.hash(plainPassword, 10);

    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: organizationId!,
        email,
        role,
        token,
        defaultPassword,
        invitedBy: userId!,
        expiresAt,
      },
      include: {
        organization: true,
      },
    });

    await emailService.sendInvitationEmail(
      email,
      invitation.organization.name,
      role,
      token,
      plainPassword
    );

    await auditLogger.users(req, {
      type: 'USER_INVITE',
      description: `New user invitation sent: ${email}`,
      entityType: 'User',
      entityId: invitation.id,
      metadata: {
        email,
        role,
      }
    });

    res.status(201).json({
      message: "Invitation sent successfully",
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
      },
    });
  } catch (error) {
    console.error("Error inviting user:", error);
    res.status(500).json({ error: "Failed to send invitation" });
  }
};

export const bulkInviteUsers = async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId,
        role: "ADMIN",
      },
    });

    if (!userOrganization) {
      return res.status(403).json({ error: "Only admins can invite users" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Excel file is required" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const invitations = [];
    const errors = [];

    for (const row of data as any[]) {
      try {
        const email = row.email || row.Email;
        const role = row.role || row.Role;

        if (!email || !role) {
          errors.push({ row, error: "Missing email or role" });
          continue;
        }

        if (
          !["ADMIN", "MANAGER", "ACCOUNTANT", "STAFF"].includes(
            role.toUpperCase()
          )
        ) {
          errors.push({ row, error: "Invalid role" });
          continue;
        }

        const existingUser = await prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          const existingUserOrganization =
            await prisma.userOrganization.findFirst({
              where: {
                userId: existingUser.id,
                organizationId,
              },
            });

          if (existingUserOrganization) {
            errors.push({
              row,
              error: "User already exists in this organization",
            });
            continue;
          }
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        const plainPassword = crypto.randomBytes(8).toString("hex");
        const defaultPassword = await bcrypt.hash(plainPassword, 10);

        const invitation = await prisma.organizationInvitation.create({
          data: {
            organizationId: organizationId!,
            email,
            role: role.toUpperCase(),
            token,
            expiresAt,
            defaultPassword: defaultPassword,
            invitedBy: userId!,
          },
          include: {
            organization: true,
          },
        });

        await emailService.sendInvitationEmail(
          email,
          invitation.organization.name,
          token,
          role.toUpperCase(),
          plainPassword
        );

        invitations.push({
          email,
          role: role.toUpperCase(),
          status: "sent",
        });
      } catch (error) {
        errors.push({ row, error: "Failed to process invitation" });
      }
    }

    await auditLogger.users(req, {
      type: 'USER_INVITE',
      description: `Bulk invitations sent for organization ${organizationId}`,
      entityType: 'Organization',
      entityId: organizationId,
      metadata: {
        successful: invitations.length,
        failed: errors.length,
      }
    });

    res.status(201).json({
      message: "Bulk invitation completed",
      successful: invitations.length,
      failed: errors.length,
      invitations,
      errors,
    });
  } catch (error) {
    console.error("Error bulk inviting users:", error);
    res.status(500).json({ error: "Failed to process bulk invitations" });
  }
};
export const cancelInvitation = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    const invitation = await prisma.organizationInvitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "CANCELLED" },
    });

    await auditLogger.users(req, {
      type: 'USER_INVITE',
      description: `Invitation ${id} cancelled`,
      entityType: 'User',
      entityId: id,
      status: 'FAILED',
    });

    res.json({ message: "Invitation cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling invitation:", error);
    res.status(500).json({ error: "Failed to cancel invitation" });
  }
};

export const getInvitationDetails = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const invitation = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            name: true,
            email: true,
            businessType: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    res.json(invitation);
  } catch (error) {
    console.error("Error getting invitation details:", error);
    res.status(500).json({ error: "Failed to get invitation details" });
  }
};

export const declineInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const invitation = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    if (invitation?.status !== "PENDING") {
      return res.status(400).json({ error: "Invitation already processed" });
    }

    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "DECLINED" },
    });

    await auditLogger.users(req, {
      type: 'USER_INVITE',
      description: `Invitation ${invitation.id} declined by ${invitation.email}`,
      entityType: 'User',
      entityId: invitation.id,
      status: 'FAILED',
    });

    emailService.sendInvitationAcceptedOrDeclinedEmail(
      invitation.organization.email!,
      invitation.organization.name,
      "DECLINED",
      invitation.email
    );

    res.json({ message: "Invitation declined successfully" });
  } catch (error) {
    console.error("Error declining invitation:", error);
    res.status(500).json({ error: "Failed to decline invitation" });
  }
};

export const acceptInvitation = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const { token } = req.params;

    if (!token || !name) {
      return res.status(400).json({ error: "Token and name are required" });
    }

    const invitation = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    if (invitation.status !== "PENDING") {
      return res.status(400).json({ error: "Invitation already processed" });
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return res.status(400).json({ error: "Invitation has expired" });
    }

    let user = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: invitation.email,
          name,
          role: invitation.role,
          password: invitation.defaultPassword,
          requirePasswordChange: true,
          defaultPassword: invitation.defaultPassword,
          isEmailVerified: true,
          isActive: true,
        },
      });
    }

    // Check if user is already in the organization (for existing users)
    const existingUserOrg = await prisma.userOrganization.findFirst({
      where: {
        userId: user.id,
        organizationId: invitation.organizationId,
      },
    });

    if (!existingUserOrg) {
      await prisma.userOrganization.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
          isOwner: false,
        },
      });
    }

    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        invitedUserId: user.id,
      },
    });

    await auditLogger.users(req, {
      type: 'USER_ACCEPT_INVITE',
      description: `Invitation accepted by ${user.email}`,
      entityType: 'User',
      entityId: user.id,
      metadata: { invitationId: invitation.id }
    });

    emailService.sendInvitationAcceptedOrDeclinedEmail(
      invitation.organization.email!,
      invitation.organization.name,
      "ACCEPTED",
      invitation.email
    );
    res.json({
      message: "Invitation accepted successfully",
      organization: invitation.organization,
      requirePasswordChange: true,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ error: "Failed to accept invitation" });
  }
};

export const getOrganizationUsers = async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId,
      },
    });

    if (!userOrganization) {
      return res
        .status(403)
        .json({ error: "Access denied to this organization" });
    }

    const users = await prisma.userOrganization.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json({
      users: users.map((uo) => ({
        id: uo.user.id,
        email: uo.user.email,
        name: uo.user.name,
        role: uo.role,
      })),
    });
  } catch (error) {
    console.error("Error fetching organization users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const removeUserFromOrganization = async (
  req: Request,
  res: Response
) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const targetUserId = parseInt(req.params.userId);
    //@ts-ignore
    const userId = parseInt(req.user?.userId as string);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId,
        role: "ADMIN",
      },
    });

    if (!userOrganization) {
      return res.status(403).json({ error: "Only admins can remove users" });
    }

    if (userId === targetUserId) {
      return res
        .status(400)
        .json({ error: "Cannot remove yourself from organization" });
    }

    await prisma.userOrganization.deleteMany({
      where: {
        userId: targetUserId,
        organizationId,
      },
    });

    await auditLogger.users(req, {
      type: 'USER_ROLE_UPDATE',
      description: `User "${targetUserId}" removed from organization`,
      entityType: 'User',
      entityId: targetUserId,
      status: 'SUCCESS',
    });

    res.json({ message: "User removed successfully" });
  } catch (error) {
    console.error("Error removing user:", error);
    res.status(500).json({ error: "Failed to remove user" });
  }
};

export const updateOrganizationAvatar = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existingOrg = await prisma.organization.findUnique({ where: { id } });
    if (!existingOrg) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    let avatar = existingOrg.avatar;

    if (req.file) {
      if (avatar) {
        await deleteFromCloudinary(avatar);
      }

      const result: any = await uploadToCloudinary(req.file);
      avatar = result.secure_url;
    }

    const updatedOrg = await prisma.organization.update({
      where: { id },
      data: {
        ...(avatar && { avatar }),
      },
    });

    res.json(updatedOrg);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ message: 'Error updating organization' });
  }
};
