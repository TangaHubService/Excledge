import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware';
import type { OrganizationAccessRequest } from './organizationAccess.middleware';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

export interface BranchAuthRequest extends AuthRequest {
    selectedBranchId?: number | null;
    branchIds?: number[];
    branchScope?: 'ALL' | 'LIMITED';
}

/**
 * Resolve the effective org-level role for a user.
 * Checks, in order:
 * 1. `organizationRole` on request (set by `requireOrganizationAccess`)
 * 2. `user.role` from JWT (which reflects org role after login)
 * 3. Queries `UserOrganization` for the active org from JWT
 */
async function resolveOrgRole(req: AuthRequest): Promise<{ role: string; orgId: number | null; isOwner: boolean }> {
    const orgAccessReq = req as OrganizationAccessRequest;
    if (orgAccessReq.organizationRole) {
        return { role: orgAccessReq.organizationRole, orgId: parseInt(String(req.params.organizationId ?? req.params.id), 10) || null, isOwner: false };
    }

    const jwtRole = req.user?.role;
    const activeOrgId = req.user?.activeOrganizationId ?? req.user?.organizationId;

    if (activeOrgId != null) {
        const orgId = Number(activeOrgId);
        if (!isNaN(orgId)) {
            const membership = await prisma.userOrganization.findFirst({
                where: { userId: Number(req.user!.userId), organizationId: orgId },
                select: { role: true, isOwner: true },
            });
            if (membership) {
                return { role: membership.role, orgId, isOwner: membership.isOwner };
            }
        }
    }

    return { role: jwtRole ?? '', orgId: activeOrgId != null ? Number(activeOrgId) || null : null, isOwner: false };
}

/**
 * Branch authorization middleware
 * Extracts optional branchId from query and validates user access
 * 
 * Rules:
 * - No branchId parameter → returns all data (selectedBranchId = null)
 * - Specific branchId → validates access and returns branch + org-level data
 * - ADMIN at org level can access ALL branches
 * - BRANCH_MANAGER, SELLER, ACCOUNTANT are LIMITED to assigned branches
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

        // Resolve org-specific role
        const { role: orgRole, isOwner } = await resolveOrgRole(req);

        // Get user's assigned branches
        const userBranches = await prisma.userBranch.findMany({
            where: { userId },
            select: { branchId: true },
        });

        const userBranchIds = userBranches.map(ub => ub.branchId);
        req.branchIds = userBranchIds;

        // SYSTEM_OWNER always has full access.
        // ADMIN has full access if they're an org owner OR have no branch restrictions.
        // Other roles (BRANCH_MANAGER, ACCOUNTANT, SELLER) are always LIMITED.
        const hasBranchRestrictions = userBranchIds.length > 0;
        const canAccessAll = orgRole === UserRole.SYSTEM_OWNER ||
            (orgRole === UserRole.ADMIN && (!hasBranchRestrictions || isOwner));

        req.branchScope = canAccessAll ? 'ALL' : 'LIMITED';

        // Get branchId from query parameter (optional)
        const branchIdParam = req.query.branchId as string | undefined;
        let branchId: number | null = null;

        if (branchIdParam && branchIdParam !== 'undefined' && branchIdParam !== 'null') {
            const parsed = parseInt(branchIdParam);
            if (!isNaN(parsed)) {
                branchId = parsed;
            }
        }

        // If no branchId specified, allow (returns all data for admins, or org-level data)
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

        // Resolve org-specific role
        const { role: orgRole, isOwner } = await resolveOrgRole(req);

        // Check if user has branch restrictions
        const userBranches = await prisma.userBranch.findMany({
            where: { userId },
            select: { branchId: true },
        });
        const hasBranchRestrictions = userBranches.length > 0;
        const canAccessAll = orgRole === UserRole.SYSTEM_OWNER ||
            (orgRole === UserRole.ADMIN && (!hasBranchRestrictions || isOwner));

        if (canAccessAll) {
            return next();
        }

        // Validate user has access to this branch
        const userBranch = await prisma.userBranch.findFirst({
            where: { userId, branchId: Number(branchId) },
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
