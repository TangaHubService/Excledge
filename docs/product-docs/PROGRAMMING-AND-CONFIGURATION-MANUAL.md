# Excledge ERP Programming and Configuration Manual

## 1. Purpose

This manual is intended for developers, DevOps engineers, integrators, and technical administrators responsible for extending, deploying, or configuring Excledge ERP.

## 2. Current technical stack

### Frontend
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Radix UI
- React Router
- React Hook Form
- TanStack React Query
- Socket.IO client

### Backend
- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- Socket.IO
- cron-based background jobs

## 3. High-level architecture

The repository is organized around two main applications:
- `Frontend/`: browser UI, routing, forms, dashboards, POS, reports, and client-side integrations
- `Backend/`: REST API, authentication, business logic, background jobs, and data persistence

Key runtime flow:
1. the frontend authenticates users against backend auth endpoints
2. the backend issues access and refresh tokens
3. organization and branch context determine available data
4. backend services read and write PostgreSQL through Prisma
5. real-time notifications are emitted through Socket.IO rooms
6. optional integrations handle payments, email, uploads, and EBM submissions

## 4. Core domain model

Important entities defined in the Prisma schema include:
- `Organization`: tenant boundary for data ownership
- `Branch`: branch-level operational partitioning
- `User` and `UserOrganization`: users and organization membership
- `UserBranch`: branch assignment
- `Product`: sellable inventory item
- `Batch`: stock received with unit cost, batch number, and optional expiry
- `InventoryLedger`: audit-style stock movement ledger
- `Sale` and `SaleItem`: POS and transaction records
- `Customer` and `DebtPayment`: customer tracking and collections
- `Supplier`, `PurchaseOrder`, and `SupplierPayment`: purchasing workflows
- `Subscription`, `SubscriptionPlan`, and `Payment`: subscription management
- `EbmTransaction` and `EbmQueue`: EBM/VSDC submission tracking
- `ActivityLog`, `Notification`, `Expense`, and `CashBalance`: operational oversight data

## 5. API structure

The backend registers route groups under `/api`:
- `/api/auth`
- `/api/organizations`
- `/api/dashboard`
- `/api/sales`
- `/api/inventory`
- `/api/customers`
- `/api/users`
- `/api/reports`
- `/api/system-owner`
- `/api/subscriptions`
- `/api/debt-payments`
- `/api/suppliers`
- `/api/purchase-orders`
- `/api/activity-logs`
- `/api/notifications`
- `/api/pesapal`
- `/api/upload`
- `/api/batches`
- `/api/branches`
- `/api/expenses`
- `/api/supplier-payments`
- `/api/stock-transfers`

Webhook traffic is registered separately under:
- `/api/webhooks`

Health check:
- `/health`

## 6. Authentication and authorization

Authentication model:
- JWT access token
- refresh token flow
- bearer token authentication on API requests

Authorization model:
- role-based permissions
- organization access checks
- branch-aware operations
- subscription feature checks for selected routes

Frontend behavior:
- access tokens are stored in local storage
- refresh tokens are used to silently obtain new access tokens
- organization switching updates the stored tenant context

## 7. Frontend configuration

Current frontend environment variables observed in the codebase:

| Variable | Purpose |
| --- | --- |
| `VITE_PUBLIC_API_URL` | Base URL for API calls. Should include `/api`. |
| `VITE_WS_URL` | Base URL for Socket.IO connections. |
| `VITE_APP_URL` | Frontend origin used in callback and redirect flows. |
| `VITE_CONTACT_FORM_SCRIPT_ID` | Optional Google Apps Script ID for the landing page contact form. |

Recommended local example:

```env
VITE_PUBLIC_API_URL=http://localhost:5000/api
VITE_WS_URL=http://localhost:5000
VITE_APP_URL=http://localhost:5173
VITE_CONTACT_FORM_SCRIPT_ID=
```

## 8. Backend configuration

### 8.1 Core application variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend listening port. Defaults to `5000`. |
| `NODE_ENV` | Runtime mode. |
| `RUN_JOBS` | Enables or disables cron jobs. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | Required for access and refresh token signing. |
| `FRONTEND_URL` | Allowed frontend origin for CORS and redirects. |
| `API_URL` | General backend URL reference. |

### 8.2 Email and media

