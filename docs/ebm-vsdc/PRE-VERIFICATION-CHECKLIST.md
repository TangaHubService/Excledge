# Excledge VSDC Pre-Verification Checklist

Use this list before asking RRA for formal CIS/VSDC verification. It is intentionally ordered so the top items are the ones most likely to block a review immediately.

## P0. Certification blockers

- [x] Gate final sale completion on successful VSDC sale submission. A sale must not become the final fiscal receipt if VSDC did not return success data.
- [ ] Replace provisional sales payload fallbacks with authoritative master data and backfill existing records:
  item code
  item classification code
  package unit code
  quantity unit code
  branch BHF id
  purchase order code for B2B sales
- [x] Align refund and cancel flows with the official VSDC sales-status model and response handling.
- [x] Print the official receipt structure required by CIS:
  receipt type and transaction type
  uninterrupted receipt numbering per type
  VSDC receipt number
  total receipt counter
  internal data
  receipt signature
  VSDC ID
  MRC number
  tax amounts per official tax type
- [ ] Confirm tax code mapping against sandbox code lists and historical sales data. Current sales remap assumes:
  `B` = 18%
  `A` = exempt
  `C` = zero-rated pending sandbox confirmation
- [x] Implement official stock synchronization support for the VSDC endpoint family:
  stock in/out
  stock master save
  branch sync
  item sync
- [x] Implement initialization and code-sync support against the official API:
  `selectInitInfo`
  code list sync
  branch lookup
  notices

## P1. Sandbox execution

- [ ] Receive sandbox credentials and confirm the final base URL, auth method, and enabled endpoints from RRA.
- [ ] Run happy-path sale tests using the official `/trnsSales/saveSales` contract.
- [ ] Run failure-path tests where VSDC returns non-`000` result codes.
- [ ] Run offline and retry tests, including the 24-hour connectivity rule called out in the VSDC spec.
- [ ] Run refund and cancel scenarios with official reason/status mapping.
- [ ] Run stock movement and stock master synchronization scenarios.
- [ ] Run B2B scenarios with valid customer TIN and purchase code.
- [ ] Capture sample requests and responses for every scenario with secrets redacted.

## P2. Evidence pack

- [x] Finalize the certification test matrix in `TEST-CASES-TEMPLATE.md`.
- [ ] Finalize supplier and customer SLA documents.
- [x] Document the organization setup flow:
  TIN
  device ID
  serial number
  branch code/BHF id
- [x] Document retry, queue, and dead-letter behavior.
- [x] Document audit retention and access paths for fiscal logs.
- [ ] Prepare receipt screenshots and generated PDFs showing the final fiscal fields.

## P3. Submission readiness

- [ ] Confirm all required legal and organizational documents are current.
- [ ] Confirm sandbox execution evidence is complete and reproducible.
- [ ] Confirm the shipped build and the tested build are the same version.
- [ ] Freeze fiscal payload mappings before requesting verification.
- [ ] Prepare a rollback and support contact plan for verification feedback.

## Current repo status

- [x] Sales submission default path now targets the official sales save endpoint shape.
- [x] Sales response normalization now understands `resultCd`, `rcptNo`, `totRcptNo`, `intrlData`, `rcptSign`, `sdcId`, `mrcNo`, and VSDC publish time.
- [x] New sales remain `PENDING` until VSDC success and are promoted to `COMPLETED` after successful fiscalization or queue retry success.
- [x] Refund and void flows now submit synchronous VSDC correction payloads before local finalization, using official receipt/status codes.
- [x] Product, branch, and POS workflows now capture item code, item classification, unit codes, branch BHF ID, and B2B purchase order code in first-class fields.
- [x] Sales receipt PDFs now render receipt type, transaction type, CIS/VSDC numbering, fiscal signature fields, official tax-type totals, and copy labeling from tracked `reprintCount`.
- [x] Organization settings now expose a VSDC readiness report listing organization, branch, and product master-data blockers for backfill work.
- [x] Organization settings now support inline branch and product master-data backfill directly from the VSDC readiness report.
- [x] Organization settings now support manual VSDC reference sync for init info, code tables, branch lookup, and notices, with cached snapshots for review.
- [x] Organization settings now support manual VSDC stock sync for branch master, item master, stock master, and stock movements, with cached snapshots for review.
- [x] The certification test matrix, operational runbook, and SLA outline now exist in `docs/ebm-vsdc` for execution and evidence prep.
- [ ] Existing products and branches still need their VSDC master data backfilled. Incomplete records now fail fiscalization instead of falling back to temporary derived values.
