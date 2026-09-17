# Excledge API Documentation (RRA / EBM + Full Backend)

Sellable, testable documentation for the Excledge backend — with a dedicated RRA/EBM surface.

## Interactive Swagger (recommended)

Start the backend, then open:

| URL | What you get |
|-----|----------------|
| `http://localhost:<PORT>/api/docs` | Docs landing page |
| `http://localhost:<PORT>/api/docs/full` | **Full** backend OpenAPI (all ~280 routes) |
| `http://localhost:<PORT>/api/docs/rra` | **RRA / EBM only** — fiscal sales, master data, stock, purchases, imports, CIS reports |
| `http://localhost:<PORT>/api/docs/openapi.json` | Full OpenAPI JSON |
| `http://localhost:<PORT>/api/docs/rra.json` | RRA-only OpenAPI JSON |

In Swagger UI: click **Authorize**, paste a JWT from `POST /api/auth/login`, then try endpoints.

## Postman collections

| File | Purpose |
|------|---------|
| `Excledge-RRA-API-Collection.json` | RRA-connected endpoints only (best for partners / certification demos) |
| `Excledge-API-Collection.json` | Full backend API (generated from routes) |
| `EBM-Test-Collection.json` | Hands-on EBM/VSDC sandbox test suite (includes direct VSDC WAR calls) |
| `EBM-Environment.json` | Shared environment (`baseUrl`, `jwtToken`, TIN, device serial, …) |

### Import

1. Postman → **Import** → select the collection JSON + `EBM-Environment.json`
2. Select environment **Excledge EBM/VSDC Environment**
3. Run **Login** first (or Auth → Login in the full collection) so `jwtToken` / `organizationId` are saved

## Regenerate docs after route changes

```bash
cd Backend
npm run docs:generate
```

This refreshes:

- `Backend/src/docs/openapi.json`
- `Backend/src/docs/openapi-rra.json`
- `Backend/src/docs/route-catalog.json`
- `Postman/Excledge-API-Collection.json`
- `Postman/Excledge-RRA-API-Collection.json`
- `Backend/postman_collection.json`

## Prerequisites for live RRA tests

1. Backend on your configured `PORT` (Postman default `4500`)
2. VSDC sandbox WAR on `8085` (for direct VSDC requests in `EBM-Test-Collection.json`)
3. Org with EBM enabled (`featureFlags.ebmIntegrationEnabled`) and device initialized

## RRA endpoint map (high level)

```
EBM Device & Outbox   → /api/organizations/:id/ebm-*, z-report, ebm/initialize
RRA Master Data       → /api/organizations/:id/rra/{status,codes,item-classes,notices,customers,items}
RRA Stock & Trade     → /api/organizations/:id/rra/{stock,purchases,imports}
RRA Lookups / Push    → refund-reasons, payment-mappings, branches/users/customers/BOM sync
Fiscal Sales          → /api/sales/... (create, convert, refund, cancel, ebm-receipt, invoice PDF)
Fiscal Reports        → /api/reports/{daily,plu,electronic-journal,purchases}
Sync Triggers         → inventory products/BOM/production, customers with TIN
Org EBM Config        → /api/organizations/:id/settings + fiscal identity fields
```

## Deeper reference

- `docs/ebm-vsdc/INTEGRATION.md` — CIS ↔ VSDC integration guide
- `docs/ebm-vsdc/CERTIFICATION-CHECKLIST.md` — RRA certification checklist
- `docs/ebm-vsdc/TEST-CASES-TEMPLATE.md` — certification test matrix
