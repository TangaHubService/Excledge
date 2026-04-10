/*
  Warnings:

  - You are about to drop the column `invoiceNumber` on the `sales` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[productId,batchNumber,branchId]` on the table `batches` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `branchId` to the `batches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `inventory_ledger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `sales` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `stock_movements` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LogModule" AS ENUM ('SALES', 'INVENTORY', 'CUSTOMERS', 'USERS', 'PURCHASE_ORDERS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('SUCCESS', 'FAILED', 'REVERTED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARIES_WAGES', 'RENT', 'UTILITIES', 'TRANSPORT_FUEL', 'MAINTENANCE_REPAIRS', 'TAXES', 'INSURANCE', 'MARKETING', 'OFFICE_SUPPLIES', 'PROFESSIONAL_FEES', 'OTHER');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'USER_LOGIN_FAILED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_PASSWORD_RESET';
ALTER TYPE "ActivityType" ADD VALUE 'USER_ACCOUNT_DISABLED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_ACCOUNT_ENABLED';
ALTER TYPE "ActivityType" ADD VALUE 'PRODUCT_ARCHIVED';
ALTER TYPE "ActivityType" ADD VALUE 'STOCK_ADJUSTMENT_APPROVED';
ALTER TYPE "ActivityType" ADD VALUE 'STOCK_ADJUSTMENT_REJECTED';
ALTER TYPE "ActivityType" ADD VALUE 'LOW_STOCK_ALERT';
ALTER TYPE "ActivityType" ADD VALUE 'STOCK_INCREASED';
ALTER TYPE "ActivityType" ADD VALUE 'STOCK_DECREASED';
ALTER TYPE "ActivityType" ADD VALUE 'SALE_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'SALE_REFUNDED';
ALTER TYPE "ActivityType" ADD VALUE 'SALE_CANCELLED';
ALTER TYPE "ActivityType" ADD VALUE 'DISCOUNT_APPLIED';
ALTER TYPE "ActivityType" ADD VALUE 'PAYMENT_RECEIVED';
ALTER TYPE "ActivityType" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "ActivityType" ADD VALUE 'CUSTOMER_ARCHIVED';
ALTER TYPE "ActivityType" ADD VALUE 'CUSTOMER_REACTIVATED';
ALTER TYPE "ActivityType" ADD VALUE 'PURCHASE_ORDER_APPROVED';
ALTER TYPE "ActivityType" ADD VALUE 'PURCHASE_ORDER_REJECTED';
ALTER TYPE "ActivityType" ADD VALUE 'PURCHASE_ORDER_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'PURCHASE_ORDER_CANCELLED';
ALTER TYPE "ActivityType" ADD VALUE 'TAX_CONFIG_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE 'BRANCH_CREATE';
ALTER TYPE "ActivityType" ADD VALUE 'BRANCH_UPDATE';
ALTER TYPE "ActivityType" ADD VALUE 'BACKUP_RESTORE';
ALTER TYPE "ActivityType" ADD VALUE 'WAREHOUSE_CREATE';
ALTER TYPE "ActivityType" ADD VALUE 'WAREHOUSE_UPDATE';
ALTER TYPE "ActivityType" ADD VALUE 'WAREHOUSE_DELETE';
ALTER TYPE "ActivityType" ADD VALUE 'EXPENSE_CREATE';
ALTER TYPE "ActivityType" ADD VALUE 'EXPENSE_UPDATE';
ALTER TYPE "ActivityType" ADD VALUE 'EXPENSE_DELETE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'BRANCH_MANAGER';

-- DropForeignKey
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_userId_fkey";

-- DropIndex
DROP INDEX "activity_logs_organizationId_idx";

-- DropIndex
DROP INDEX "activity_logs_userId_idx";

-- DropIndex
DROP INDEX "batches_productId_batchNumber_warehouseId_key";

-- DropIndex
-- DROP INDEX "ebm_transactions_submissionStatus_idx";

-- DropIndex
DROP INDEX "inventory_ledger_organizationId_productId_warehouseId_creat_idx";

-- DropIndex
-- DROP INDEX "sales_invoiceNumber_idx";

-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "branchId" INTEGER,
ADD COLUMN     "module" "LogModule" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "status" "LogStatus" NOT NULL DEFAULT 'SUCCESS',
ALTER COLUMN "organizationId" DROP NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "branchId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "inventory_ledger" ADD COLUMN     "branchId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "sales"
ADD COLUMN     "branchId" INTEGER NOT NULL,
ADD COLUMN     "invoice_number" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "branchId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branches" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" SERIAL NOT NULL,
    "purchaseOrderId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_balances" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "balanceDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "recordedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_organizationId_idx" ON "branches"("organizationId");

-- CreateIndex
CREATE INDEX "branches_status_idx" ON "branches"("status");

-- CreateIndex
CREATE INDEX "branches_organizationId_status_idx" ON "branches"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organizationId_code_key" ON "branches"("organizationId", "code");

-- CreateIndex
CREATE INDEX "user_branches_userId_idx" ON "user_branches"("userId");

-- CreateIndex
CREATE INDEX "user_branches_branchId_idx" ON "user_branches"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "user_branches_userId_branchId_key" ON "user_branches"("userId", "branchId");

-- CreateIndex
CREATE INDEX "expenses_organizationId_expenseDate_idx" ON "expenses"("organizationId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "expenses_paymentMethod_idx" ON "expenses"("paymentMethod");

-- CreateIndex
CREATE INDEX "expenses_branchId_idx" ON "expenses"("branchId");

-- CreateIndex
CREATE INDEX "expenses_branchId_expenseDate_idx" ON "expenses"("branchId", "expenseDate");

-- CreateIndex
CREATE INDEX "supplier_payments_purchaseOrderId_idx" ON "supplier_payments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "supplier_payments_organizationId_paymentDate_idx" ON "supplier_payments"("organizationId", "paymentDate");

-- CreateIndex
CREATE INDEX "supplier_payments_paymentMethod_idx" ON "supplier_payments"("paymentMethod");

-- CreateIndex
CREATE INDEX "cash_balances_organizationId_balanceDate_idx" ON "cash_balances"("organizationId", "balanceDate");

-- CreateIndex
CREATE INDEX "cash_balances_branchId_idx" ON "cash_balances"("branchId");

-- CreateIndex
CREATE INDEX "cash_balances_branchId_balanceDate_idx" ON "cash_balances"("branchId", "balanceDate");

-- CreateIndex
CREATE INDEX "activity_logs_organizationId_module_createdAt_idx" ON "activity_logs"("organizationId", "module", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_branchId_idx" ON "activity_logs"("branchId");

-- CreateIndex
CREATE INDEX "batches_branchId_idx" ON "batches"("branchId");

-- CreateIndex
CREATE INDEX "batches_branchId_productId_idx" ON "batches"("branchId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "batches_productId_batchNumber_branchId_key" ON "batches"("productId", "batchNumber", "branchId");

-- CreateIndex
CREATE INDEX "inventory_ledger_organizationId_productId_branchId_createdA_idx" ON "inventory_ledger"("organizationId", "productId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_branchId_idx" ON "inventory_ledger"("branchId");

-- CreateIndex
CREATE INDEX "inventory_ledger_branchId_productId_idx" ON "inventory_ledger"("branchId", "productId");

-- CreateIndex
CREATE INDEX "sales_invoice_number_idx" ON "sales"("invoice_number");

-- CreateIndex
CREATE INDEX "sales_branchId_idx" ON "sales"("branchId");

-- CreateIndex
CREATE INDEX "sales_branchId_createdAt_idx" ON "sales"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_branchId_status_idx" ON "sales"("branchId", "status");

-- CreateIndex
CREATE INDEX "stock_movements_branchId_idx" ON "stock_movements"("branchId");

-- CreateIndex
CREATE INDEX "stock_movements_branchId_productId_idx" ON "stock_movements"("branchId", "productId");

-- CreateIndex
CREATE INDEX "stock_movements_branchId_createdAt_idx" ON "stock_movements"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
