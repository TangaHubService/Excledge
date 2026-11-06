import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { isEbmEnabled } from '../services/rra-ebm.service';
import { buildVsdcEnvelope, vsdcHeartbeat, listActiveVsdcDevices } from '../services/vsdc-api.service';

// Keeps "last VSDC contact" fresh while no sales are happening. Sales check the VSDC live, so this
// job does not decide whether a sale is allowed.
const HEARTBEAT_MINUTES = 30;

/**
 * VSDC heartbeat — issues a state-check handshake to every configured VSDC device (per branch, with
 * an org-level fallback for legacy single-branch tenants — see listActiveVsdcDevices).
 */
export const vsdcHeartbeatJob = cron.schedule(`*/${HEARTBEAT_MINUTES} * * * *`, async () => {
  if (!isEbmEnabled()) {
    return;
  }

  try {
    const devices = await listActiveVsdcDevices({ includeTrainingMode: true });
    const refreshed = new Set<number>();
    let successCount = 0;
    let failCount = 0;

    for (const dev of devices) {
      try {
        const envelope = await buildVsdcEnvelope(dev.organizationId, dev.branchId);
        const result = await vsdcHeartbeat(envelope);

        if (result.success) {
          successCount += 1;
          if (!refreshed.has(dev.organizationId)) {
            refreshed.add(dev.organizationId);
            await prisma.organization.update({
              where: { id: dev.organizationId },
              data: { lastSuccessfulVdsContact: new Date(), lastSyncCursor: new Date() },
            });
          }
        } else {
          failCount += 1;
          console.warn(`[VSDC heartbeat] ${dev.label} (${dev.tin}): ${result.error}`);
        }
      } catch (e) {
        failCount += 1;
        console.warn(`[VSDC heartbeat] ${dev.label} error:`, e);
      }
    }

    if (successCount > 0 || failCount > 0) {
      console.log(`[VSDC heartbeat] devices=${devices.length} succeeded=${successCount} failed=${failCount} orgs-refreshed=${refreshed.size}`);
    }
  } catch (e) {
    console.error('[VSDC heartbeat] job error:', e);
  }
});
