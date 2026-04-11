# RRA EBM / VSDC integration (Excledge)

This document describes how Excledge integrates with Rwanda Revenue Authority (RRA) Electronic Billing Machine (EBM) via a **Virtual Sales Data Controller (VSDC)**-style HTTP API. The official wire format **must be aligned** with the specification RRA provides during certification (`cis_sdc_certification@rra.gov.rw`).

## Obtaining credentials and the technical spec

1. Contact RRA: **cis_sdc_certification@rra.gov.rw** (certification) and request the **VSDC technical specification**, sandbox base URL, and authentication method.
2. Complete the certification monitoring form and document test cases (see [CERTIFICATION-CHECKLIST.md](./CERTIFICATION-CHECKLIST.md)).
3. Map RRA’s required JSON/XML fields to the payload Excledge sends (see **Payload mapping** below). Adjust `normalizeEbmResponse()` in `server/src/services/rra-ebm.service.ts` if RRA uses different property names for receipt number, QR payload, or verification codes.

## Environment variables

| Variable | Description |
|----------|-------------|
| `ENABLE_EBM` | Set to `true` to submit sales, refunds, and voids to the configured gateway. |
| `EBM_API_URL` | Base URL (no trailing slash), e.g. `https://vsdc-sandbox.rra.gov.rw`. |
| `EBM_API_KEY` | Client identifier or username (depends on RRA spec). |
| `EBM_API_SECRET` | Shared secret or password (depends on RRA spec). |
| `EBM_ENVIRONMENT` | `sandbox` or `production` (included in JSON body for traceability). |
| `EBM_SALE_PATH` | Path for sale submission (default `/trnsSales/saveSales`). |
| `EBM_REFUND_PATH` | Path for refund/correction submission (defaults to `/trnsSales/saveSales`). |
| `EBM_VOID_PATH` | Path for cancel/correction submission (defaults to `/trnsSales/saveSales`). |
| `EBM_INIT_INFO_PATH` | Path for initialization info sync (default `/initializer/selectInitInfo`). |
| `EBM_CODE_TABLE_PATH` | Path for code-table sync (default `/codes/selectCodes`). |
| `EBM_BRANCH_LOOKUP_PATH` | Path for branch lookup sync (default `/branches/selectBranches`). |
| `EBM_NOTICES_PATH` | Path for notice sync (default `/notices/selectNotices`). |
| `EBM_BRANCH_SAVE_PATH` | Path for branch master sync (default `/branches/saveBranches`). |
| `EBM_ITEM_SAVE_PATH` | Path for item master sync (default `/items/saveItems`). |
| `EBM_STOCK_MASTER_PATH` | Path for stock master sync (default `/stocks/saveStockMaster`). |
| `EBM_STOCK_IO_PATH` | Path for stock movement sync (default `/stocks/saveStockItems`). |
| `EBM_REQUEST_TIMEOUT_MS` | HTTP timeout in ms (default `30000`). |
| `EBM_USE_MOCK` | If `true`, skips HTTP and returns a synthetic success (local/dev only). |

Authentication: Excledge sends `Authorization: Basic base64(apiKey:apiSecret)` when both key and secret are set; otherwise `Bearer ${apiKey}` if only the key is set. **Change this in code** if RRA requires OAuth2 or signed requests.

## Flows

### Sale (POS / create sale)

1. When `ENABLE_EBM=true`, a new sale is first committed as `PENDING` with an internal `invoiceNumber` (per-organization sequence).
2. `submitInvoiceToEbm()` builds a **VSDC-style sales payload** for `/trnsSales/saveSales` using fields such as `tin`, `bhfId`, `invcNo`, `rcptTyCd`, `pmtTyCd`, tax buckets, receipt metadata, and item lines.
3. On HTTP success, `EbmTransaction` is updated to `SUCCESS` with the VSDC receipt number and full `responseData`, and the sale status is promoted to `COMPLETED`.
4. On failure, the sale remains `PENDING`, the latest `EbmTransaction` is marked `FAILED`, and an optional `ebm_queue` row is created for retry by the background job.

### Refund

1. When `ENABLE_EBM=true`, a full refund now submits an official-style correction payload before the local refund is finalized.
2. `submitRefundToEbm()` builds a correction request with the official VSDC fields:
   `invcNo` = new refund invoice sequence
   `orgInvcNo` = original invoice sequence
   `rcptTyCd` = `R`
   `salesSttsCd` = `05`
   `rfdDt` / `rfdRsnCd`
