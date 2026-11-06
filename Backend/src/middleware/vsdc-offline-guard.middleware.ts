import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { error as apiError } from '../utils/apiResponse';
import { isEbmEnabled } from '../services/rra-ebm.service';
import { buildVsdcEnvelope, probeVsdc, type VsdcProbeResult } from '../services/vsdc-api.service';
import type { BranchAuthRequest } from './branchAuth.middleware';

// A recent answer is reused so a busy till doesn't call VSDC for every sale. A failure is kept for
// less time so sales resume soon after VSDC comes back.
const ONLINE_RESULT_TTL_MS = 15_000;
const OFFLINE_RESULT_TTL_MS = 5_000;

type CachedProbe = { result: VsdcProbeResult; expiresAt: number };
const recentProbes = new Map<string, CachedProbe>();
const probesInFlight = new Map<string, Promise<VsdcProbeResult>>();

export function clearVsdcProbeCache(): void {
  recentProbes.clear();
  probesInFlight.clear();
}

export interface VsdcConnectionStatus {
  /** False when there is no VSDC to talk to (EBM switched off, or no device set up). */
  configured: boolean;
  online: boolean;
  /** False when this branch's device was never registered on the VSDC, so VSDC cannot sign for it. */
  registered: boolean;
  /** Set when the check was for a specific branch. */
  branchName?: string;
  error?: string;
}

async function probeOnce(organizationId: number, branchId: number | null): Promise<VsdcProbeResult> {
  const key = `${organizationId}:${branchId ?? 'org'}`;
  const cached = recentProbes.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const running = probesInFlight.get(key);
  if (running) return running;

  const probe = (async () => {
    const result = await probeVsdc(await buildVsdcEnvelope(organizationId, branchId));
    recentProbes.set(key, {
      result,
      expiresAt: Date.now() + (result.reachable ? ONLINE_RESULT_TTL_MS : OFFLINE_RESULT_TTL_MS),
    });
    if (result.reachable) {
      await prisma.organization
        .update({ where: { id: organizationId }, data: { lastSuccessfulVdsContact: new Date() } })
        .catch((e: unknown) => console.warn('[VSDC] Could not record last contact:', e));
    }
    return result;
  })();

  probesInFlight.set(key, probe);
  try {
    return await probe;
  } finally {
    probesInFlight.delete(key);
  }
}

/** Ask the VSDC device for this branch (or the organization's main device) whether it is answering. */
export async function checkVsdcConnection(
  organizationId: number,
  branchId?: number | null,
): Promise<VsdcConnectionStatus> {
  if (!isEbmEnabled()) return { configured: false, online: false, registered: false };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      ebmDeviceId: true,
      ebmSerialNo: true,
      ebmInitializedAt: true,
      branches: {
        where: { OR: [{ ebmDeviceId: { not: null } }, { ebmSerialNo: { not: null } }, { bhfId: { not: null } }] },
        select: { id: true },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        take: 1,
      },
    },
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  // Training receipts (TS/TR) go through the VSDC like every other type
  // (CIS §6/§22), so training mode gets no exemption here.
  const fallbackBranchId = org.branches[0]?.id ?? null;
  if (!org.ebmDeviceId && !org.ebmSerialNo && fallbackBranchId == null) {
    return { configured: false, online: false, registered: false };
  }

  // "All Branches" and limited users without a single branch arrive with no usable branch id.
  const targetBranchId = branchId != null && branchId > 0 ? branchId : fallbackBranchId;
  const result = await probeOnce(organizationId, targetBranchId);

  const branch = targetBranchId == null
    ? null
    : await prisma.branch.findFirst({
        where: { id: targetBranchId, organizationId },
        select: { name: true, bhfId: true, ebmDeviceId: true, ebmInitializedAt: true },
      });
  // A branch with its own RRA branch code needs its own registered device; otherwise the
  // organization's device is the one that signs.
  const registered = branch?.bhfId
    ? Boolean(branch.ebmInitializedAt || branch.ebmDeviceId)
    : Boolean(org.ebmInitializedAt || org.ebmDeviceId);

  return {
    configured: true,
    online: result.reachable,
    registered,
    branchName: branch?.name,
    error: result.error,
  };
}

/**
 * CIS §22 / 24.7.9: no receipt may be issued while the VSDC is disconnected. Whether a connected
 * VSDC may still issue receipts (its 24-hour limit without internet) is the VSDC's own decision.
 */
export async function verifyVsdcOnlineStatus(organizationId: number, branchId?: number | null): Promise<boolean> {
  const status = await checkVsdcConnection(organizationId, branchId);
  if (!status.configured) return true;

  if (!status.online) {
    console.warn(`[VSDC] Organization ${organizationId}: refused, VSDC not reachable: ${status.error}`);
    throw Object.assign(
      new Error('Cannot connect to VSDC, so this was not saved. Check that VSDC is running and connected, then try again.'),
      { statusCode: 503 },
    );
  }

  if (!status.registered) {
    console.warn(`[VSDC] Organization ${organizationId}: refused, device not registered for ${status.branchName ?? 'organization'}`);
    throw Object.assign(
      new Error(
        `The VSDC device for ${status.branchName ?? 'this business'} is not registered yet, so this was not saved. ` +
        'Use "Initialize with RRA" for this branch, then try again.',
      ),
      { statusCode: 409 },
    );
  }

  return true;
}

/** Express middleware: refuses the request unless the VSDC answers right now. */
export function vsdcOnlineGuard(req: Request, res: Response, next: NextFunction): void {
  const orgId = parseInt(req.params.organizationId, 10);
  if (!orgId || isNaN(orgId)) {
    res.status(400).json(apiError('Missing or invalid organizationId'));
    return;
  }

  verifyVsdcOnlineStatus(orgId, (req as BranchAuthRequest).selectedBranchId)
    .then(() => next())
    .catch((err: Error & { statusCode?: number }) => {
      const status = err.statusCode || 503;
      res.status(status).json(apiError(err.message));
    });
}

/**
 * Same check for a document made from an existing sale (refund, correction, regenerated invoice).
 * It goes to the VSDC of the branch that made the sale, whichever branch is selected in the header.
 */
export function vsdcOnlineGuardForSale(saleIdParam: 'id' | 'saleId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const orgId = parseInt(req.params.organizationId, 10);
    const saleId = parseInt(req.params[saleIdParam], 10);
    if (!orgId || !saleId) {
      res.status(400).json(apiError('Missing or invalid organization or sale'));
      return;
    }

    prisma.sale
      .findFirst({ where: { id: saleId, organizationId: orgId }, select: { branchId: true } })
      .then(async (sale) => {
        // The controller gives the proper "sale not found" reply.
        if (sale) await verifyVsdcOnlineStatus(orgId, sale.branchId);
        next();
      })
      .catch((err: Error & { statusCode?: number }) => {
        res.status(err.statusCode || 503).json(apiError(err.message));
      });
  };
}
