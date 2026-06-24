-- Idempotent migration: create EbmSyncStatus type and columns only if missing
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EbmSyncStatus') THEN
        CREATE TYPE "EbmSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'ebmSyncStatus') THEN
        ALTER TABLE "products" ADD COLUMN "ebmSyncStatus" "EbmSyncStatus" NOT NULL DEFAULT 'PENDING';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'ebmSyncedAt') THEN
        ALTER TABLE "products" ADD COLUMN "ebmSyncedAt" TIMESTAMPTZ;
    END IF;
END $$;
