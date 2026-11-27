import { prisma } from '../lib/prisma';

// One place for the organization's RRA/VSDC configuration: the main branch holds it (TIN, bhfId,
// device serial, MRC, VSDC URL) and every other branch works under that same configuration —
// same bhfId, same device, same invoice counters, purchases and imports booked on the main branch.

/** A branch has VSDC device credentials once RRA's device serial / id / MRC is configured on it. */
export function hasOwnVsdcDevice(b: { ebmDeviceId?: string | null; ebmSerialNo?: string | null; mrcNo?: string | null } | null | undefined): boolean {
  return Boolean(b && (b.ebmDeviceId?.trim() || b.ebmSerialNo?.trim() || b.mrcNo?.trim()));
}

/**
 * The organization's main branch, which holds the RRA/VSDC configuration: the branch marked as
 * main (isDefault), else the first active branch with device credentials, else any active branch.
 */
export async function getDefaultVsdcBranchId(organizationId: number): Promise<number | null> {
  const scope = { organizationId, status: 'ACTIVE' as const };
  const main = await prisma.branch.findFirst({ where: { ...scope, isDefault: true }, select: { id: true } });
  if (main) return main.id;
  const withDevice = await prisma.branch.findFirst({
    where: { ...scope, OR: [{ ebmDeviceId: { not: null } }, { ebmSerialNo: { not: null } }, { mrcNo: { not: null } }] },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (withDevice) return withDevice.id;
  const any = await prisma.branch.findFirst({ where: scope, orderBy: { id: 'asc' }, select: { id: true } });
  return any?.id ?? null;
}

/** Alias that reads better at call sites. */
export const getMainBranchId = getDefaultVsdcBranchId;

/**
 * Which branch's VSDC configuration serves `branchId`: always the main branch. Falls back to the
 * given branch only when the organization has no active branch at all.
 */
export async function resolveVsdcBranchId(organizationId: number, branchId?: number | null): Promise<number | null> {
  const main = await getDefaultVsdcBranchId(organizationId);
  return main ?? (branchId != null && branchId > 0 ? branchId : null);
}

/** Every branch whose VSDC traffic goes through the main branch's device: the whole organization. */
export async function vsdcBranchGroup(organizationId: number): Promise<number[]> {
  const branches = await prisma.branch.findMany({ where: { organizationId }, select: { id: true } });
  return branches.map((b) => b.id);
}
