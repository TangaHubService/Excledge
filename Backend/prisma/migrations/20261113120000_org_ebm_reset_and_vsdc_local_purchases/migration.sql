-- Schema fields that reached schema.prisma without a migration, so `prisma migrate deploy`
-- had nothing to apply and production queries failed (P2022: organizations.ebmTinResetAt).
-- Idempotent, in case a database already received some of these via `prisma db push`.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ebmInitializedAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ebmTinResetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rra_purchases" ADD COLUMN IF NOT EXISTS "cisInvcNo" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "vsdc_local_purchases" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "receiptKey" TEXT NOT NULL,
    "spplrTin" TEXT,
    "spplrNm" TEXT,
    "spplrInvcRef" TEXT,
    "userId" INTEGER,
    "lines" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cisInvcNo" INTEGER,
    "pulledAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vsdc_local_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "vsdc_local_purchases_receiptKey_key" ON "vsdc_local_purchases"("receiptKey");
