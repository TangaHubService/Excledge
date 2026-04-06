import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

export interface BranchAuthRequest extends AuthRequest {
    selectedBranchId?: number | null;
    branchIds?: number[];
    branchScope?: 'ALL' | 'LIMITED';
}

/**
 * Branch authorization middleware
 * Extracts optional branchId from query and validates user access
 * 
 * Rules:
 * - No branchId parameter → returns all data (selectedBranchId = null)
 * - Specific branchId → validates access and returns branch + org-level data
 */
export const branchAuth = async (
    req: BranchAuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = parseInt(req.user.userId);
        const userRole = req.user.role as UserRole;

        // Check if user can access all branches
        const canAccessAll = userRole === UserRole.ADMIN || userRole === UserRole.SYSTEM_OWNER;

        // Get branchId from query parameter (optional)
        const branchIdParam = req.query.branchId as string | undefined;
        let branchId: number | null = null;

        if (branchIdParam && branchIdParam !== 'undefined' && branchIdParam !== 'null') {
            const parsed = parseInt(branchIdParam);
            if (!isNaN(parsed)) {
                branchId = parsed;
            }
        }

        // Get user's assigned branches
        const userBranches = await prisma.userBranch.findMany({
            where: { userId },
            select: { branchId: true },
        });

        const userBranchIds = userBranches.map(ub => ub.branchId);
        req.branchIds = userBranchIds;
        req.branchScope = canAccessAll ? 'ALL' : 'LIMITED';

        // If no branchId specified, allow (returns all data)
        if (branchId === null) {
            req.selectedBranchId = null;
            return next();
        }

        // If branchId specified, validate access
        if (!canAccessAll && !userBranchIds.includes(branchId)) {
            return res.status(403).json({
                error: 'Forbidden: You do not have access to this branch'
            });
        }

        req.selectedBranchId = branchId;
        next();
    } catch (error: any) {
        console.error('[Branch Auth Error]:', error);
        res.status(500).json({ error: 'Failed to authorize branch access' });
    }
};

/**
 * Helper function to build branch filter for Prisma queries
 * Includes organization-level data (branch_id = NULL) when filtering by branch
 * 
 * Rules:
 * - No branchId (null) → no filter, returns all data
 * - Specific branchId → returns branch data + org-level data (branch_id = NULL)
 */
export function buildBranchFilter(req: BranchAuthRequest) {
    const branchId = req.selectedBranchId;

    // No branchId = return all data
    if (branchId === null || branchId === undefined) {
        return {};
    }

    // Specific branchId = return branch data + org-level data
    // Specific branchId = return branch data only (branchId is required)
    return { branchId };
}
/**
 * Helper function to get branch ID for write operations
 * Write operations (create, update) require a specific branch ID
 */
export function getBranchIdForOperation(req: BranchAuthRequest): number {
    // For write operations, we need a specific branch ID
    const branchId = req.selectedBranchId ||
        req.body?.branchId ||
        req.params?.branchId ||
        req.query?.branchId;

    if (!branchId) {
        throw new Error('Branch ID is required for this operation');
    }

    return typeof branchId === 'string' ? parseInt(branchId) : branchId;
}

/**
 * Middleware to require specific branch access
 * Use this for endpoints that MUST have a branch (e.g., creating a sale)
 */
export const requireBranchId = async (
    req: BranchAuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const branchId = req.selectedBranchId || req.body?.branchId;

        if (!branchId) {
            return res.status(400).json({
                error: 'Branch ID is required for this operation'
            });
        }

        const userId = parseInt(req.user?.userId || '0');
        const userRole = req.user?.role as UserRole;

        // Admins can access any branch
        if (userRole === UserRole.ADMIN || userRole === UserRole.SYSTEM_OWNER) {
            return next();
        }

        // Validate user has access to this branch
        const userBranch = await prisma.userBranch.findFirst({
            where: { userId, branchId },
        });

        if (!userBranch) {
            return res.status(403).json({
                error: 'Forbidden: You do not have access to this branch'
            });
        }

        next();
    } catch (error: any) {
        console.error('[Require Branch ID Error]:', error);
        res.status(500).json({ error: 'Failed to verify branch access' });
    }
};
