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
/**
 * 6-hour VSDC heartbeat — issues a state-check handshake to the VSDC
 * gateway for every active organization. On success, updates
 * `lastSuccessfulVdsContact` to keep the 24-hour offline guard accurate
 * even during zero-sales intervals.
 */
exports.vsdcHeartbeatJob = node_cron_1.default.schedule('0 */6 * * *', async () => {
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
