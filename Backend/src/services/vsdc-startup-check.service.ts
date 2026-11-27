import { config } from '../config';
import { prisma } from '../lib/prisma';
import logger from '../utils/logger';
import { isEbmEnabled } from './rra-ebm.service';
import { applyRraVatStatus, rraVatRegisteredFromInit } from './rra-vat-status.service';
import { buildVsdcEnvelope, listActiveVsdcDevices, probeVsdc, validateVsdcEnvelope } from './vsdc-api.service';

export interface VsdcStartupIssue {
  label: string;
  problem: string;
}

/** The backend starts either way: these checks tell the operator what will fail, before a cashier finds out. */
export async function runVsdcStartupChecks(): Promise<VsdcStartupIssue[]> {
  if (!isEbmEnabled()) {
    logger.info('[VSDC startup] EBM is switched off, nothing to check');
    return [];
  }

  const issues: VsdcStartupIssue[] = [];

  const devices = await listActiveVsdcDevices({ includeTrainingMode: true });
  if (!config.ebm.useMock && !config.ebm.apiUrl) {
    issues.push({ label: 'Backend settings', problem: 'EBM_API_URL is not set' });
  }

  for (const device of devices) {
    try {
      const envelope = await buildVsdcEnvelope(device.organizationId, device.branchId);

      const setupProblem = validateVsdcEnvelope(envelope);
      if (setupProblem) issues.push({ label: device.label, problem: setupProblem });

      const registeredAt = device.branchId == null
        ? await prisma.organization.findUnique({
            where: { id: device.organizationId },
            select: { ebmInitializedAt: true, ebmDeviceId: true },
          })
        : await prisma.branch.findUnique({
            where: { id: device.branchId },
            select: { ebmInitializedAt: true, ebmDeviceId: true },
          });
      if (!registeredAt?.ebmInitializedAt && !registeredAt?.ebmDeviceId) {
        issues.push({ label: device.label, problem: 'device is not registered on VSDC, so its sales will be refused until it is initialized' });
      }

      // Re-apply the VAT status RRA returned at the last initialization, so a stale local flag is
      // corrected without re-initializing the device.
      if (device.branchId != null) {
        const branch = await prisma.branch.findUnique({
          where: { id: device.branchId },
          select: { ebmInitInfo: true },
        });
        const rraVat = rraVatRegisteredFromInit((branch?.ebmInitInfo as { vatTyCd?: unknown } | null)?.vatTyCd);
        if (rraVat !== null) {
          const change = await applyRraVatStatus(device.organizationId, rraVat, 'stored device initialization info');
          if (change.changed) {
            issues.push({
              label: device.label,
              problem: `VAT status corrected to match RRA (${rraVat ? 'VAT-registered' : 'not VAT-registered'}); ${change.productsConverted} item(s) changed tax type`,
            });
          }
        }
      }

      const probe = await probeVsdc(envelope);
      if (!probe.reachable) {
        issues.push({ label: device.label, problem: `VSDC is not answering (${probe.error}), so sales will be refused` });
      }
    } catch (e: unknown) {
      issues.push({ label: device.label, problem: `check failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const stuck = await prisma.ebmOutbox.groupBy({
    by: ['organizationId', 'status'],
    // A cancelled sale's leftover entry needs no action.
    where: { status: { in: ['FAILED', 'DEAD_LETTER'] }, sale: { status: { not: 'CANCELLED' } } },
    _count: { _all: true },
  });
  for (const row of stuck) {
    issues.push({
      label: `Organization ${row.organizationId}`,
      problem: `${row._count._all} document(s) not signed by VSDC (${row.status})`,
    });
  }

  if (issues.length === 0) {
    logger.info(`[VSDC startup] All checks passed for ${devices.length} device(s)`);
  } else {
    logger.warn(`[VSDC startup] ${issues.length} problem(s) found across ${devices.length} device(s):`);
    for (const issue of issues) logger.warn(`[VSDC startup] ${issue.label}: ${issue.problem}`);
  }
  return issues;
}
