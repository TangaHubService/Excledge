import cron from "node-cron";
import { isEbmEnabled, processEbmQueueBatch } from "../services/rra-ebm.service";

/**
 * Retries pending EBM/VSDC submissions every 2 minutes when EBM is enabled.
 */
export const ebmQueueJob = cron.schedule("*/2 * * * *", async () => {
  if (!isEbmEnabled()) {
    return;
  }
  try {
    const { processed, succeeded, failed } = await processEbmQueueBatch(40);
    if (processed > 0) {
      console.log(`[EBM queue] processed=${processed} succeeded=${succeeded} failed=${failed}`);
    }
  } catch (e) {
    console.error("[EBM queue] job error:", e);
  }
});
