-- Create EbmSyncStatus enum
CREATE TYPE "EbmSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- Add ebmSyncStatus and ebmSyncedAt columns to products
ALTER TABLE "products" ADD COLUMN "ebmSyncStatus" "EbmSyncStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "products" ADD COLUMN "ebmSyncedAt" TIMESTAMPTZ;
