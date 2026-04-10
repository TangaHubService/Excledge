/*
  Warnings:

  - Made the column `isProforma` on table `sales` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reprintCount` on table `sales` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex (IF EXISTS: index is created in add_ebm_and_constraints which runs later)
DROP INDEX IF EXISTS "ebm_transactions_submissionStatus_idx";

-- AlterTable
ALTER TABLE "inventory_ledger" ADD COLUMN     "batchId" INTEGER;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "batchId" INTEGER;

-- AlterTable: Add columns if they don't exist, then make them NOT NULL
DO $$ 
BEGIN
  -- Add isProforma column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'isProforma') THEN
    ALTER TABLE "sales" ADD COLUMN "isProforma" BOOLEAN DEFAULT false;
  END IF;
  
  -- Add reprintCount column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'reprintCount') THEN
    ALTER TABLE "sales" ADD COLUMN "reprintCount" INTEGER DEFAULT 0;
  END IF;
  
  -- Update any NULL values to defaults before making NOT NULL
  UPDATE "sales" SET "isProforma" = false WHERE "isProforma" IS NULL;
  UPDATE "sales" SET "reprintCount" = 0 WHERE "reprintCount" IS NULL;
  
  -- Now make them NOT NULL
  ALTER TABLE "sales" ALTER COLUMN "isProforma" SET NOT NULL;
  ALTER TABLE "sales" ALTER COLUMN "reprintCount" SET NOT NULL;
END $$;

-- CreateTable
CREATE TABLE "batches" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_price_history" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" INTEGER NOT NULL,

    CONSTRAINT "cost_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batches_productId_isActive_idx" ON "batches"("productId", "isActive");

-- CreateIndex
CREATE INDEX "batches_organizationId_idx" ON "batches"("organizationId");

-- CreateIndex
CREATE INDEX "batches_expiryDate_idx" ON "batches"("expiryDate");

-- CreateIndex
CREATE INDEX "batches_receivedAt_idx" ON "batches"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "batches_productId_batchNumber_warehouseId_key" ON "batches"("productId", "batchNumber", "warehouseId");

-- CreateIndex
CREATE INDEX "cost_price_history_batchId_recordedAt_idx" ON "cost_price_history"("batchId", "recordedAt");

-- CreateIndex
CREATE INDEX "cost_price_history_recordedAt_idx" ON "cost_price_history"("recordedAt");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_price_history" ADD CONSTRAINT "cost_price_history_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_price_history" ADD CONSTRAINT "cost_price_history_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
