import { BranchStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateBranchParams {
  organizationId: number;
  name: string;
  code: string;
  bhfId?: string;
  location?: string;
  address?: string;
  phone?: string;
  metadata?: any;
}

export interface UpdateBranchParams {
  name?: string;
  code?: string;
  bhfId?: string;
  location?: string;
  address?: string;
  phone?: string;
  status?: BranchStatus;
  metadata?: any;
}

const normalizeOptionalText = (value?: string | null) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Get all branches for an organization
 */
export async function getBranches(
  organizationId: number,
  includeInactive: boolean = false
) {
  const where: any = {
    organizationId,
  };

  if (!includeInactive) {
    where.status = BranchStatus.ACTIVE;
  }

  return await prisma.branch.findMany({
    where,
    include: {
      _count: {
        select: {
          userBranches: true,
          sales: true,
          batches: true,
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
  });
}

/**
 * Get a single branch by ID
 */
export async function getBranchById(branchId: number, organizationId: number) {
  return await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
    },
    include: {
      _count: {
        select: {
          userBranches: true,
          sales: true,
          batches: true,
          stockMovements: true,
          expenses: true,
        },
      },
    },
  });
}

/**
 * Create a new branch
 */
export async function createBranch(params: CreateBranchParams) {
  const { organizationId, name, code, bhfId, location, address, phone, metadata } = params;

  // Check if code is unique within organization
  const existing = await prisma.branch.findFirst({
    where: {
      organizationId,
      code,
    },
  });

  if (existing) {
    throw new Error(`Branch code ${code} already exists in this organization`);
  }

  // Create branch
  return await prisma.branch.create({
    data: {
      organizationId,
      name,
      code,
      bhfId: normalizeOptionalText(bhfId),
      location,
      address,
      phone,
      metadata,
      status: BranchStatus.ACTIVE,
    },
  });
}

/**
 * Update a branch
 */
export async function updateBranch(
  branchId: number,
  organizationId: number,
  data: UpdateBranchParams
) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
    },
  });

  if (!branch) {
    throw new Error(`Branch with ID ${branchId} not found`);
  }

  if (data.code && data.code !== branch.code) {
    const existing = await prisma.branch.findFirst({
      where: {
        organizationId,
        code: data.code,
        NOT: { id: branchId },
      },
    });

    if (existing) {
      throw new Error(`Branch code ${data.code} already exists in this organization`);
    }
  }

  // Update branch
  return await prisma.branch.update({
    where: { id: branchId },
    data: {
      ...data,
      ...(data.bhfId !== undefined ? { bhfId: normalizeOptionalText(data.bhfId) } : {}),
    },
  });
}

/**
 * Delete a branch (soft delete by setting status to INACTIVE)
 */
export async function deleteBranch(branchId: number, organizationId: number) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
    },
  });

  if (!branch) {
    throw new Error(`Branch with ID ${branchId} not found`);
  }

  // Check if branch has inventory
  const hasInventory = await prisma.batch.findFirst({
    where: {
      branchId: branchId,
      quantity: { gt: 0 },
    },
  });

  if (hasInventory) {
    // Soft delete - just deactivate
    return await prisma.branch.update({
      where: { id: branchId },
      data: {
        status: BranchStatus.INACTIVE,
      },
    });
  } else {
    // Hard delete if no inventory
    return await prisma.branch.delete({
      where: { id: branchId },
    });
  }
}

/**
 * Assign a user to a branch
 */
export async function assignUserToBranch(
  userId: number,
  branchId: number,
  isPrimary: boolean = false
) {
  // If setting as primary, unset other primary branches for this user
  if (isPrimary) {
    await prisma.userBranch.updateMany({
      where: {
        userId,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });
  }

  // Create or update user-branch assignment
  return await prisma.userBranch.upsert({
    where: {
      userId_branchId: {
        userId,
        branchId,
      },
    },
    create: {
      userId,
      branchId,
      isPrimary,
    },
    update: {
      isPrimary,
    },
  });
}

/**
 * Remove a user from a branch
 */
export async function removeUserFromBranch(userId: number, branchId: number) {
  return await prisma.userBranch.delete({
    where: {
      userId_branchId: {
        userId,
        branchId,
      },
    },
  });
}

/**
 * Get all branches for a user
 */
export async function getUserBranches(userId: number, organizationId?: number) {
  const where: any = {
    userId,
  };

  if (organizationId) {
    where.branch = {
      organizationId,
    };
  }

  const userBranches = await prisma.userBranch.findMany({
    where,
    include: {
      branch: {
        include: {
          _count: {
            select: {
              sales: true,
              batches: true,
            },
          },
        },
      },
    },
    orderBy: [
      { isPrimary: 'desc' },
      { branch: { name: 'asc' } },
    ],
  });

  return userBranches.map((ub) => ({
    ...ub.branch,
    isPrimary: ub.isPrimary,
  }));
}

/**
 * Get primary branch for a user
 */
export async function getUserPrimaryBranch(userId: number) {
  const userBranch = await prisma.userBranch.findFirst({
    where: {
      userId,
      isPrimary: true,
    },
    include: {
      branch: true,
    },
  });

  return userBranch?.branch || null;
}

/**
 * Get all users assigned to a branch
 */
export async function getBranchUsers(branchId: number) {
  const userBranches = await prisma.userBranch.findMany({
    where: {
      branchId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  return userBranches.map((ub) => ({
    ...ub.user,
    isPrimary: ub.isPrimary,
  }));
}
