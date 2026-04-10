/*
  Warnings:

  - You are about to drop the column `invoiceNumber` on the `sales` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[invoice_number]` on the table `sales` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
-- DROP INDEX "ebm_transactions_submissionStatus_idx";

-- DropIndex
-- DROP INDEX "sales_invoiceNumber_idx";

-- AlterTable
-- ALTER TABLE "sales" DROP COLUMN "invoiceNumber";

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "sales"("invoice_number");

-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;
