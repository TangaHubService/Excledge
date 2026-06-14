-- Migration: Remediate EBM/VSDC architecture gaps
-- RRA tax code enum (A=standard, B=zero, C=reduced, D=exempt, E=other)
DO $$ BEGIN
  CREATE TYPE "RraTaxCode" AS ENUM ('A', 'B', 'C', 'D', 'E');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EbmOperation" AS ENUM ('SALE', 'REFUND', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EbmOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MeasurementUnit" AS ENUM ('PCS', 'KG', 'LTR', 'MTR', 'BOX', 'PAIR', 'DOZEN', 'GRAM', 'ML', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Organization: add sync-state columns
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "last_sync_cursor" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_successful_vds_contact" TIMESTAMP(3);

-- SaleItem: change taxCode from text to enum, add RRA-required fields
ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "measurementUnit" "MeasurementUnit" NOT NULL DEFAULT 'PCS',
  ADD COLUMN IF NOT EXISTS "exemptionReference" TEXT;

-- Cast existing taxCode values to the new enum (A, B, D are the only ones in use)
ALTER TABLE "sale_items"
  ALTER COLUMN "taxCode" TYPE "RraTaxCode"
  USING CASE "taxCode"
    WHEN 'A' THEN 'A'::"RraTaxCode"
    WHEN 'B' THEN 'B'::"RraTaxCode"
    WHEN 'D' THEN 'D'::"RraTaxCode"
    ELSE NULL
  END;

-- EbmTransaction: change operation from text to enum, add audit columns
ALTER TABLE "ebm_transactions"
  ADD COLUMN IF NOT EXISTS "sdcDateTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "originalEbmInvoiceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "ebm_transactions"
  ALTER COLUMN "operation" TYPE "EbmOperation"
  USING CASE "operation"
    WHEN 'SALE' THEN 'SALE'::"EbmOperation"
    WHEN 'REFUND' THEN 'REFUND'::"EbmOperation"
    WHEN 'VOID' THEN 'VOID'::"EbmOperation"
    ELSE 'SALE'::"EbmOperation"
  END;

ALTER TABLE "ebm_transactions"
  ALTER COLUMN "operation" SET DEFAULT 'SALE'::"EbmOperation";

-- Unique constraint on idempotencyKey (nullable — multiple NULLs allowed in Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS "ebm_transactions_idempotencyKey_key"
  ON "ebm_transactions"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- Index on submissionStatus for faster orphan/retry queries
CREATE INDEX IF NOT EXISTS "ebm_transactions_submissionStatus_idx"
  ON "ebm_transactions"("submissionStatus");

-- EbmOutbox table (transactional outbox for VSDC submissions)
CREATE TABLE IF NOT EXISTS "ebm_outbox" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "saleId" INTEGER NOT NULL,
  "operation" "EbmOperation" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "EbmOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sdcDateTime" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ebm_outbox_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "ebm_outbox_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ebm_outbox_idempotencyKey_key" ON "ebm_outbox"("idempotencyKey");
CREATE INDEX "ebm_outbox_organizationId_status_idx" ON "ebm_outbox"("organizationId", "status");
CREATE INDEX "ebm_outbox_status_nextAttemptAt_idx" ON "ebm_outbox"("status", "nextAttemptAt");

-- Update the existing check constraint on products (already exists from prior migration)
-- No change needed; quantity >= 0 still enforced.
