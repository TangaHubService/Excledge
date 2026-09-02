import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { isEbmEnabled } from '../services/rra-ebm.service';
import { buildVsdcEnvelope, saveZReport, listActiveVsdcDevices } from '../services/vsdc-api.service';

const pad2 = (n: number) => String(n).padStart(2, '0');
/** `yyyyMMddHHmmss` — the report-generation timestamp `saveZReports` expects. */
function toRptDeTimestamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/**
 * Automated daily Z (closing) report — RRA CIS/VSDC spec §6/§18/§19 requires
 * the device's daily counters to be legally closed out once per business day.
 * Filed per VSDC device (per branch, with the org-level fallback for legacy
 * single-branch tenants). Training-mode orgs are skipped — there is no real
 * day to close. Runs late at night so it lands after trading has finished; a
 * per-org configurable closing hour is a future enhancement.
 */
export const zReportJob = cron.schedule('55 23 * * *', async () => {
  if (!isEbmEnabled()) {
    return;
  }

  try {
    const devices = await listActiveVsdcDevices();
    const rptDe = toRptDeTimestamp(new Date());
    let succeeded = 0;
    let failed = 0;

    for (const dev of devices) {
      try {
        const envelope = await buildVsdcEnvelope(dev.organizationId, dev.branchId);
        const result = await saveZReport(envelope, rptDe);
        if (result.success) {
          succeeded += 1;
          await prisma.organization.update({
            where: { id: dev.organizationId },
            data: { lastSuccessfulVdsContact: new Date() },
          });
        } else {
          failed += 1;
          console.warn(`[Z-report] ${dev.label} (${dev.tin}): ${result.error}`);
        }
      } catch (e) {
        failed += 1;
        console.warn(`[Z-report] ${dev.label} error:`, e);
      }
    }

    if (succeeded > 0 || failed > 0) {
      console.log(`[Z-report] daily close: devices=${devices.length} succeeded=${succeeded} failed=${failed}`);
    }
  } catch (e) {
    console.error('[Z-report] job error:', e);
  }
});