3. Only after the gateway returns success does Excledge mark the original sale `REFUNDED`, create the local refund sale row, and restore inventory.

### Cancel (void)

1. For completed fiscalized sales, `submitVoidToEbm()` now submits an official-style cancel correction before the local cancellation is finalized.
2. The request uses the VSDC sales contract with:
   `invcNo` = new cancel invoice sequence
   `orgInvcNo` = original invoice sequence
   `rcptTyCd` = `S`
   `salesSttsCd` = `04`
   `cnclReqDt` / `cnclDt`
3. Pending sales can still be cancelled locally without a VSDC cancel call because they were never fiscalized successfully.

### Retry queue

`ebm-queue.job.ts` runs on a schedule (when `RUN_JOBS` is not `false`), re-processes pending queue rows with exponential backoff, and marks them `SUCCESS` or `FAILED` after max attempts.

### Reference sync

Excledge now exposes a manual organization-level VSDC reference sync for the non-sales endpoints commonly needed before verification:

1. `selectInitInfo`
2. code-table sync
3. branch lookup
4. notices

The sync uses the organization TIN, VSDC device ID, serial number, and branch BHF context, then stores the latest result in `vsdc_sync_snapshots` so admins can review status in organization settings. The default path values above are implementation defaults and still need sandbox confirmation against the final RRA specification.

### Stock sync

Excledge now also exposes a manual organization-level stock sync for the endpoint family typically needed after master data is in place:

1. branch master save
2. item master save
3. stock master snapshot
4. stock movement sync from inventory ledger deltas

The stock sync uses branch BHF IDs plus product item/class/unit codes already stored in Excledge. It blocks execution if the organization, branch, or product master data required by VSDC is missing, and it stores the latest results in `vsdc_sync_snapshots` for review in organization settings. The default path values above are implementation defaults and still need sandbox confirmation against the final RRA specification.

## Payload mapping (Excledge → gateway)

Excledge now sends official-style VSDC sales and stock-management requests, but certification still depends on sandbox confirmation of the final contract and code lists.

- **SALE**: `tin`, `bhfId`, `invcNo`, `custTin`, `salesTyCd`, `rcptTyCd`, `pmtTyCd`, `salesSttsCd`, tax bucket totals, `receipt`, and `itemList` for `/trnsSales/saveSales`.
- **REFUND**: same sales contract family, but with `orgInvcNo`, `rcptTyCd: "R"`, `salesSttsCd: "05"`, `rfdDt`, and `rfdRsnCd`.
- **VOID**: same sales contract family, but with `orgInvcNo`, `rcptTyCd: "S"`, `salesSttsCd: "04"`, `cnclReqDt`, and `cnclDt`.
- **BRANCH MASTER**: organization TIN, branch BHF ID, branch name, branch status, manager metadata, and audit timestamps for `/branches/saveBranches`.
- **ITEM MASTER**: organization TIN, branch BHF ID, product item/class/unit codes, item name, pricing, and tax metadata for `/items/saveItems`.
- **STOCK MASTER**: organization TIN, branch BHF ID, item codes, and current on-hand quantities derived from the inventory ledger for `/stocks/saveStockMaster`.
- **STOCK MOVEMENTS**: organization TIN, branch BHF ID, item codes, movement quantities, stock direction, and ledger timestamps for `/stocks/saveStockItems`.

## Response normalization

The service accepts several possible shapes from the gateway and maps them into:

- `ebmInvoiceNumber`
- `receiptNumber`
- `totalReceiptNumber`
- `receiptQrPayload` (string for QR generation if required)
- `verificationCode`
- `sdcDateTime`
- `internalData`
- `receiptSignature`
- `sdcId`
- `mrcNo`
- `resultCode` / `resultMessage`

Extend `parseGatewayResponse()` in `rra-ebm.service.ts` after you have sample RRA responses.

## Invoice numbering

Internal invoice numbers use **per-organization** atomic counters (`organization_invoice_counters`), not a global sequence, to reduce multi-tenant audit risk. Align final numbering rules with RRA if they mandate a specific format.

## Reprints

Excledge now increments `Sale.reprintCount` when a receipt copy is generated from sales history, and the PDF marks the output as a copy receipt. RRA may still require reprint reporting back to VSDC; add a dedicated upstream payload when the sandbox specification confirms that requirement.
