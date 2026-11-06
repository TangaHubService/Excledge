-- Saved discount on an item, applied automatically at the POS. 0 means no discount.
ALTER TABLE "products" ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
