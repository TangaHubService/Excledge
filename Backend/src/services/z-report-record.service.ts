import { prisma } from '../lib/prisma';
import type { ZReportOutcome } from './vsdc-api.service';

export type ZReportState = 'VERIFIED' | 'SAVED_UNVERIFIED' | 'FAILED';

/** One rra_sync_cursor row per VSDC device holds the last Z-close outcome. */
export function zReportResource(branchId: number | null | undefined): string {
  return branchId != null ? `zReport:${branchId}` : 'zReport';
}

/**
 * Persist a Z-close outcome (nightly job or manual send) so the daily report knows the day was
 * closed and the skipped-report rule can find the previous close.
 */
export async function recordZReportOutcome(
  organizationId: number,
  branchId: number | null | undefined,
  label: string,
  z: ZReportOutcome,
): Promise<ZReportState> {
  const state: ZReportState = z.verified ? 'VERIFIED' : z.saved ? 'SAVED_UNVERIFIED' : 'FAILED';
  const detail = [
    state,
    label,
    `(${z.rptDeDate})`,
    z.saveError ? `save:${z.saveError}` : '',
    z.verifyError ? `check:${z.verifyError}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 480);

  const resource = zReportResource(branchId);
  await prisma.rraSyncCursor.upsert({
    where: { organizationId_resource: { organizationId, resource } },
    create: { organizationId, resource, lastReqDt: z.rptDeTimestamp, lastRunAt: new Date(), lastResult: detail },
    update: { lastReqDt: z.rptDeTimestamp, lastRunAt: new Date(), lastResult: detail },
  });

  if (z.saved) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { lastSuccessfulVdsContact: new Date() },
    });
  }
  return state;
}
