-- Migration: Add EBM models, invoice fields, and constraints
-- This migration adds basic EBM structure and data integrity constraints

-- Add invoice fields to Sale table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'invoiceNumber') THEN
    ALTER TABLE "sales" ADD COLUMN "invoiceNumber" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'isProforma') THEN
    ALTER TABLE "sales" ADD COLUMN "isProforma" BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'reprintCount') THEN
    ALTER TABLE "sales" ADD COLUMN "reprintCount" INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add DRAFT and PENDING to SaleStatus enum
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- Create EbmSubmissionStatus enum
DO $$ BEGIN
  CREATE TYPE "EbmSubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'RETRYING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create EBM Transaction table
CREATE TABLE IF NOT EXISTS "ebm_transactions" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "saleId" INTEGER,
  "invoiceNumber" TEXT,
  "ebmInvoiceNumber" TEXT,
  "submissionStatus" "EbmSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMP(3),
  "responseData" JSONB,
  "errorMessage" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ebm_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ebm_transactions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create EBM Queue table
CREATE TABLE IF NOT EXISTS "ebm_queue" (
  "id" SERIAL PRIMARY KEY,
  "organizationId" INTEGER NOT NULL,
  "saleId" INTEGER,
  "invoiceNumber" TEXT,
  "payload" JSONB NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ebm_queue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ebm_queue_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for EBM tables
CREATE INDEX IF NOT EXISTS "ebm_transactions_organizationId_idx" ON "ebm_transactions"("organizationId");
CREATE INDEX IF NOT EXISTS "ebm_transactions_saleId_idx" ON "ebm_transactions"("saleId");
CREATE INDEX IF NOT EXISTS "ebm_transactions_submissionStatus_idx" ON "ebm_transactions"("submissionStatus");
CREATE INDEX IF NOT EXISTS "ebm_transactions_createdAt_idx" ON "ebm_transactions"("createdAt");

CREATE INDEX IF NOT EXISTS "ebm_queue_organizationId_idx" ON "ebm_queue"("organizationId");
CREATE INDEX IF NOT EXISTS "ebm_queue_nextRetryAt_idx" ON "ebm_queue"("nextRetryAt");
CREATE INDEX IF NOT EXISTS "ebm_queue_priority_idx" ON "ebm_queue"("priority");

-- Create indexes for Sale table
CREATE INDEX IF NOT EXISTS "sales_organizationId_status_createdAt_idx" ON "sales"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "sales_invoiceNumber_idx" ON "sales"("invoiceNumber");

-- Add check constraints for data integrity
-- Note: Prisma doesn't support CHECK constraints directly, so these are added via raw SQL

-- Ensure product quantity is non-negative (will be enforced at application level, but adding DB constraint for safety)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_quantity_non_negative'
  ) THEN
    ALTER TABLE "products" 
      ADD CONSTRAINT "products_quantity_non_negative" 
      CHECK ("quantity" >= 0);
  END IF;
END $$;

-- Ensure sale amounts are valid (will be enforced at application level)
-- Note: These constraints are complex and may need to be handled in application logic
-- ALTER TABLE "sales" 
--   ADD CONSTRAINT "sales_amounts_valid" 
--   CHECK (
--     ("cashAmount" + "insuranceAmount" + "debtAmount") >= 0 AND
--     "totalAmount" >= 0
--   );

-- Add comment for future reference
COMMENT ON TABLE "ebm_transactions" IS 'Stores RRA EBM invoice submission transactions. Basic structure for future enhancement.';
COMMENT ON TABLE "ebm_queue" IS 'Queue for offline EBM submissions and retries. Basic structure for future enhancement.';
COMMENT ON COLUMN "sales"."invoiceNumber" IS 'RRA-compliant invoice number format: INV-{ORG_CODE}-{YEAR}-{SEQUENCE}';
COMMENT ON COLUMN "sales"."isProforma" IS 'Flag to indicate if this is a proforma invoice';
COMMENT ON COLUMN "sales"."reprintCount" IS 'Number of times this invoice has been reprinted';
