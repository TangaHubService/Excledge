# Excledge ERP Installation Guide

## 1. Purpose

This guide describes how to install and run Excledge ERP in a development or controlled server environment using the current repository structure.

## 2. Solution architecture

Excledge ERP is split into:
- `Frontend`: React + TypeScript + Vite application
- `Backend`: Node.js + Express + Prisma API
- `PostgreSQL`: primary application database

## 3. Prerequisites

Before installation, ensure the target environment has:
- Node.js 18 or later
- npm or yarn
- PostgreSQL
- network access to required third-party services if optional integrations will be used
- an SMTP account if email features are required

Recommended local ports based on the current codebase:
- frontend: `5173`
- backend: `5000`

## 4. Obtain the source code

```bash
git clone https://github.com/TangaHubService/Excledge.git
cd Excledge
```

## 5. Install backend dependencies

```bash
cd Backend
npm install
```

## 6. Configure backend environment

Create `Backend/.env` and use `Backend/.env.example` as the starting point. At minimum, define:

```env
PORT=5000
NODE_ENV=development
RUN_JOBS=true

DATABASE_URL=postgresql://user:password@localhost:5432/excledge
JWT_SECRET=replace_with_a_secure_secret
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:5000

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

PAYPACK_CLIENT_ID=
PAYPACK_CLIENT_SECRET=
PAYPACK_BASE_URL=https://api.paypack.rw
PAYPACK_API_KEY=
PAYPACK_WEBHOOK_SECRET=

PESAPAL_CONSUMER_KEY=
PESAPAL_CONSUMER_SECRET=
PESAPAL_API_URL=https://cybqa.pesapal.com/pesapalv3/api
PESAPAL_IPN_ID=

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=noreply@example.com

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

ENABLE_EBM=false
EBM_API_URL=
EBM_API_KEY=
EBM_API_SECRET=
EBM_ENVIRONMENT=sandbox
EBM_SALE_PATH=/trnsSales/saveSales
EBM_REFUND_PATH=/trnsSales/saveSales
EBM_VOID_PATH=/trnsSales/saveSales
EBM_INIT_INFO_PATH=/initializer/selectInitInfo
EBM_CODE_TABLE_PATH=/codes/selectCodes
EBM_BRANCH_LOOKUP_PATH=/branches/selectBranches
EBM_NOTICES_PATH=/notices/selectNotices
EBM_BRANCH_SAVE_PATH=/branches/saveBranches
EBM_ITEM_SAVE_PATH=/items/saveItems
EBM_STOCK_MASTER_PATH=/stocks/saveStockMaster
EBM_STOCK_IO_PATH=/stocks/saveStockItems
EBM_REQUEST_TIMEOUT_MS=30000
EBM_USE_MOCK=false
EBM_MAX_QUEUE_RETRIES=10
```

Notes:
- `JWT_SECRET` is mandatory. The backend exits immediately if it is missing.
- The repository's `.env.example` does not include every environment variable referenced by the code. Add the extra values above as needed for your deployment.
- Leave optional integration variables blank if those services are not being used.

## 7. Configure frontend environment

Create `Frontend/.env` with the following baseline values:

```env
VITE_PUBLIC_API_URL=http://localhost:5000/api
VITE_WS_URL=http://localhost:5000
VITE_APP_URL=http://localhost:5173
VITE_CONTACT_FORM_SCRIPT_ID=
```

Important:
- `VITE_PUBLIC_API_URL` should include the `/api` suffix because the frontend calls endpoints such as `/auth/login`, `/inventory`, and `/reports` relative to that base URL.
- `VITE_WS_URL` should point to the backend host serving Socket.IO.

## 8. Generate Prisma client and apply database migrations

From the `Backend` directory:

```bash
npm run prisma:generate
npm run prisma:migrate
```

If you need demonstration data:

```bash
npm run prisma:seed
```

## 9. Start the backend

From the `Backend` directory:

```bash
npm run dev
```

Expected outcome:
- the server starts on port `5000` unless overridden
- the health endpoint becomes available at `http://localhost:5000/health`

## 10. Start the frontend

In a separate terminal:

```bash
cd Frontend
npm install
npm run dev
```

Expected outcome:
- Vite starts the frontend on `http://localhost:5173` unless configured differently

## 11. First-run validation

After both applications are running:
1. open the frontend URL in a browser
2. sign up or log in with an existing account
3. create or select an organization
4. verify dashboard access
5. create a test product
6. run a sample sale if seed data or valid setup is available

## 12. Optional integrations

Enable and test integrations only after the base application is working:
- email delivery
- Cloudinary uploads
- Stripe
- Paypack
- Pesapal
- EBM/VSDC

For EBM/VSDC details, also review:
- `docs/ebm-vsdc/INTEGRATION.md`
- `docs/ebm-vsdc/CERTIFICATION-CHECKLIST.md`

## 13. Production build

### Backend

```bash
cd Backend
npm run build
npm start
```

### Frontend

```bash
cd Frontend
npm run build
```

Serve the generated frontend build through your preferred web server or static hosting platform and expose the backend through a reverse proxy or process manager suitable for production.

## 14. Post-installation checklist

- database connection confirmed
- backend health endpoint working
- frontend can log in successfully
- CORS matches the deployed frontend URL
- optional payment and email integrations tested
- backups and monitoring enabled
- admin user and organization created

## 15. Troubleshooting

### Backend fails to start
- check `JWT_SECRET`
- check `DATABASE_URL`
- confirm PostgreSQL is running

### Frontend cannot reach backend
- confirm `VITE_PUBLIC_API_URL`
- confirm backend is running on the expected port
- confirm CORS `FRONTEND_URL` matches the frontend URL

### Migrations fail
- validate PostgreSQL credentials
- confirm the target database exists
- check Prisma schema and migration history
