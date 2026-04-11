# SLA outline for RRA certification

Use this as the drafting basis for the two support agreements that are commonly requested during VSDC certification. Replace every placeholder with your legal entity, contacts, and support commitments before submission.

## 1. Document control

| Field | Value |
| --- | --- |
| Supplier legal name | `[Company legal name]` |
| Product name | `Excledge ERP` |
| Version covered | `[Release or certified build number]` |
| Primary support email | `[support@example.com]` |
| Escalation contact | `[technical lead / manager]` |
| Effective date | `[YYYY-MM-DD]` |

## 2. Supplier ↔ RRA support agreement

### Purpose

Define how the supplier supports the certified VSDC integration during sandbox tests, production incidents, and post-certification maintenance.

### Parties

- Supplier: `[Company legal name]`
- Customer/Authority: `Rwanda Revenue Authority`

### Scope

- availability of the certified VSDC integration
- support during verification and follow-up defect resolution
- notification of material changes affecting fiscal submission
- incident handling for failed fiscalization, repeated retries, or invalid receipts

### Support channels

- certification email: `[email]`
- operations email: `[email]`
- phone / emergency line: `[phone]`
- escalation path: support engineer → technical lead → management contact

### Severity model

| Severity | Definition | Example |
| --- | --- | --- |
| `Critical` | No fiscal submissions possible or widespread incorrect receipts | gateway auth failure, all sales stuck in `PENDING` |
| `Major` | Partial loss of fiscal capability or repeated transaction failures | queue retries failing for one tenant or branch |
| `Minor` | Non-blocking issue with workaround | sync summary formatting or admin-report issue |

### Service targets

| Severity | First response target | Update cadence | Target workaround or fix |
| --- | --- | --- | --- |
| `Critical` | `[1 hour]` | `[every 2 hours]` | `[same day / 24 hours]` |
| `Major` | `[4 business hours]` | `[daily]` | `[2 business days]` |
| `Minor` | `[1 business day]` | `[as needed]` | `[next planned release]` |

### Supplier obligations

- maintain trained technical contacts for the certified build
- investigate failed fiscal submissions using `ebm_transactions`, `ebm_queue`, and sync snapshots
- notify RRA before material integration changes when required
- preserve incident records and redacted evidence for certification follow-up

### RRA coordination

- provide named contacts for certification and incident coordination
- share sandbox and production onboarding requirements
- confirm reporting format for verification feedback and retest requests

## 3. Supplier ↔ customer support agreement

### Purpose

Define the support the supplier provides to subscribing businesses using Excledge with EBM/VSDC enabled.

### Scope

- onboarding help for TIN, device ID, serial number, and branch BHF setup
- support for product master-data backfill required by fiscalization
- troubleshooting failed sales, refunds, cancels, and sync operations
- guidance on receipt copies, retries, and escalation timing

### Customer responsibilities

- provide accurate tax, branch, and product master data
- protect credentials and approved operator access
- report fiscal issues promptly with timestamps and screenshots
- avoid unapproved production changes during certification windows

### Suggested support commitments

| Severity | Example | First response target | Resolution target |
| --- | --- | --- | --- |
| `Critical` | customer cannot complete fiscal sales | `[1 hour / same business day]` | `[same day]` |
| `Major` | refund/cancel or sync operations failing | `[4 business hours]` | `[2 business days]` |
| `Minor` | training or formatting assistance | `[1 business day]` | `[next planned release or guidance]` |

### Communication methods

- in-app or portal ticket: `[tool name]`
- support email: `[email]`
- phone or WhatsApp: `[number if offered]`
- status page: `[URL if offered]`

## 4. Change management and release notice

Include a clause describing:

- how certified build numbers are tracked
- when customers and RRA are notified of changes
- what constitutes a material fiscal change requiring revalidation

## 5. Attachments to include

- contact list with roles and phone numbers
- escalation matrix
- link or attachment for the Excledge VSDC operations runbook
- link or attachment for the certification test matrix

## 6. Finalization checklist

- legal entity names inserted
- contacts and escalation chain inserted
- service targets approved by management
- certification build/version inserted
- references to Excledge runbook and test matrix attached
- reviewed against any official RRA SLA template provided later
