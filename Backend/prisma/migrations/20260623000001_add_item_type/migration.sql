-- Create ItemType enum
CREATE TYPE "ItemType" AS ENUM ('PRODUCT', 'SERVICE');

-- AlterTable: add itemType to products, default quantity to 0
ALTER TABLE "products" ADD COLUMN "itemType" "ItemType" NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "products" ALTER COLUMN "quantity" SET DEFAULT 0;

-- CreateIndex for filtering by item type
CREATE INDEX "products_organization_id_item_type_idx" ON "products"("organizationId", "itemType");

-- AlterTable: add itemType, serviceName, serviceDescription to sale_items
ALTER TABLE "sale_items" ADD COLUMN "itemType" "ItemType" NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "sale_items" ADD COLUMN "serviceName" TEXT;
ALTER TABLE "sale_items" ADD COLUMN "serviceDescription" TEXT;

-- Drop FK constraint on productId before making it nullable
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_productId_fkey";
ALTER TABLE "sale_items" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"(id) ON DELETE SET NULL ON UPDATE CASCADE;
