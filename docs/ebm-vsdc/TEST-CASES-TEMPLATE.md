# VSDC / EBM test cases (template for RRA certification)

Fill one row per scenario. Attach redacted request/response logs from sandbox.

| ID | Scenario | Preconditions | Steps | Expected | Evidence (log ref) | Pass/Fail |
|----|-----------|---------------|-------|----------|-------------------|------------|
| TC-01 | Standard sale, all STANDARD VAT | Org TIN + device fields set, `ENABLE_EBM=true` | Complete POS sale | `EbmTransaction` SUCCESS, PDF shows EBM block | | |
| TC-02 | Mixed tax categories | Products with STANDARD / ZERO_RATED / EXEMPT | Complete sale | Line tax codes match RRA mapping (A/B/D) | | |
| TC-03 | B2B customer TIN | Corporate customer with TIN | Complete sale | Customer TIN in gateway payload | | |
| TC-04 | Gateway timeout / 5xx | Mock or sandbox fault injection | Complete sale | `ebm_queue` row, retry job eventually succeeds or FAILED after max | | |
| TC-05 | Invalid credentials | Wrong `EBM_API_KEY` | Complete sale | FAILED status, error stored, queue retry | | |
| TC-06 | Full refund after fiscal sale | Sale with SUCCESS EBM | Refund full amount | REFUND operation submitted, `EbmTransaction` for refund | | |
| TC-07 | Cancel after fiscal sale | Sale with SUCCESS EBM | Cancel sale | VOID operation submitted | | |
| TC-08 | Refund without EBM success | Sale never fiscalized | Refund | No refund API call (no-op) | | |
| TC-09 | Mock mode | `EBM_USE_MOCK=true` | Sale | SUCCESS with `MOCK-EBM-*`, no HTTP | | |
| TC-10 | Per-org invoice sequence | Two orgs create sales | Create sales in parallel | Distinct `INV-*` sequences per org | | |

## Notes

- Replace path and body field names with those from the **official RRA VSDC specification** before submission.
- For production certification, repeat TC-01–TC-08 in the **production** environment after RRA approval.
