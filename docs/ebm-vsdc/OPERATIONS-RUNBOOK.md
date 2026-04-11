# Excledge VSDC operations runbook

This runbook is the working reference for configuring Excledge, running fiscal syncs, and collecting operational evidence before RRA verification.

## 1. Organization setup flow

Before any sandbox or verification test:

1. Enable EBM in the backend environment with `ENABLE_EBM=true`.
2. Complete organization-level fiscal identifiers:
   `TIN`, `ebmDeviceId`, `ebmSerialNo`.
3. Complete branch-level fiscal identifiers:
   `bhfId` for every active branch that will transact.
4. Complete product-level fiscal identifiers:
   `itemCode`, `itemClassCode`, `packageUnitCode`, `quantityUnitCode`.
5. For B2B scenarios, ensure the customer TIN and purchase order code are available at sale time.
6. In organization settings, open `VSDC Readiness` and clear every reported blocker before transaction testing.

## 2. Recommended sync order

Run syncs in this order after setup changes:

1. `Official Reference Sync`
   This pulls initialization info, code tables, branch lookup, and notices.
2. `Official Stock Sync`
   This pushes branch master, item master, stock master, and stock movement snapshots.
3. Transaction scenarios
   Only run sale, refund, cancel, and reprint scenarios after both sync groups are clean.

## 3. Retry and dead-letter behavior

Excledge does not treat a failed fiscal request as a successful sale.

- New EBM sales remain `PENDING` until fiscal success.
- The queue worker runs every 2 minutes from `Backend/src/jobs/ebm-queue.job.ts`.
- Pending queue rows are processed in priority order, then FIFO order.
- Backoff starts at 2 minutes and doubles up to 60 minutes.
- The queue stops retrying when `retryCount` reaches `EBM_MAX_QUEUE_RETRIES`.
- Rows that exhaust retries become `FAILED` and keep `lastError` for investigation.
- A successful retry promotes the related sale to `COMPLETED`.

Operationally, a dead-letter condition means:

- `ebm_queue.submissionStatus = FAILED`
- `ebm_queue.retryCount >= EBM_MAX_QUEUE_RETRIES`
- `ebm_transactions.submissionStatus = FAILED`
- the sale must still not be treated as a final fiscal success

## 4. Audit and evidence access paths

The main fiscal evidence sources are:

- `ebm_transactions`
  Final fiscal submission records, gateway responses, retry count, and error text.
- `ebm_queue`
  Deferred retry rows, next retry timestamp, retry count, and last error.
- `vsdc_sync_snapshots`
  Latest reference-sync and stock-sync requests, responses, summaries, and status.
- `activity_logs`
  User and system audit trail with module, status, description, IP address, user agent, and metadata.

Useful places to inspect them:

- Organization settings
  `VSDC Readiness`, `Official Reference Sync`, and `Official Stock Sync`.
- Sales history
  Receipt rendering, copy tracking, and sale-level fiscal state.
- Database access
  Use SQL or your DB admin tool for `ebm_transactions`, `ebm_queue`, `vsdc_sync_snapshots`, and `activity_logs`.
- Backend logs
  Queue processing writes summary lines such as processed, succeeded, and failed counts.

## 5. What to capture for RRA

For each executed certification scenario, keep:

- build or release version
- execution date and operator
- redacted request JSON
- redacted response JSON
- receipt PDF or screenshot
- screenshot of relevant admin screens
- queue or audit evidence when testing failures and retries

Suggested evidence naming:

- `TC-01-sale-request.json`
- `TC-01-sale-response.json`
- `TC-01-sale-receipt.pdf`
- `TC-06-queue-before.png`
- `TC-07-queue-after.png`
- `TC-13-stock-sync-summary.png`

## 6. Manual pre-submission check

Do not ask for verification until all of the following are true:

- no blockers remain in `VSDC Readiness`
- reference sync runs successfully in sandbox
- stock sync runs successfully in sandbox
- sale, refund, cancel, reprint, and retry scenarios have evidence
- tax-code mapping has been confirmed against sandbox results
- legal/SLA documents have been completed with your company details

## 7. Current limits

This runbook does not replace the official RRA instructions. You still need:

- official sandbox credentials and endpoint confirmation
- final code-list confirmation from RRA responses
- legal sign-off on SLA documents
- execution evidence captured from the real sandbox
