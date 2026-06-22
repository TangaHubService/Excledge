-- Add trainingMode to organizations
ALTER TABLE "organizations" ADD COLUMN "trainingMode" BOOLEAN NOT NULL DEFAULT false;

-- Add ebmSyncStatus and ebmSyncedAt to products
ALTER TABLE "products" ADD COLUMN "ebmSyncStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "products" ADD COLUMN "ebmSyncedAt" TIMESTAMP(3);

-- Create index on ebmSyncStatus for sync workers
CREATE INDEX "products_ebm_sync_status_idx" ON "products"("ebmSyncStatus");
