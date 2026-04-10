-- Per-organization invoice sequence for EBM/VSDC
CREATE TABLE "organization_invoice_counters" (
    "organizationId" INTEGER NOT NULL,
    "nextSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_invoice_counters_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "organization_invoice_counters" ADD CONSTRAINT "organization_invoice_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Track EBM operation type (SALE, REFUND, VOID)
ALTER TABLE "ebm_transactions" ADD COLUMN "operation" TEXT DEFAULT 'SALE';
