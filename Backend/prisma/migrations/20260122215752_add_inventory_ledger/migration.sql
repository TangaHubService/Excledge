-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'RETURN_CUSTOMER', 'TRANSFER_IN', 'INITIAL_STOCK', 'ADJUSTMENT_IN', 'SALE', 'DAMAGE', 'EXPIRED', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'ADJUSTMENT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "InventoryDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "organizationId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_ledger" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "userId" INTEGER NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "direction" "InventoryDirection" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "runningBalance" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2),
    "totalCost" DECIMAL(10,2),
    "reference" TEXT,
    "referenceType" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_organizationId_idx" ON "warehouses"("organizationId");

-- CreateIndex
CREATE INDEX "warehouses_isActive_idx" ON "warehouses"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organizationId_code_key" ON "warehouses"("organizationId", "code");

-- CreateIndex
CREATE INDEX "inventory_ledger_organizationId_productId_createdAt_idx" ON "inventory_ledger"("organizationId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_organizationId_productId_warehouseId_creat_idx" ON "inventory_ledger"("organizationId", "productId", "warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_organizationId_movementType_createdAt_idx" ON "inventory_ledger"("organizationId", "movementType", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_productId_createdAt_idx" ON "inventory_ledger"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_reference_referenceType_idx" ON "inventory_ledger"("reference", "referenceType");

-- CreateIndex
CREATE INDEX "inventory_ledger_createdAt_idx" ON "inventory_ledger"("createdAt");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
