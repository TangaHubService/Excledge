-- Migration: Add NON_TAXABLE to TaxCategory enum and tax fields to purchase_order_items
-- Steps:
--   1. Add 'NON_TAXABLE' to the TaxCategory enum (if not already present)
--   2. Add 'taxCode' (RraTaxCode) column to purchase_order_items
--   3. Add 'taxRate' (Decimal) column to purchase_order_items

-- Step 1: Safely extend the TaxCategory enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NON_TAXABLE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TaxCategory')) THEN
        ALTER TYPE "TaxCategory" ADD VALUE 'NON_TAXABLE';
    END IF;
END $$;

-- Step 2: Add taxCode column (nullable, defaults to A)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'taxCode') THEN
        ALTER TABLE "purchase_order_items" ADD COLUMN "taxCode" "RraTaxCode" DEFAULT 'A';
    END IF;
END $$;

-- Step 3: Add taxRate column (nullable decimal, e.g. 18.00)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_order_items' AND column_name = 'taxRate') THEN
        ALTER TABLE "purchase_order_items" ADD COLUMN "taxRate" DECIMAL(5,2);
    END IF;
END $$;
