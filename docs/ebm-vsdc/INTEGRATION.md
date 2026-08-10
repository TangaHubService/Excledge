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
| `EBM_SALE_PATH` | VSDC sale submission path (default `/trnsSales/saveSales`). |
| `EBM_REFUND_PATH` | VSDC refund path (default `/trnsSales/saveSales`; the receipt fields distinguish a refund). |
| `EBM_VOID_PATH` | VSDC cancellation path (default `/trnsSales/saveSales`; the receipt fields distinguish a cancellation). |
| `EBM_REQUEST_TIMEOUT_MS` | HTTP timeout in ms (default `30000`). |
| `EBM_USE_MOCK` | If `true`, skips HTTP and returns a synthetic success (local/dev only). |

Authentication: Excledge sends `Authorization: Basic base64(apiKey:apiSecret)` when both key and secret are set; otherwise `Bearer ${apiKey}` if only the key is set. **Change this in code** if RRA requires OAuth2 or signed requests.

## Flows

### Sale (POS / create sale)

1. Sale is committed in the database with internal `invoiceNumber` (per-device sequence).
2. The transactional outbox atomically claims one pending row, then submits the VSDC `TrnsSalesSaveReq` payload to `/trnsSales/saveSales`.
3. On HTTP success, `EbmTransaction` is updated to `SUCCESS` with the RRA receipt counters, signature, and full response data.
4. On failure, the outbox row records the gateway message and retries with backoff; concurrent workers cannot submit the same receipt twice.

### Refund

After a full refund is recorded, `submitRefundToEbm()` POSTs to `EBM_REFUND_PATH` with the original internal invoice number and the latest successful `ebmInvoiceNumber` from `EbmTransaction`.

### Cancel (void)

After a sale is cancelled, `submitVoidToEbm()` POSTs to `EBM_VOID_PATH` when a successful EBM submission exists for that sale.

### Retry queue

`ebm-queue.job.ts` runs on a schedule (when `RUN_JOBS` is not `false`), re-processes pending queue rows with exponential backoff, and marks them `SUCCESS` or `FAILED` after max attempts.

## Payload mapping (Excledge → gateway)

Excledge sends a single JSON object (operation-specific). **Adjust keys to match RRA’s spec** before production.

- **SALE**: `environment`, `operation: "SALE"`, `seller` (tin, deviceId, serialNo), `branch`, `invoice` (internalNumber, saleId, issuedAt, customer, payment, totals, lines with taxCode/taxRate/taxAmount).
- **REFUND**: `operation: "REFUND"`, `originalInvoiceNumber`, `originalEbmInvoiceNumber`, `refundSaleId`, `reason`, amounts.
- **VOID**: `operation: "VOID"`, `internalInvoiceNumber`, `ebmInvoiceNumber`, `reason`.

## Response normalization

The service accepts several possible shapes from the gateway and maps them into:

- `ebmInvoiceNumber`
- `receiptQrPayload` (string for QR generation if required)
- `verificationCode`
- `sdcDateTime`

Extend `parseGatewayResponse()` in `rra-ebm.service.ts` after you have sample RRA responses.

## Invoice numbering

Internal invoice numbers use **per-organization** atomic counters (`organization_invoice_counters`), not a global sequence, to reduce multi-tenant audit risk. Align final numbering rules with RRA if they mandate a specific format.

## Reprints

`Sale.reprintCount` exists in the schema for future use. RRA may require reporting reprints to VSDC; add a dedicated endpoint and payload when the spec requires it.
