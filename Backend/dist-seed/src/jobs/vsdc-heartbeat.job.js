"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vsdcHeartbeatJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = require("../lib/prisma");
const rra_ebm_service_1 = require("../services/rra-ebm.service");
const vsdc_api_service_1 = require("../services/vsdc-api.service");
// Must run well inside the offline-block window (default 2h, see
// vsdc-offline-guard.middleware.ts) or a real overnight sales lull trips the
// guard even though the VSDC is actually still reachable. Runs 3x per window
// so one failed/skipped run doesn't let the guard go stale, clamped to a
// sane range regardless of how VSDC_OFFLINE_BLOCK_MS is configured.
const VSDC_OFFLINE_BLOCK_MS = Number(process.env.VSDC_OFFLINE_BLOCK_MS ?? 2 * 60 * 60 * 1000);
const HEARTBEAT_MINUTES = Math.max(5, Math.min(360, Math.floor(VSDC_OFFLINE_BLOCK_MS / 3 / 60000)));
/**
 * VSDC heartbeat — issues a state-check handshake to the VSDC gateway for
 * every active organization. On success, updates `lastSuccessfulVdsContact`
 * to keep the offline guard accurate even during zero-sales intervals.
 */
exports.vsdcHeartbeatJob = node_cron_1.default.schedule(`*/${HEARTBEAT_MINUTES} * * * *`, async () => {
    if (!(0, rra_ebm_service_1.isEbmEnabled)()) {
        return;
    }
    try {
        const organizations = await prisma_1.prisma.organization.findMany({
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
                const envelope = await (0, vsdc_api_service_1.buildVsdcEnvelope)(org.id);
                const result = await (0, vsdc_api_service_1.vsdcHeartbeat)(envelope);
                if (result.success) {
                    await prisma_1.prisma.organization.update({
                        where: { id: org.id },
                        data: {
                            lastSuccessfulVdsContact: new Date(),
                            lastSyncCursor: new Date(),
                        },
                    });
                    successCount += 1;
                }
                else {
                    failCount += 1;
                    console.warn(`[VSDC heartbeat] Org ${org.id} (${org.TIN}): ${result.error}`);
                }
            }
            catch (e) {
                failCount += 1;
                console.warn(`[VSDC heartbeat] Org ${org.id} error:`, e);
            }
        }
        if (successCount > 0 || failCount > 0) {
            console.log(`[VSDC heartbeat] succeeded=${successCount} failed=${failCount}`);
        }
    }
    catch (e) {
        console.error('[VSDC heartbeat] job error:', e);
    }
});
