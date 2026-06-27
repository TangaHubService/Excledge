-- Migration: EBM branch credentials, VRN, and per-branch invoice counter
-- Sprint 1 — RRA EBM Compliance

-- 1. Add per-branch EBM device credential columns to branches table
ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "bhf_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "ebm_device_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "ebm_serial_no"  TEXT;

-- Unique constraint: each bhfId must be unique within an organization
CREATE UNIQUE INDEX IF NOT EXISTS "branches_organization_id_bhf_id_key"
  ON "branches" ("organizationId", "bhf_id")
  WHERE "bhf_id" IS NOT NULL;

-- 2. Add VRN (VAT Registration Number) to organizations
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "VRN" TEXT;

-- 3. Migrate organization_invoice_counters from per-org to per-branch compound PK
--    Step A: Drop the existing table (no production EBM data exists since ENABLE_EBM=false)
DROP TABLE IF EXISTS "organization_invoice_counters";

--    Step B: Recreate with compound PK (organizationId, branchId)
CREATE TABLE "organization_invoice_counters" (
  "organizationId" INTEGER NOT NULL,
  "branchId"       INTEGER NOT NULL,
  "nextSequence"   INTEGER NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organization_invoice_counters_pkey" PRIMARY KEY ("organizationId", "branchId"),
  CONSTRAINT "organization_invoice_counters_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_invoice_counters_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
