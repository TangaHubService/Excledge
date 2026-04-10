/*
  Warnings:

  - The values [PESAPAL] on the enum `PaymentMethodType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethodType_new" AS ENUM ('STRIPE', 'PAYPACK', 'PESAPA', 'CARD', 'CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'TRIAL');
ALTER TABLE "subscriptions" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "subscriptions" ALTER COLUMN "paymentMethod" TYPE "PaymentMethodType_new" USING ("paymentMethod"::text::"PaymentMethodType_new");
ALTER TABLE "payments" ALTER COLUMN "paymentMethod" TYPE "PaymentMethodType_new" USING ("paymentMethod"::text::"PaymentMethodType_new");
ALTER TYPE "PaymentMethodType" RENAME TO "PaymentMethodType_old";
ALTER TYPE "PaymentMethodType_new" RENAME TO "PaymentMethodType";
DROP TYPE "PaymentMethodType_old";
ALTER TABLE "subscriptions" ALTER COLUMN "paymentMethod" SET DEFAULT 'STRIPE';
COMMIT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "imageUrl" TEXT;
