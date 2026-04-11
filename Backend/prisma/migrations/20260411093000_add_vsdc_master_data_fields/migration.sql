-- Store official VSDC master-data fields directly instead of deriving them at submission time
ALTER TABLE "branches"
ADD COLUMN "bhf_id" TEXT;

ALTER TABLE "products"
ADD COLUMN "item_code" TEXT,
ADD COLUMN "item_class_code" TEXT,
ADD COLUMN "package_unit_code" TEXT,
ADD COLUMN "quantity_unit_code" TEXT;

ALTER TABLE "sales"
ADD COLUMN "purchase_order_code" TEXT;
