# RRA VSDC / EBM certification checklist (Excledge)

Use this as a working checklist alongside RRA’s official forms. Requirements change; verify with **cis_sdc_certification@rra.gov.rw** and [RRA EBM pages](https://www.rra.gov.rw/en/ebm-electronic-billing-machine).

## Organizational / legal (typical)

- [ ] Business registration certificate
- [ ] Valid RRA tax clearance certificate
- [ ] Valid RSSB clearance certificate (if applicable)
- [ ] Physical business address documented
- [ ] Software support SLA: supplier ↔ RRA (template from RRA)
- [ ] Software support SLA: supplier ↔ end users (template from RRA)
- [ ] Software documentation (architecture, deployment, security contacts)
- [ ] Test cases document (happy path, offline/retry, refund, void, invalid TIN, etc.)
- [ ] Certification monitoring form (Excel) completed and maintained

## Templates in this folder

- [INTEGRATION.md](./INTEGRATION.md) — env vars and payload overview  
- [TEST-CASES-TEMPLATE.md](./TEST-CASES-TEMPLATE.md) — certification test matrix  
- [SLA-OUTLINE.md](./SLA-OUTLINE.md) — draft SLA sections for RRA and customers  
- [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md) — setup, sync, retry, and evidence guide  
- [PRE-VERIFICATION-CHECKLIST.md](./PRE-VERIFICATION-CHECKLIST.md) — ordered technical readiness checklist  

## Technical evidence (prepare before submission)

- [ ] Sandbox credentials received; all test cases executed in sandbox
- [ ] Evidence logs: sample requests/responses (redact secrets) for sale, refund, void
- [x] Description of retry and dead-letter behavior (`ebm_queue`, max retries) documented in `OPERATIONS-RUNBOOK.md`
- [x] Data retention and audit trail (`ebm_transactions`, `vsdc_sync_snapshots`, `activity_logs`) documented in `OPERATIONS-RUNBOOK.md`
- [x] Per-tenant TIN and device id/serial configuration process documented in `OPERATIONS-RUNBOOK.md`
- [ ] Receipt/PDF shows RRA-mandated fields returned by the gateway (after mapping is finalized)

## Excledge-specific test ideas

1. Sale with standard VAT lines; verify `EbmTransaction` = `SUCCESS` and PDF shows fiscal block.
2. Sale with zero-rated / exempt product mix; verify tax codes on lines.
3. B2B sale with customer TIN populated.
4. Network failure during submit; verify queue entry and eventual success after retry job.
5. Full refund after successful EBM sale; verify refund API called with original EBM reference.
6. Cancel sale after successful EBM sale; verify void API called.
7. `EBM_USE_MOCK=true` local smoke test without RRA connectivity.

## Contacts

- Certification: **cis_sdc_certification@rra.gov.rw**
- General RRA: toll-free **3004** (verify on RRA website)
