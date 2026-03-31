# Rwanda Inventory MVP Scope

## Source-of-truth highlights
- Electronic invoicing compliance in Rwanda is a core design constraint, so invoice lifecycle and auditability must be built-in from day one.
- Corrections should follow cancellation-first patterns, with links to original transactions.
- Product naming and tax categories must be governed and traceable.
- Offline behavior should prioritize stock operations; compliance-critical invoice certification should be connectivity-aware.
- Branch-aware stock visibility and movement history are required for practical operations and audits.

## Must-have now (MVP)
- Authentication and basic RBAC: `ADMIN`, `MANAGER`, `CASHIER`
- Branch management and branch-scoped operations
- Products, categories, suppliers, customers
- Purchases (stock in), sales (stock out)
- Inventory balances, stock adjustments (with reasons), stock movement ledger
- Negative stock prevention
- Low-stock alerts (`reorderLevel`)
- Dashboard basics: total products, stock quantity, low stock, recent purchases/sales
- Practical reports:
  - stock on hand
  - low stock
  - stock movement
  - purchases
  - sales
  - top selling products
  - inventory value summary
- Audit logs for critical actions
- Invoice-readiness fields for future EBM/VSDC integration (status, references, cancellation linkage)

## Should-have next
- Inter-branch transfer workflow
- Approval thresholds for cancellations and high-impact adjustments
- Better branch analytics and CSV export improvements
- More advanced offline queue UX for non-critical actions

## Later / future
- Full EBM/VSDC connector integration and certification workflows
- Native mobile app and optional USSD support
- Advanced sector modules (pharmacy lot-depth, manufacturing BOM)
- Advanced pricing, forecasting, and payment/accounting connectors

## Explicitly excluded from MVP
- Full certified invoicing integration with external EBM/VSDC systems
- Advanced manufacturing planning (MRP/capacity)
- Cold chain IoT and deep pharma traceability add-ons
- Complex promotion engines and loyalty systems

## Core business flows
1. **Purchase -> Stock In**: record purchase and items, increase branch inventory, write stock movements, audit action.
2. **Sale -> Stock Out**: validate stock, create sale and items, decrease inventory, write stock movements, block negative stock.
3. **Stock Adjustment**: manager/storekeeper adjusts inventory with mandatory reason, writes adjustment + movement + audit.
4. **Monitoring**: low-stock report and dashboard cards from inventory balances.
5. **Compliance readiness**: sales store invoice lifecycle metadata (`PENDING_CERTIFICATION`, `CERTIFIED`, `FAILED`, `CANCELLED`) without full connector implementation.

## User roles
- **Admin**: full access, user/role/settings control, high-risk approvals.
- **Manager**: operational control over catalog, purchases, sales, reports, adjustments.
- **Cashier/Storekeeper**: sales, receiving, stock operations with restricted high-risk actions.

## Why this MVP can win in Rwanda
- Solves immediate daily pain points (stock accuracy, purchasing, sales, visibility).
- Avoids over-engineering and keeps UI and workflows simple for SMEs.
- Builds compliance-ready data and audit trails early, reducing future integration risk.
- Supports branch growth and practical reporting, which are immediate needs for growing businesses.
