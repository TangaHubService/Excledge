import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { isEbmEnabled } from '../services/rra-ebm.service';
import { buildVsdcEnvelope, vsdcHeartbeat } from '../services/vsdc-api.service';

/**
 * 6-hour VSDC heartbeat — issues a state-check handshake to the VSDC
 * gateway for every active organization. On success, updates
 * `lastSuccessfulVdsContact` to keep the 24-hour offline guard accurate
 * even during zero-sales intervals.
 */
export const vsdcHeartbeatJob = cron.schedule('0 */6 * * *', async () => {
  if (!isEbmEnabled()) {
    return;
  }

  try {
    const organizations = await prisma.organization.findMany({
      where: {
        isActive: true,
        trainingMode: false,
        TIN: { not: null },
        ebmDeviceId: { not: null },
      },
      select: { id: true, TIN: true, ebmDeviceId: true, ebmSerialNo: true, name: true },
    });

    let successCount = 0;
    let failCount = 0;

    for (const org of organizations) {
      try {
        const envelope = await buildVsdcEnvelope(org.id);
        const result = await vsdcHeartbeat(envelope);

        if (result.success) {
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              lastSuccessfulVdsContact: new Date(),
              lastSyncCursor: new Date(),
            },
          });
          successCount += 1;
        } else {
          failCount += 1;
          console.warn(`[VSDC heartbeat] Org ${org.id} (${org.TIN}): ${result.error}`);
        }
      } catch (e) {
        failCount += 1;
        console.warn(`[VSDC heartbeat] Org ${org.id} error:`, e);
      }
    }

    if (successCount > 0 || failCount > 0) {
      console.log(`[VSDC heartbeat] succeeded=${successCount} failed=${failCount}`);
    }
  } catch (e) {
    console.error('[VSDC heartbeat] job error:', e);
  }
});
