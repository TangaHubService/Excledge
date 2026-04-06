/**
 * Helper utilities for branch-based filtering in controllers
 * 
 * This module provides utilities to integrate branch filtering into existing controllers
 * with minimal changes to existing code.
 */

import type { BranchAuthRequest } from '../middleware/branchAuth.middleware';

/**
 * Build branch filter for Prisma queries
 * Returns an object that can be spread into Prisma where clauses
 */
export function buildBranchFilter(req: BranchAuthRequest) {
    if (req.branchScope === 'ALL') {
        return {}; // No filter - access all branches
    }

    if (req.branchIds && req.branchIds.length > 0) {
        if (req.branchIds.length === 1) {
            return {
                branchId: req.branchIds[0],
            };
        }

        return {
            branchId: {
                in: req.branchIds,
            },
        };
    }

    return {};
}

/**
 * Get the primary branch ID for operations that require a single branch
 * Falls back to first assigned branch if no primary branch is set
 */
export function getPrimaryBranchId(req: BranchAuthRequest): number | null {
    if (req.branchIds && req.branchIds.length > 0) {
        return req.branchIds[0];
    }
    return null;
}

/**
 * Get branch ID from request body or use primary branch
 * Useful for create operations that need a branchId
 */
export function getBranchIdForOperation(req: BranchAuthRequest, bodyField: string = 'branchId'): number {
    // First check if branchId is explicitly provided in request body
    const explicitBranchId = req.body[bodyField];
    if (explicitBranchId) {
        const branchId = parseInt(explicitBranchId);

        // Validate user has access to this branch
        if (req.branchIds && !req.branchIds.includes(branchId)) {
            throw new Error('You do not have access to the specified branch');
        }

        return branchId;
    }

    // Fall back to primary branch
    const primaryBranchId = getPrimaryBranchId(req);
    if (!primaryBranchId) {
        throw new Error('No branch specified and no primary branch found');
    }

    return primaryBranchId;
}

/**
 * Migration helper: Get branch ID from warehouseId or use primary branch
 * This helps during the transition period where some requests still use warehouseId
 * 
 * @deprecated Use getBranchIdForOperation instead after migration is complete
 */
export function getBranchIdFromWarehouseOrPrimary(
    req: BranchAuthRequest,
    warehouseId: number | null
): number {
    // If warehouseId is provided, we need to map it to branchId
    // For now, during migration, we can use the primary branch
    // TODO: Implement warehouse-to-branch mapping if needed

    const primaryBranchId = getPrimaryBranchId(req);
    if (!primaryBranchId) {
        throw new Error('No branch assigned to user');
    }

    return primaryBranchId;
}
