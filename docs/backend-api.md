# Backend API Overview

Base URL: `/api/v1`

## Auth
- `POST /auth/register`
- `POST /auth/login`

## Master Data
- `GET/POST /branches`
- `GET/POST /categories`
- `GET/POST /products`
- `GET/POST /suppliers`
- `GET/POST /customers`

## Transactions
- `GET/POST /purchases`
- `GET/POST /sales`
- `POST /sales/:id/cancel`

## Inventory
- `GET /inventory/balances`
- `GET /inventory/movements`
- `POST /inventory/adjustments`

## Dashboard + Reports
- `GET /dashboard/summary`
- `GET /reports/stock-on-hand`
- `GET /reports/low-stock`
- `GET /reports/stock-movement`
- `GET /reports/purchases`
- `GET /reports/sales`
- `GET /reports/top-selling-products`
- `GET /reports/inventory-value-summary`

## Request / response standards
- Errors: `{ success: false, code, message, details? }`
- Success: `{ success: true, data, ...pagination }`
- Pagination query: `page`, `pageSize`, `search`, optional `sortBy`, `sortOrder` (future extension)
