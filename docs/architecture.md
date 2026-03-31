# System Architecture

## Backend structure
- `backend/src/config`: env and TypeORM data source
- `backend/src/entities`: business entities and enums
- `backend/src/routes`: feature routes (`auth`, `master`, `purchases`, `sales`, `inventory`, `dashboard`, `reports`)
- `backend/src/services`: inventory and audit services
- `backend/src/middleware`: auth and error handling
- `backend/src/migrations`: DB migration files
- `backend/src/scripts`: seed scripts

## Frontend structure
- `frontend/src/api`: axios client and query key strategy
- `frontend/src/components`: reusable UI (`Layout`, `DataTable`, `Pagination`, `StateView`)
- `frontend/src/pages`: business pages (`Login`, `Dashboard`, `Products`, `Inventory`, `Purchases`, `Sales`, `Suppliers`, `Customers`, `Reports`, `Settings`)
- `frontend/src/main.tsx`: app providers (`BrowserRouter`, `TanStack Query`)

## Why this architecture is maintainable
- Feature modules are explicit and easy to extend.
- Backend keeps a practical layer count: route -> service -> TypeORM.
- Frontend uses reusable primitives and consistent server-state patterns.
- Compliance-readiness is modeled in sales/invoice fields without adding premature integration complexity.
