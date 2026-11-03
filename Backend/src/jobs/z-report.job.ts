import cron from 'node-cron';
import { isEbmEnabled } from '../services/rra-ebm.service';
import { buildVsdcEnvelope, saveAndVerifyZReport, listActiveVsdcDevices } from '../services/vsdc-api.service';
import { recordZReportOutcome } from '../services/z-report-record.service';

/**
 * Automated daily Z (closing) report — RRA CIS/VSDC spec §6/§18/§19 requires the device's daily
 * counters to be legally closed out once per business day.
 */
export const zReportJob = cron.schedule('55 23 * * *', async () => {
  if (!isEbmEnabled()) {
    return;
  }

  try {
    const devices = await listActiveVsdcDevices();
    let verified = 0;
    let savedUnverified = 0;
    let failed = 0;

    for (const dev of devices) {
      try {
        const envelope = await buildVsdcEnvelope(dev.organizationId, dev.branchId);
        const z = await saveAndVerifyZReport(envelope);

        const state = await recordZReportOutcome(dev.organizationId, dev.branchId, dev.label, z);
        if (z.verified) verified += 1;
        else if (z.saved) savedUnverified += 1;
        else failed += 1;

        if (!z.verified) {
          console.warn(`[Z-report] ${dev.label}: ${state} — save:${z.saveError ?? 'ok'} check:${z.verifyError ?? 'ok'}`);
        }
      } catch (e) {
        failed += 1;
        console.warn(`[Z-report] ${dev.label} error:`, e);
      }
    }

    if (devices.length) {
      console.log(
        `[Z-report] daily close: devices=${devices.length} verified=${verified} savedUnverified=${savedUnverified} failed=${failed}`,
      );
    }
  } catch (e) {
    console.error('[Z-report] job error:', e);
  }
});
