-- RRA EBM Certification Fixes
-- Audit findings B1-B6

-- CreateEnum: RcptLabel (CIS/VSDC spec §3.2)
CREATE TYPE "RcptLabel" AS ENUM ('NS', 'NR', 'CS', 'CR', 'TS', 'TR', 'PS');

-- B1: Dedicated SDC response columns on ebm_transactions
ALTER TABLE "ebm_transactions"
  ADD COLUMN IF NOT EXISTS "sdcRcptNo"          INTEGER,
  ADD COLUMN IF NOT EXISTS "internalData"        TEXT,
  ADD COLUMN IF NOT EXISTS "receiptSignature"    TEXT,
  ADD COLUMN IF NOT EXISTS "qrPayload"           TEXT,
  ADD COLUMN IF NOT EXISTS "rcptLabel"           "RcptLabel",
  ADD COLUMN IF NOT EXISTS "ejSent"              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "journalText"         TEXT;

-- B2: RRA item classification fields on products
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "itemClsCd"   TEXT,
  ADD COLUMN IF NOT EXISTS "itemCd"      TEXT,
  ADD COLUMN IF NOT EXISTS "pkgUnitCd"   TEXT,
  ADD COLUMN IF NOT EXISTS "qtyUnitCd"   TEXT;

-- B3: Per-branch VSDC URL and address line on branches
ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "vsdcUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;

-- B4: Receipt label on sales
ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "rcptLabel"    "RcptLabel";

-- B5: Discount rate and amount on sale_items
ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "dcRate"       DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dcAmt"        DECIMAL(10,2) NOT NULL DEFAULT 0;

-- B6: Per-branch per-receipt-type atomic sequence counter
CREATE TABLE IF NOT EXISTS "branch_receipt_counters" (
  "branchId"   INTEGER          NOT NULL,
  "rcptLabel"  "RcptLabel"      NOT NULL,
  "nextSeq"    INTEGER          NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branch_receipt_counters_pkey" PRIMARY KEY ("branchId", "rcptLabel"),
  CONSTRAINT "branch_receipt_counters_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
