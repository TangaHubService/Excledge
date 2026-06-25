-- Add branchId to purchase_orders table
ALTER TABLE "purchase_orders" ADD COLUMN "branchId" INTEGER NOT NULL DEFAULT 1;

-- Add foreign key constraint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT;

-- Add index for branch-based lookups
CREATE INDEX IF NOT EXISTS "purchase_orders_branchId_idx" ON "purchase_orders"("branchId");

-- ────────────────────────────────────────────────────────────────────────────
-- PostgreSQL Row-Level Security (RLS) Policies
-- Provides database-level branch data isolation as defense-in-depth.
-- ────────────────────────────────────────────────────────────────────────────

-- Helper function to get the current branch ID from a custom session variable.
-- The application sets `app.current_branch_id` at the start of each request.
CREATE OR REPLACE FUNCTION app.current_branch_id()
RETURNS INTEGER
LANGUAGE SQL STABLE
AS $$
  SELECT nullif(current_setting('app.current_branch_id', true), '')::INTEGER;
$$;

-- Helper: allow access when no branch is selected (admin mode) or when branch matches.
CREATE OR REPLACE FUNCTION app.branch_check(record_branch_id INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT app.current_branch_id() IS NULL OR app.current_branch_id() = record_branch_id;
$$;

-- ── Enable RLS on all branch-aware tables ──────────────────────────────────

ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: SELECT ───────────────────────────────────────────────────

CREATE POLICY branch_select_sales ON "sales" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_batches ON "batches" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_stock_movements ON "stock_movements" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_expenses ON "expenses" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_cash_balances ON "cash_balances" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_inventory_ledger ON "inventory_ledger" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_activity_logs ON "activity_logs" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_purchase_orders ON "purchase_orders" FOR SELECT
  USING (app.branch_check("branchId"));

CREATE POLICY branch_select_stock_transfers ON "stock_transfers"
  FOR SELECT
  USING (app.branch_check("fromBranchId") AND app.branch_check("toBranchId"));

-- ── RLS Policies: INSERT ───────────────────────────────────────────────────

CREATE POLICY branch_insert_sales ON "sales" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_batches ON "batches" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_stock_movements ON "stock_movements" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_expenses ON "expenses" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_cash_balances ON "cash_balances" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_inventory_ledger ON "inventory_ledger" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_activity_logs ON "activity_logs" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_insert_purchase_orders ON "purchase_orders" FOR INSERT
  WITH CHECK (app.branch_check("branchId"));

-- ── RLS Policies: UPDATE ───────────────────────────────────────────────────

CREATE POLICY branch_update_sales ON "sales" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_batches ON "batches" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_stock_movements ON "stock_movements" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_expenses ON "expenses" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_cash_balances ON "cash_balances" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_inventory_ledger ON "inventory_ledger" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_activity_logs ON "activity_logs" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

CREATE POLICY branch_update_purchase_orders ON "purchase_orders" FOR UPDATE
  USING (app.branch_check("branchId"))
  WITH CHECK (app.branch_check("branchId"));

-- ── RLS Policies: DELETE ───────────────────────────────────────────────────

CREATE POLICY branch_delete_sales ON "sales" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_batches ON "batches" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_stock_movements ON "stock_movements" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_expenses ON "expenses" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_cash_balances ON "cash_balances" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_inventory_ledger ON "inventory_ledger" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_activity_logs ON "activity_logs" FOR DELETE
  USING (app.branch_check("branchId"));

CREATE POLICY branch_delete_purchase_orders ON "purchase_orders" FOR DELETE
  USING (app.branch_check("branchId"));

-- ── Grant usage on the app schema ──────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO PUBLIC;
