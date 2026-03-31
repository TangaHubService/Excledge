# Database Design (PostgreSQL + TypeORM)

## ERD summary
- `Role` -> `User` (1:N)
- `Branch` -> `User`, `Purchase`, `Sale`, `InventoryBalance`, `StockMovement`, `StockAdjustment` (1:N)
- `Category` -> `Product` (1:N)
- `Supplier` -> `Purchase` (1:N)
- `Customer` -> `Sale` (1:N, optional on sale)
- `Purchase` -> `PurchaseItem` (1:N)
- `Sale` -> `SaleItem` (1:N)
- `Product` links to purchase/sale items and stock tables for movement and valuation
- `AuditLog` is cross-cutting and records critical actions

## Entity relationship notes
- Inventory is modeled with:
  - `InventoryBalance` for fast current stock by `(branchId, productId)`
  - `StockMovement` as immutable ledger for traceability
- `StockAdjustment` stores operational reason and actor metadata; each adjustment also writes a stock movement.
- `Sale` has invoice-readiness fields for future EBM/VSDC integration:
  - `certificationStatus`
  - `complianceReference`
  - `externalReceiptId`
  - `cancelledSaleId`

## TypeORM entity plan
- Core entities implemented under `backend/src/entities`:
  - `User`, `Role`, `Branch`, `Product`, `Category`, `Supplier`, `Customer`
  - `Purchase`, `PurchaseItem`, `Sale`, `SaleItem`
  - `InventoryBalance`, `StockMovement`, `StockAdjustment`, `AuditLog`
- Shared timestamp base class: `createdAt`/`updatedAt`
- Selective soft-delete used for catalog-like records: `Product`, `Category`, `Supplier`, `Customer`

## Migration plan
1. Initial schema migration creates core tables, enums, and key constraints.
2. Follow-up migration (when needed) adds transfer tables and branch-level approvals.
3. Compliance migration (future) adds certified connector submission/event tables.
4. Rollout procedure:
   - run migrations in CI/UAT first
   - backup before production migration
   - apply migration with rollback path in release checklist

## Indexing notes
- Unique constraints:
  - `users.email`
  - `products.sku`
  - `inventory_balances(branchId, productId)`
- Query performance indexes:
  - `purchases(branchId, createdAt)`
  - `sales(branchId, createdAt)`
  - `stock_movements(branchId, productId, createdAt)`
  - `audit_logs(entityType, entityId)`
