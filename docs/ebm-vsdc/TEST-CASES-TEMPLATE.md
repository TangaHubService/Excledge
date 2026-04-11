# VSDC / EBM certification test matrix

Use this matrix to execute and record the Excledge scenarios that usually matter most during RRA VSDC verification. Replace or extend any case when RRA provides an updated certification workbook.

## Execution rules

- Run every scenario first in local mock mode if you need a smoke test.
- Run every certification-relevant scenario again in the official sandbox with redacted request and response evidence.
- Record the exact build version, environment values used, execution date, and operator for each run.
- Save screenshots and exported PDFs with stable names such as `TC-01-sale-success-receipt.pdf` and `TC-04-failure-response.json`.

## Environment baseline

- `ENABLE_EBM=true`
- `RUN_JOBS=true`
- `EBM_USE_MOCK=false` for sandbox execution
- Organization TIN, VSDC device ID, serial number, and branch BHF ID completed
- Product item code, item classification code, package unit code, and quantity unit code completed
- VSDC reference sync and stock sync run successfully before transaction testing

## Test matrix

| ID | Area | Scenario | Preconditions | Steps | Expected result | Evidence to keep | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-01` | Sale | Standard B2C sale success | Sandbox credentials valid, one branch and one taxable product fully configured | Create a cash sale from POS and print the receipt | Sale becomes `COMPLETED`, one `EbmTransaction` row is `SUCCESS`, receipt shows fiscal fields returned by gateway | Redacted sale request, response JSON, receipt PDF, sale detail screenshot | |
| `TC-02` | Sale | Mixed tax categories | Products exist for each supported tax category | Sell a cart containing taxable, exempt, and zero-rated items | Tax buckets in the payload and receipt match configured mapping and returned totals | Request JSON, response JSON, receipt PDF | |
| `TC-03` | Sale | B2B sale with customer TIN | Corporate customer exists with valid TIN and purchase order code | Create a corporate sale from POS | Customer TIN and purchase order data appear in the request and the sale completes successfully | Request JSON, response JSON, receipt PDF | |
| `TC-04` | Sale | Missing master data blocked before fiscalization | Remove one required product or branch VSDC code in a non-production org | Attempt to create an EBM-enabled sale | API returns `400`, sale is not finalized, readiness report shows the blocker | API error payload, readiness screenshot | |
| `TC-05` | Failure | Invalid credentials | Wrong `EBM_API_KEY` or `EBM_API_SECRET` in sandbox | Attempt a sale | Sale does not become final, transaction captures failure, retry behavior matches policy | Error response, transaction record screenshot, queue row if created | |
| `TC-06` | Failure | Timeout or 5xx from gateway | Fault injection or temporary gateway outage | Attempt a sale | Sale remains `PENDING`, queue entry is created, retry count increments safely | Logs, `ebm_queue` row, transaction row | |
| `TC-07` | Retry | Automatic retry success | A pending queue row exists from `TC-06` | Restore connectivity and wait for queue job or trigger job manually | Queue row becomes `SUCCESS`, sale becomes `COMPLETED`, no duplicate fiscal receipt is created | Before/after queue screenshots, transaction row, receipt PDF | |
| `TC-08` | Retry | Dead-letter after max retries | Persistent failure condition remains in place | Let queue processing exhaust retries | Queue row becomes `FAILED`, last error is preserved, sale never becomes a false success | Queue row screenshot, backend log excerpt | |
| `TC-09` | Refund | Full refund after successful sale | Successful sale exists | Trigger full refund | Refund is fiscalized first, original sale becomes `REFUNDED`, refund sale and refund transaction are linked correctly | Refund request, refund response, refund receipt PDF | |
| `TC-10` | Cancel | Cancel after successful sale | Successful sale exists and is eligible for cancel | Trigger cancel/void | Cancel is fiscalized first, original sale status becomes `CANCELLED`, cancel transaction shows success | Cancel request, cancel response, sale detail screenshot | |
| `TC-11` | Reprint | Receipt copy handling | Successful sale exists | Open sale history and print/download again | `reprintCount` increments and receipt is labeled as a copy | Original receipt PDF, copy receipt PDF, sale detail screenshot | |
| `TC-12` | Reference sync | Initialization and code sync | Valid sandbox credentials and org setup | Run full reference sync from organization settings | Snapshot entries for init info, code tables, branches, and notices show latest status and summaries | Sync report screenshot, response JSON exports | |
| `TC-13` | Stock sync | Branch and item master sync | Products and branches fully backfilled | Run full stock sync from organization settings | Branch master, item master, stock master, and stock movement snapshots complete without validation errors | Sync report screenshot, request/response logs | |
| `TC-14` | Stock sync | Delta stock movement after inventory change | A stock-managed product exists with an on-hand quantity | Perform a stock-affecting sale or adjustment, then rerun stock sync | Movement payload contains the delta rows and the sync snapshot updates `lastSyncedAt` | Inventory evidence, stock movement request, sync snapshot screenshot | |
| `TC-15` | Multi-tenant | Per-organization numbering separation | Two organizations exist with EBM enabled | Create one sale in each org | Internal invoice counters and fiscal records remain isolated per organization | Screenshots from both orgs, transaction rows | |

## Result log

Use one row per actual execution.

| Run date | Build/version | Environment | Operator | Cases executed | Overall result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## Evidence checklist

- Redacted request and response payload for every executed scenario
- PDF receipt or screenshot for sale, refund, cancel, and reprint cases
- Screenshot of `VSDC Readiness`, `Official Reference Sync`, and `Official Stock Sync`
- Database or admin evidence for `ebm_transactions`, `ebm_queue`, and sync snapshots when failure handling is under test
- Exact environment and build identifier used during the run

## Sign-off

| Name | Role | Date | Signature/Approval note |
| --- | --- | --- | --- |
|  |  |  |  |
