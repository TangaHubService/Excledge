import type { Response } from "express";
import bcrypt from "bcryptjs";
import type { AuthRequest } from "../middleware/auth.middleware";
import { auditLogger } from "../utils/auditLogger";
import { deleteFromCloudinary, uploadToCloudinary } from "../config/cloudinary";
import { prisma } from "../lib/prisma";

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const search = req.query.search as string;
    const { page = "1", limit = "50" } = req.query;

    // Apply pagination defaults and caps
    const limitNum = Math.min(Math.max(Number.parseInt(limit as string) || 50, 1), 500);
    const pageNum = Math.max(Number.parseInt(page as string) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = {
      organizationId,
      user: { isActive: true, deletedAt: null }
    };

    if (search) {
      whereClause.OR = [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [userOrganizations, totalCount] = await Promise.all([
      prisma.userOrganization.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.userOrganization.count({ where: whereClause }),
    ]);

    const users = userOrganizations.map((uo) => ({
      ...uo.user,
      role: uo.role,
      isOwner: uo.isOwner,
    }));

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error("[Get Users Error]:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: {
        userId: id,
        organizationId,
        user: { deletedAt: null }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!userOrganization) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      ...userOrganization.user,
      role: userOrganization.role,
      isOwner: userOrganization.isOwner,
    });
  } catch (error) {
    console.error("[Get User Error]:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { email, password, name, role } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email, deletedAt: null },
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });

    await prisma.userOrganization.create({
      data: {
        userId: user.id,
        organizationId: organizationId!,
        role,
        isOwner: false, // Default value for isOwner
      },
    });

    await auditLogger.users(req, {
      type: 'USER_CREATED',
      description: `New user "${user.name}" created and added to organization`,
      entityType: 'User',
      entityId: user.id,
      metadata: {
        email: user.email,
        role,
      }
    });

    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    console.error("[Create User Error]:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const { role, ...updateData } = req.body;

    const userOrganization = await prisma.userOrganization.findFirst({
      where: { userId: id, organizationId: organizationId!, user: { deletedAt: null } },
    });

    if (!userOrganization) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update user data
    const { organizations, ...userUpdateData } = updateData;

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id },
        data: { ...userUpdateData },
      });
    }

    await auditLogger.users(req, {
      type: 'USER_ROLE_UPDATE',
      description: `User "${userOrganization.userId}" roles/data updated`,
      entityType: 'User',
      entityId: id,
      metadata: {
        updates: updateData,
      }
    });

    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("[Update User Error]:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);

    const userOrganization = await prisma.userOrganization.findFirst({
      where: { userId: id, organizationId, user: { deletedAt: null } },
    });

    if (!userOrganization) {
      return res.status(404).json({ error: "User not found" });
    }


    await prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() }
    });

    await auditLogger.users(req, {
      type: 'USER_ACCOUNT_DISABLED',
      description: `User account disabled: ${id}`,
      entityType: 'User',
      entityId: id,
    });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("[Delete User Error]:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

export const updateUserProfileImage = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existingUser = await prisma.user.findUnique({ where: { id, deletedAt: null } });
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    let profileImage = existingUser.profileImage;

    if (req.file) {
      // Delete old image if exists
      if (profileImage) {
        await deleteFromCloudinary(profileImage);
      }

      // Upload new image
      const result: any = await uploadToCloudinary(req.file);
      profileImage = result.secure_url;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(profileImage && { profileImage }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        profileImage: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
};