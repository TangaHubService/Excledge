import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { isEbmEnabled } from './rra-ebm.service';
import { buildVsdcEnvelope, selectInitInfo, validateVsdcEnvelope, type RraInitInfo } from './vsdc-api.service';
import { resolveVsdcBranchId } from './vsdc-branch.service';
import logger from '../utils/logger';
import { hasMrcLength, mrcMismatch } from '../utils/mrc';
import { purchaseCounterKey } from './vsdc-purchase-counter.service';
import { applyRraVatStatus, rraVatRegisteredFromInit, type VatStatusChange } from './rra-vat-status.service';

/**
 * RRA VSDC device initialization (RRA checklist §58). Calls /initializer/selectInitInfo with (TIN,
 * bhfId, device serial).
 */

export interface VsdcInitResult {
  success: boolean;
  error?: string;
  info?: RraInitInfo;
  seededCounterTo?: number;
  /** The device MRC in effect after init (configured, else the one VSDC reported). */
  mrcNo?: string;
  /** Set when the configured MRC disagrees with the one VSDC reports. */
  mrcWarning?: string;
  /** Set when RRA's VAT status (vatTyCd) differed from ours and was applied. */
  vatStatusChange?: VatStatusChange;
}

export async function initializeVsdcDevice(
  organizationId: number,
  requestedBranchId?: number | null,
): Promise<VsdcInitResult> {
  if (!isEbmEnabled()) return { success: false, error: 'EBM is not enabled' };
  // The main branch holds the organization's one VSDC configuration; initializing from any
  // branch initializes (and records the result on) the main branch.
  const branchId = await resolveVsdcBranchId(organizationId, requestedBranchId);

  const envelope = await buildVsdcEnvelope(organizationId, branchId ?? null);
  // Initialization is exactly what clears a pending post-TIN-reset re-init.
  const envErr = validateVsdcEnvelope({ ...envelope, reinitRequired: false });
  if (envErr) return { success: false, error: envErr };

  const res = await selectInitInfo(envelope);
  if (!res.success) {
    return { success: false, error: `${res.resultCd}: ${res.resultMsg}` };
  }
  const info = res.data?.info;
  if (!info) return { success: false, error: 'RRA returned no device info' };

  // The device must belong to the same TIN we asked for (§22).
  if (info.tin && info.tin.trim() && info.tin.trim() !== envelope.tin.trim()) {
    return {
      success: false,
      error: `RRA device is registered to TIN ${info.tin}, not this organization's TIN ${envelope.tin}`,
    };
  }

  // Persist the returned identifiers + full payload.
  const reportedMrc = info.mrcNo?.trim() || undefined;
  const mrcFill = reportedMrc && !envelope.mrcNo && hasMrcLength(reportedMrc) ? reportedMrc.toUpperCase() : undefined;
  if (branchId != null) {
    await prisma.branch.update({
      where: { id: branchId },
      data: {
        ebmDeviceId: info.sdcId ?? undefined,
        mrcNo: mrcFill,
        bhfId: info.bhfId ?? undefined,
        ebmInitializedAt: new Date(),
        ebmInitInfo: info as unknown as Prisma.InputJsonValue,
      },
    });
  } else {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ebmDeviceId: info.sdcId ?? undefined,
        mrcNo: mrcFill,
        ebmInitializedAt: new Date(),
      },
    });
  }
  const mrcWarning = mrcMismatch(envelope.mrcNo, reportedMrc);
  if (mrcWarning) logger.warn(`[VSDC-INIT] org ${organizationId} branch ${branchId ?? '-'}: ${mrcWarning}`);

  // Seed the invoice counter past RRA's last known number so the next sale
  // never collides (resultCd 924).
  const lastRraInvcNo = Number(info.lastSaleInvcNo ?? info.lastInvcNo ?? 0);
  let seededCounterTo: number | undefined;
  if (lastRraInvcNo > 0) {
    const deviceKey = envelope.bhfId ? `bhf:${envelope.bhfId}` : `branch:${branchId ?? 0}`;
    const rows = await prisma.$queryRaw<Array<{ nextSequence: number }>>`
      INSERT INTO "vsdc_device_counters" ("organizationId", "deviceKey", "nextSequence", "updatedAt")
      VALUES (${organizationId}, ${deviceKey}, ${lastRraInvcNo + 1}, NOW())
      ON CONFLICT ("organizationId", "deviceKey") DO UPDATE
        SET "nextSequence" = GREATEST("vsdc_device_counters"."nextSequence", ${lastRraInvcNo + 1}),
            "updatedAt" = NOW()
      RETURNING "nextSequence"
    `;
    seededCounterTo = Number(rows[0]?.nextSequence ?? 0);
  }

  // Same for the CIS purchase sequence (TrnsPurchaseSaveReq.invcNo). The row
  // holds the last number issued, so the next purchase gets lastPchsInvcNo+1.
  const lastPchsInvcNo = Number(info.lastPchsInvcNo ?? 0);
  if (lastPchsInvcNo > 0) {
    const pchsKey = purchaseCounterKey(envelope.bhfId, branchId);
    await prisma.$executeRaw`
      INSERT INTO "vsdc_device_counters" ("organizationId", "deviceKey", "nextSequence", "updatedAt")
      VALUES (${organizationId}, ${pchsKey}, ${lastPchsInvcNo}, NOW())
      ON CONFLICT ("organizationId", "deviceKey") DO UPDATE
        SET "nextSequence" = GREATEST("vsdc_device_counters"."nextSequence", ${lastPchsInvcNo}),
            "updatedAt" = NOW()
    `;
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { lastSuccessfulVdsContact: new Date() },
  });

  // RRA is the authority on VAT registration: a stale local flag makes every sale carry tax type B,
  // which VSDC refuses for a non-VAT taxpayer (910 "VAT is not enabled").
  let vatStatusChange: VatStatusChange | undefined;
  const rraVat = rraVatRegisteredFromInit(info.vatTyCd);
  if (rraVat !== null) {
    const change = await applyRraVatStatus(organizationId, rraVat, 'device initialization');
    if (change.changed) vatStatusChange = change;
  }

  logger.info(`[VSDC-INIT] org ${organizationId} branch ${branchId ?? '-'}: sdcId=${info.sdcId} mrcNo=${info.mrcNo} lastRraInvcNo=${lastRraInvcNo} seededTo=${seededCounterTo ?? 'n/a'} lastPchsInvcNo=${lastPchsInvcNo}`);

  return { success: true, info, seededCounterTo, mrcNo: envelope.mrcNo || reportedMrc, mrcWarning: mrcWarning ?? undefined, vatStatusChange };
}
