# Rwanda + EBM Readiness Notes

This implementation follows the Rwanda source document direction while keeping MVP scope practical.

## Included now
- Default branch currency uses `RWF`.
- Product model includes tax category and supports governance-ready naming.
- Sales model includes future compliance fields:
  - `certificationStatus` (`PENDING_CERTIFICATION`, `CERTIFIED`, `FAILED`, `CANCELLED`)
  - `complianceReference`
  - `externalReceiptId`
  - `cancelledSaleId`
- Audit log model captures key action history.
- Cancellation endpoint exists to preserve cancellation-first correction flow.

## Deferred intentionally
- Direct EBM/VSDC connector implementation
- Certified receipt signature/number orchestration
- Regulator connectivity workflow automation

## Future integration path
1. Add connector service/module with durable queue and reconciliation events.
2. Enforce connectivity gating for certification-critical invoice actions.
3. Extend sale lifecycle transitions with external acknowledgement and incident states.
4. Add compliance submission/event tables and operations dashboard.