| Variable | Purpose |
| --- | --- |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASSWORD` | SMTP password |
| `EMAIL_FROM` | Default sender |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

### 8.3 Payment and billing integrations

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe server-side secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification secret |
| `PAYPACK_CLIENT_ID` | Paypack client credential |
| `PAYPACK_CLIENT_SECRET` | Paypack client credential |
| `PAYPACK_BASE_URL` | Paypack API base URL |
| `PAYPACK_API_KEY` | Alternate bearer token used in one payment flow |
| `PAYPACK_WEBHOOK_SECRET` | Paypack webhook signature secret |
| `PESAPAL_CONSUMER_KEY` | Pesapal credential |
| `PESAPAL_CONSUMER_SECRET` | Pesapal credential |
| `PESAPAL_API_URL` | Pesapal base URL |
| `PESAPAL_IPN_ID` | Pesapal notification identifier |
| `DPO_COMPANY_TOKEN` | DPO integration token |
| `DPO_SERVICE_TYPE` | DPO service type |
| `DPO_API_URL` | DPO API base URL |
| `DPO_PAYMENT_URL` | DPO payment URL override |

### 8.4 EBM/VSDC configuration

| Variable | Purpose |
| --- | --- |
| `ENABLE_EBM` | Turns EBM submission on or off |
| `EBM_API_URL` | Gateway base URL |
| `EBM_API_KEY` | Authentication key or username |
| `EBM_API_SECRET` | Authentication secret or password |
| `EBM_ENVIRONMENT` | `sandbox` or `production` |
| `EBM_SALE_PATH` | Sale submission path (default `/trnsSales/saveSales`) |
| `EBM_REFUND_PATH` | Refund correction path (defaults to `/trnsSales/saveSales`) |
| `EBM_VOID_PATH` | Cancel correction path (defaults to `/trnsSales/saveSales`) |
| `EBM_INIT_INFO_PATH` | Initialization info sync path (default `/initializer/selectInitInfo`) |
| `EBM_CODE_TABLE_PATH` | Code-table sync path (default `/codes/selectCodes`) |
| `EBM_BRANCH_LOOKUP_PATH` | Branch lookup sync path (default `/branches/selectBranches`) |
| `EBM_NOTICES_PATH` | Notice sync path (default `/notices/selectNotices`) |
| `EBM_BRANCH_SAVE_PATH` | Branch master sync path (default `/branches/saveBranches`) |
| `EBM_ITEM_SAVE_PATH` | Item master sync path (default `/items/saveItems`) |
| `EBM_STOCK_MASTER_PATH` | Stock master sync path (default `/stocks/saveStockMaster`) |
| `EBM_STOCK_IO_PATH` | Stock movement sync path (default `/stocks/saveStockItems`) |
| `EBM_REQUEST_TIMEOUT_MS` | HTTP timeout |
| `EBM_USE_MOCK` | Mock mode for testing |
| `EBM_MAX_QUEUE_RETRIES` | Retry limit for queued submissions |

For implementation details, also review:
- `docs/ebm-vsdc/INTEGRATION.md`
- `docs/ebm-vsdc/TEST-CASES-TEMPLATE.md`
- `docs/ebm-vsdc/CERTIFICATION-CHECKLIST.md`

## 9. Background jobs

The backend starts scheduled jobs unless `RUN_JOBS=false`:
- subscription reminders
- subscription expiry processing
- product expiry alerts
- daily reporting
- EBM queue retries

Disable jobs in local troubleshooting when you want a quieter runtime.

## 10. Real-time communication

Socket.IO is initialized on the backend HTTP server.

Current room patterns:
- organization room: `org-{organizationId}`
- transaction room: `trx-{ref}`

Use cases:
- notifications
- transaction state updates

Frontend socket clients should point to `VITE_WS_URL`.

## 11. Database and migration workflow

Main commands from `Backend/package.json`:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:studio
npm run prisma:seed
```

Guidance:
- use `prisma:migrate` during development
- use `prisma:deploy` for deployment pipelines
- keep schema, migrations, and seed data aligned

## 12. Build and run commands

### Backend

```bash
npm run dev
npm run build
npm start
npm run typecheck
npm run test:unit
npm run smoke-test
```

### Frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## 13. Recommended extension workflow

When adding new features:
1. update or add Prisma models if the data model changes
2. create and review a migration
3. add backend route, controller, service, validation, and authorization logic
4. connect frontend pages or services to the new endpoint
5. update translations if the UI introduces new labels
6. add operational or user documentation for the new capability

## 14. Configuration cautions

- `JWT_SECRET` is mandatory. The backend exits if it is missing.
- `VITE_PUBLIC_API_URL` must include `/api`, otherwise frontend requests will target incorrect paths.
- `FRONTEND_URL` must match the deployed frontend origin for CORS, redirects, and Socket.IO.
- The current repository references both `PAYPACK_CLIENT_*` and `PAYPACK_API_KEY` styles of configuration. Review the active Paypack flow and standardize it before production deployment.
- The backend `.env.example` is useful but incomplete; check actual code usage when preparing production configuration.

## 15. Technical references in this repository

Useful starting points:
- `README.md`
- `Backend/src/index.ts`
- `Backend/src/config/index.ts`
- `Backend/prisma/schema.prisma`
- `Backend/.env.example`
- `Frontend/src/App.tsx`
- `Frontend/src/lib/api-client.ts`
- `docs/ebm-vsdc`
