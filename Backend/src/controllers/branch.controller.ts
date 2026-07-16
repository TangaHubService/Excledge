import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  setDefaultBranch,
  assignUserToBranch,
  removeUserFromBranch,
  getUserBranches,
  getUserPrimaryBranch,
  getBranchUsers,
} from '../services/branch.service';
import { auditLogger } from '../utils/auditLogger';

/**
 * Get all branches for an organization
 */
export const getBranchesController = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { includeInactive } = req.query;

    const branches = await getBranches(organizationId, includeInactive === 'true');

    res.json(branches);
  } catch (error: any) {
    console.error('[Get Branches Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to get branches' });
  }
};

/**
 * Get a single branch by ID
 */
export const getBranch = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const branchId = parseInt(req.params.id);

    const branch = await getBranchById(branchId, organizationId);

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json(branch);
  } catch (error: any) {
    console.error('[Get Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to get branch' });
  }
};

/**
 * Get branches for current user
 */
export const getUserBranchesController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.user?.userId);
    const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : undefined;
    const includeInactive = req.query.includeInactive === 'true';

    const branches = await getUserBranches(userId, organizationId, includeInactive);

    res.json(branches);
  } catch (error: any) {
    console.error('[Get User Branches Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to get user branches' });
  }
};

/**
 * Get primary branch for current user
 */
export const getUserPrimaryBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.user?.userId);

    const branch = await getUserPrimaryBranch(userId);

    if (!branch) {
      return res.status(404).json({ error: 'No primary branch found' });
    }

    res.json(branch);
  } catch (error: any) {
    console.error('[Get User Primary Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to get primary branch' });
  }
};

/**
 * Create a new branch
 */
export const createBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const userId = parseInt(req.user?.userId as string);
    const { name, code, location, address, phone, metadata } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Branch name and code are required' });
    }

    const branch = await createBranch({
      organizationId,
      name,
      code,
      location,
      address,
      phone,
      metadata,
    });

    // Auto-assign the creator to the new branch so they can see it immediately
    await assignUserToBranch(userId, branch.id, false);

    await auditLogger.system(req, {
      type: 'BRANCH_CREATE',
      description: `Branch "${name}" created`,
      entityType: 'Branch',
      entityId: branch.id.toString(),
      metadata: {
        name,
        code,
      },
    });

    res.status(201).json(branch);
  } catch (error: any) {
    console.error('[Create Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to create branch' });
  }
};

/**
 * Update a branch
 */
export const updateBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const branchId = parseInt(req.params.id);
    const { name, location, address, addressLine2, phone, status, metadata, bhfId, ebmDeviceId, ebmSerialNo, vsdcUrl } = req.body;

    // C10: MRC number format validation (RRA spec §2.1: BBBCCNNNNNN, 11 chars)
    if (ebmSerialNo !== undefined && ebmSerialNo !== null && ebmSerialNo !== '') {
      const MRC_PATTERN = /^[A-Z0-9]{3}[A-Z0-9]{2}[0-9]{6}$/;
      if (!MRC_PATTERN.test(String(ebmSerialNo).toUpperCase())) {
        return res.status(400).json({
          error: 'Invalid MRC number format. Must be BBBCCNNNNNN (3 developer + 2 certificate + 6 serial digits).',
        });
      }
    }

    const branch = await updateBranch(branchId, organizationId, {
      name,
      location,
      address,
      addressLine2,
      phone,
      status,
      metadata,
      bhfId,
      ebmDeviceId,
      ebmSerialNo: ebmSerialNo ? String(ebmSerialNo).toUpperCase() : undefined,
      vsdcUrl,
    });

    await auditLogger.system(req, {
      type: 'BRANCH_UPDATE',
      description: `Branch "${branch.name}" updated`,
      entityType: 'Branch',
      entityId: branch.id.toString(),
      metadata: {
        name: branch.name,
      },
    });

    res.json(branch);
  } catch (error: any) {
    console.error('[Update Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to update branch' });
  }
};

/**
 * Set a branch as the organization's default branch
 */
export const setDefaultBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const branchId = parseInt(req.params.id);

    const branch = await setDefaultBranch(branchId, organizationId);

    await auditLogger.system(req, {
      type: 'BRANCH_UPDATE',
      description: `Branch "${branch.name}" set as default`,
      entityType: 'Branch',
      entityId: branch.id.toString(),
      metadata: { name: branch.name },
    });

    res.json(branch);
  } catch (error: any) {
    console.error('[Set Default Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to set default branch' });
  }
};

/**
 * Delete a branch
 */
export const deleteBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const branchId = parseInt(req.params.id);

    const branch = await deleteBranch(branchId, organizationId);

    await auditLogger.system(req, {
      type: 'BRANCH_UPDATE',
      description: `Branch "${branch.name}" archived`,
      entityType: 'Branch',
      entityId: branchId.toString(),
    });

    res.json({ message: 'Branch deleted successfully', branch });
  } catch (error: any) {
    console.error('[Delete Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to delete branch' });
  }
};

/**
 * Assign user to branch
 */
export const assignUserToBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const branchId = parseInt(req.params.id);
    const { userId, isPrimary } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const userBranch = await assignUserToBranch(
      parseInt(userId),
      branchId,
      isPrimary === true
    );

    await auditLogger.system(req, {
      type: 'BRANCH_UPDATE',
      description: `User assigned to branch`,
      entityType: 'UserBranch',
      entityId: userBranch.id.toString(),
      metadata: {
        userId,
        branchId,
        isPrimary,
      },
    });

    res.json(userBranch);
  } catch (error: any) {
    console.error('[Assign User to Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to assign user to branch' });
  }
};

/**
 * Remove user from branch
 */
export const removeUserFromBranchController = async (req: AuthRequest, res: Response) => {
  try {
    const branchId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    await removeUserFromBranch(userId, branchId);

    await auditLogger.system(req, {
      type: 'BRANCH_UPDATE',
      description: `User removed from branch`,
      entityType: 'UserBranch',
      entityId: `${userId}-${branchId}`,
      metadata: {
        userId,
        branchId,
      },
    });

    res.json({ message: 'User removed from branch successfully' });
  } catch (error: any) {
    console.error('[Remove User from Branch Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to remove user from branch' });
  }
};

/**
 * Get all users assigned to a branch
 */
export const getBranchUsersController = async (req: AuthRequest, res: Response) => {
  try {
    const branchId = parseInt(req.params.id);

    const users = await getBranchUsers(branchId);

    res.json(users);
  } catch (error: any) {
    console.error('[Get Branch Users Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to get branch users' });
  }
};
