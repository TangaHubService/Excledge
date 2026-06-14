import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { error as apiError } from '../utils/apiResponse';

const TWENTY_TWO_HOURS_MS = 22 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Check whether the VSDC has been reachable within the last 24 hours.
 *
 * - Returns `true` if contact was made within the allowed window.
 * - Logs a warning if > 22 hours since last contact.
 * - Throws a structured error if > 24 hours (hard block).
 */
export async function verifyVsdcOnlineStatus(organizationId: number): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { lastSuccessfulVdsContact: true },
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  const lastContact = org.lastSuccessfulVdsContact;
  if (!lastContact) {
    // No contact ever recorded — allow initial sales but flag it
    return true;
  }

  const elapsed = Date.now() - lastContact.getTime();

  if (elapsed >= TWENTY_FOUR_HOURS_MS) {
    const hoursOffline = Math.floor(elapsed / (60 * 60 * 1000));
    throw Object.assign(
      new Error(
        `VSDC unreachable for ${hoursOffline}h (>24h limit). ` +
        'Receipt generation is blocked. Contact system administrator to restore connectivity.',
      ),
      { statusCode: 503 },
    );
  }

  if (elapsed >= TWENTY_TWO_HOURS_MS) {
    const hoursOffline = Math.floor(elapsed / (60 * 60 * 1000));
    console.warn(
      `[VSDC] Organization ${organizationId}: ${hoursOffline}h since last successful VSDC contact. ` +
      `Approaching the 24-hour hard limit.`,
    );
  }

  return true;
}

/**
 * Express middleware — applies 24-hour offline guard to any route it's mounted on.
 *
 * Usage:
 *   router.post('/sales', vsdcOnlineGuard, salesController.createSale);
 *
 * Expects `req.params.organizationId` to be set (by param resolution middleware
 * or from the route path).
 */
export function vsdcOnlineGuard(req: Request, res: Response, next: NextFunction): void {
  const orgId = parseInt(req.params.organizationId, 10);
  if (!orgId || isNaN(orgId)) {
    res.status(400).json(apiError('Missing or invalid organizationId'));
    return;
  }

  verifyVsdcOnlineStatus(orgId)
    .then(() => next())
    .catch((err: Error & { statusCode?: number }) => {
      const status = err.statusCode || 503;
      res.status(status).json(apiError(err.message));
    });
}
