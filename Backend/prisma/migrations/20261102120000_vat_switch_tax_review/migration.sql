-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "taxCodeReviewPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "taxCodeReviewedAt" TIMESTAMP(3);
