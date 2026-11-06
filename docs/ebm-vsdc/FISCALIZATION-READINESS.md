# Excledge — VSDC Fiscalization Readiness

**Audit date:** 2026-11-02 · **Branch:** `main` @ `11278ba`

**Source documents checked against:**

| Ref | Document |
|-----|----------|
| **APP** | *RRA CIS for VSDC — Application workbook* (Main sheet deliverables + 75-row Compliance table) |
| **CIS** | *Technical Specification of CIS for VSDC*, v1.0, March 2018 (Articles 1–24) |
| **API** | *RRA VSDC API Documentation*, v1.0.5, 16 May 2023 (§3.3 sequences, §4 code tables) |

> Requirement numbers like **§22** below refer to the **APP compliance table rows (1–75)**. Article numbers like **Art. 7.30** refer to the **CIS spec**.

---

## 1. Verdict

The code already covers almost all 75 requirements. Receipt types, the SDC block, the QR, the refund flow, the X/Z/PLU reports, the master-data APIs and the stock/purchase/import sync are all implemented. **It is not ready to submit yet.** Three things block submission:

1. **Configuration that breaks §22 / Art. 7.8.** The offline guard is effectively switched off in `.env`, and two per-tenant feature flags can bypass VSDC or the stock rule.
2. **The test suite is red.** 6 tests fail, and 3 of them are in VSDC compliance code.
3. **None of the documents and evidence RRA asks for exist yet.** No sandbox run, no evidence logs, no signed company documents, no media.

Fix sections **2** and **3**, run section **6**, and then submit.

---

## 2. Blockers: must fix before the RRA session

> **Update 2026-11-02:** B1 (env value), B2, B3 and B5 are **fixed**. Backend suite: 554 passed, only the known unrelated `login-redirection` failure remains; both `tsc` runs are clean. Still open: B1's "never-contacted device" case (left as is so it can't block sales), the production `VSDC_OFFLINE_BLOCK_MS` value on Dokploy, the `taxRtF` value check, and the B4 decision.

### B1. Offline guard is effectively disabled (§22, Art. 7.8, 7.9, 10) — ✅ replaced by a live check

> **Update 2026-11-06:** `VSDC_OFFLINE_BLOCK_MS` is gone. New sales, proforma conversions, refunds, sale corrections and regenerated invoices now ask VSDC directly (`vsdc-offline-guard.middleware.ts`) and are refused with a 503 if it does not answer within 3 seconds. A device that has never made contact is checked the same way. VSDC itself decides whether it may still issue receipts during its 24-hour limit without internet. The notes below are the original finding.

`Backend/.env` → `VSDC_OFFLINE_BLOCK_MS=864000000000`, which is about **27 years**. With that value, `vsdc-offline-guard.middleware.ts` never blocks sales.

- **Fix:** remove the override (the code default is 24 h, which matches API §2.2), or set `VSDC_OFFLINE_BLOCK_MS=86400000`. The same value must go in the production env on Dokploy.
- **Also:** `verifyVsdcOnlineStatus` returns `true` when `lastSuccessfulVdsContact` is `null` ("no contact ever recorded — allow"). A device that has a TIN/serial but was **never initialised** can therefore sell. For certification, block when a device is configured but has never made contact, and tell the user to run *Initialize with RRA*.

### B2. Per-tenant flags can switch off fiscal rules — ✅ fixed

| Flag (org settings) | Effect when set wrong | Rule broken |
|---|---|---|
| `featureFlags.ebmIntegrationEnabled = false` | Sales are saved with no VSDC call (`sales.controller.ts:733,1051,1093,…`) | §16, §22, Art. 7.8, 10 |
| `featureFlags.allowNegativeStock = true` | Goods can be sold beyond stock (`sale-commit.service.ts:382`) | Art. 7.30 |

- **Done:** `enforceFiscalFlags` in `organization-settings.service.ts` forces both values whenever a VSDC device is configured on the org or on any branch. The stored values are kept. The Settings page shows the two toggles as locked (`fiscalFlagsLocked`). Test: `tests/fiscal-flags.test.ts`.
- **Original ask:** when an org/branch has VSDC credentials (TIN + bhfId + device serial), force `ebmIntegrationEnabled=true` and `allowNegativeStock=false` on the server, ignoring the stored setting. Hide or disable both toggles in the UI for fiscalised tenants. The RRA examiner will look for exactly this kind of switch.

### B3. Six failing tests (3 are VSDC-critical) — ✅ fixed (test mocks / stale assertion; no service change needed)

`cd Backend && node_modules/.bin/vitest run` → **6 failed / 547 passed**. `tsc --noEmit` is clean.

| Test | Cause | Action |
|---|---|---|
| `rra-ebm-compliance` › *does not send taxRtF / taxRtTt* | **The test is stale.** The sandbox WAR DTO `TrnsSalesSaveWrReq` *does* have `taxRtF`, `taxRtTt`, `taxblAmtF`, `taxblAmtTt`. Commit `0561e77` was right to add them. | Change the test to assert they are present. **Also check the values:** `taxRtF` is currently set to the **B** slot rate (`TAX_RATE_BY_SLOT[1]`). Confirm the correct F-band rate from `/code/selectCodes` (class 04) before the sandbox run. |
| `rra-import` › *creates a product from the declaration (§68)* | `rra-import.service.ts:422`: a Prisma model is undefined in the test mock ("status saved but stock failed"). | Fix the mock or the service. Make sure approve still books stock. |
| `rra-import` › *pushes VSDC stock immediately after approve (§74)* | Same cause: `submitStockLedgerEntryToEbm` is never called. | Same fix. §74 needs real-time stock after import approval. |
| `purchaseOrder-org-notifications` (×2) | `findUnique` is undefined in the mock. Not a fiscal issue. | Fix the mock. |
| `login-redirection` › *inactive account* | Known failure, not related to VSDC. | Optional. |

### B4. Pre-VSDC invoice download (§16, §29, Art. 10)

By your own decision, `getInvoicePdf` serves a **NOT FISCALISED** watermarked document before the VSDC confirms the sale. Art. 10 says *"it shall be impossible to issue receipt if the CIS did not receive any response from the VSDC."* An examiner may raise this.

- **Recommended for the certification build:** allow the unfiscalised document only for `DEAD_LETTER` rows, or hide it behind an admin-only action. Be ready to explain it to RRA. The document carries no SDC data or QR and is clearly marked as not a receipt.

### B5. The demo must print only backend-rendered receipts — ✅ `Receipt.tsx` deleted

`Frontend/src/components/Receipt.tsx` still exists and does **not** meet the spec. Nothing imports it now, but delete it so it can't come back. Every print and reprint in the demo must go through `GET …/invoices/:saleId/pdf` (A4, A5 or 80 mm).

---

## 3. Configuration and environment checklist

| # | Item | Current state | Needed |
|---|---|---|---|
| C1 | VSDC WAR deployed and running | `EBM_API_URL=http://localhost:8085` (local WAR, which is the architecture API §2.2 describes) | Confirm the WAR's own config points to **`https://sdcsandbox.rra.gov.rw`** for the test, then to production after approval |
| C2 | Device credentials | Sandbox: TIN `999945560`, bhfId `00`, dvcSrlNo `excelwartest` | Run **`/initializer/selectInitInfo`** from *EBM Outbox → Initialize with RRA* for the demo branch. Check that the invoice counter is seeded |
| C3 | MRC | Validated `BBBCCNNNNNN` (`utils/mrc.ts`) | Enter the **developer ID + certificate number issued by RRA** (Art. 3.2.1.ii) once received. Until then the MRC is a placeholder |
| C4 | Offline block | ✅ local `.env` now `86400000` (24 h) | Set the same value on Dokploy production |
| C5 | `EBM_USE_MOCK` | `false` ✅ | Keep `false` |
| C6 | `EBM_REQUEST_TIMEOUT_MS` | `30000` | Fine for the REST VSDC. Art. 24.2 (1000 ms + resend) is the old XML-SDC protocol. Mention retry/outbox behaviour in the manual instead |
| C7 | Software version | `CIS_VERSION_LABEL` printed on receipts + `GET /api/version` | Bump the version for the build you submit, and quote it in the application |
| C8 | Master data | `rraMasterDataJob` pulls codes, item classes and notices | Do a full pull **before** the demo so the class 04/07/10/17/32 pickers are filled |
| C9 | Training mode | Separate activation path (training-mode service) | Show in the demo that it is a **different function** from sales mode (§42) |
| C10 | Production secrets | `.env` has an API key/secret | Don't ship them in the "CIS software on optical disk" deliverable. Ship `.env.example` only |

---

## 4. Deliverables RRA requires (APP Main sheet + §1–5)

All of these are **Pending** on the application form.

| Deliverable | Status in repo | To do |
|---|---|---|
| Business Registration Certificate | — | Get from RDB |
| Valid RSSB Clearance Certificate | — | Get from RSSB |
| Valid RRA Tax Clearance Certificate | — | Get from RRA |
| Product brochure (§1) | Draft: `docs/rra-certification/01-product-brochure.md` | Review, brand, export to PDF |
| Warranty statement (§2) | Draft: `02-warranty-statement.md` | Sign and put on letterhead |
| Physical address | Draft: `03-company-profile-address.md` | Fill in real address and contacts |
| User manual (§3) | Draft: `04-user-manual.md` | Add screenshots of the real UI, including receipt types and refund |
| Installation guide (§4) | Draft: `05-installation-guide.md` | Check against the Dokploy deploy + WAR install steps |
| Programming & configuration manual (§5) | Draft: `06-programming-configuration-manual.md` | Add TIN/MRC/tax-band configuration and the TIN-reset rule (Art. 7.2) |
| CIS software on optical disk | — | Build a tagged release (backend + frontend + migrations + `.env.example`) |
| Tool to manage the database | — | Name the tool (e.g. pgAdmin / Prisma Studio) and explain read-only auditor access (Art. 7.26) |
| SLA (supplier↔RRA, supplier↔users) | Outline: `docs/ebm-vsdc/SLA-OUTLINE.md` | Fill in RRA's template |
| Test-case evidence | Template: `TEST-CASES-TEMPLATE.md` | Fill it from the sandbox run in section 6 |
| Application form fields (Applicant, TIN, Address, Contacts, Email, Website, CIS type = *2. Solution-Provider-owned*, Model name) | — | Fill in |

---

## 5. Requirement-by-requirement status (APP §1–75)

Legend: ✅ in code · ⚠️ in code, needs a fix or a decision · 🔲 not code (document or evidence) · 🧪 verify during the sandbox run

### Enclosed documentation

| § | Requirement | Status | Where / note |
|---|---|---|---|
| 1–5 | Brochure, warranty, user manual, installation guide, programming manual | 🔲 | Drafts in `docs/rra-certification/01–06` (see section 4) |

### Operational functions and receipts

| § | Requirement | Status | Where / note |
|---|---|---|---|
| 6 | Configure MRC per device (Art. 3) | ✅ | `utils/mrc.ts`, org/branch settings. RRA-issued prefix still needed (C3) |
| 7 | All receipt types carry the Art. 4 fields | ✅ 🧪 | `invoice-render.service.ts`, `invoice-pdf.service.ts`, `invoice-receipt-pdf.service.ts` |
| 8 | NS receipt | ✅ | `createSaleWithOutbox` → `processEbmOutboxBatch` |
| 9 | NR receipt | ✅ | `refund-calculation.service.ts`; `rfdRsnCd` (class 32) |
| 10 | CS/CR copy | ✅ | `receipt-copy.service.ts` |
| 11 | TS/TR training | ✅ | `training-mode.service.ts` |
| 12 | PS proforma | ✅ | Proforma flow + conversion to sale |
| 13 | Communication protocol to VSDC | ✅ | `vsdc-api.service.ts` (REST/JSON, API §1.2) |
| 14 | Request signature by sending receipt data | ✅ | `buildRraSendReceiptPayload` → `/trnsSales/saveSales` |
| 15 | Add VSDC response to the receipt | ✅ | `rcptNo`/`totRcptNo`/`intrlData`/`rcptSign`/`sdcDateTime` stored and rendered |
| 16 | No receipt on VSDC error | ⚠️ | 425 gate exists, but see **B2** (flag bypass) and **B4** (NOT FISCALISED download) |
| 17 | Print receipt for every transaction | ✅ | |
| 18 | A4 / A5 / roll formats | ✅ | 80 mm, A5, A4 renderers |
| 19 | 13 digits incl. 2 decimals | ✅ 🧪 | Money columns `DECIMAL(15,2)`. Demo a sale ≥ 99,999,999,999.99 |
| 20 | X and Z daily reports (Art. 7, 18, 19) | ✅ | `fiscal-report-pdf.service.ts`, `buildDailyReport`, `z-report.job.ts` (save + verify) |
| 21 | Version printed on each receipt | ✅ | `softwareVersion: CIS_VERSION_LABEL` |
| 22 | No receipt when VSDC is disconnected, wrong TIN | ⚠️ | TIN-match on init exists. **B1** disables the offline block |
| 23 | Manage and send stock info | ✅ | `stock-movement-sync.service.ts` |
| 24 | PLU report (Art. 21) | ✅ | `fiscal-report-pdf.service.ts` |
| 25 | Detailed reports: sales, purchases, stock, items, imports | ✅ | Fiscal Reports page tabs |
| 26 | Means of payment (class 07: 01–07) | ✅ | `getRraPaymentCode` |
| 27 | No amount without item, qty, price | ✅ | Sale validation |
| 28 | No change to an approved receipt; refund references the original | ✅ | Regenerate guard. Refund allowed once (`'Sale already refunded'`); cancel allowed once |
| 29 | Only one original | ✅ | Reprints are always COPY |
| 30 | Reprint as COPY | ✅ | |
| 31 | QR code | ✅ 🧪 | `buildRraQrString` (sales.controller.ts:1928) builds `ddmmyyyy#hhmmss#sdcId#rcptNo/totRcptNo+label#intrlData#rcptSign`. Art. 7.24.7 lists only `sdc_receipt_number` for the 4th field, so **confirm with RRA** whether `/total + label` is accepted |
| 32 | Official RRA logo on every type | ✅ | `invoice-logo.service.ts` → `assets/rra-logo.png` |
| 33 | Header with name + address on ≥ 3 lines | ✅ 🧪 | Check that every demo tenant has name, address line and city filled in |
| 34 | TIN in first block, SDC info before the last block | ✅ 🧪 | Compare layout with the CIS Art. 13.1 sample |
| 35 | Client TIN, name, mobile (mobile when there is no TIN) | ✅ 🧪 | Verify the no-TIN case prints the phone |
| 36 | Date with hh:mm:ss | ✅ | Kigali wall time (`kigaliWallParts`) |
| 37 | Purchase code from sales | ✅ | `prcOrdCd` on `saveSales` (API v1.0.5); codes 881–884 handled |
| 38 | Purchase code from purchases | ✅ | `prcOrdCd` on purchase confirm |
| 39 | Discounts | ✅ | `dcRt`/`dcAmt` per line, derived from the catalog price (`discount.service.ts`). `dcRt` is sent as 0 when a two-decimal rate can't reproduce `dcAmt` within the VSDC's 0.1 tolerance |
| 40 | COPY content same as original + COPY sign | ✅ | |
| 41 | TRAINING sign | ✅ | |
| 42 | Training activated by a separate function | ✅ 🧪 | Show it in the demo |
| 43 | PROFORMA sign | ✅ | |
| 44 | Electronic journal identical to the printed slip | ✅ 🧪 | `electronic-journal.service.ts`, `vsdc-receipt-parity.service.ts`. Diff EJ against PDF text for NS and NR |
| 45 | Configure tax rates A–D | ✅ | Rates fixed to statute, read-only by design. Explain this in the programming manual |
| 46 | Print tax labels A–D | ✅ | |
| 47 | Round tax to 2 dp, half-up | ✅ | `money.service.ts` (`ROUND_HALF_UP`) |
| 48 | Rate > 0 (B) always printed | ✅ 🧪 | `invoice-render.service.ts:181`. Test a sale with only A-EX items |
| 49 | Zero rates (A, C, D) printed only when used | ✅ 🧪 | Same test |
| 50–51 | Consecutive counter from 1 | ✅ | `receipt-sequence.service.ts`; init seeds the counter past RRA's last number |
| 52 | Item count excludes voids | ✅ | |
| 53 | Stock for countable items | ✅ | Services skip stock (`itemType === "SERVICE"`) |
| 54 | Copy from an existing normal receipt | ✅ | |
| 55 | COPY/TRAINING/PROFORMA label + "THIS IS NOT AN OFFICIAL RECEIPT" | ✅ 🧪 | `NOT_OFFICIAL_RECEIPT_NOTICE`. Art. 11 says the text must be **at least twice the size of the amount text**, below the header **and** as a watermark. Measure it on all 3 formats |
| 56 | Refund amounts with a minus sign | ✅ 🧪 | Check every amount line, including payment and tax rows |
| 57 | Refund references the original receipt number | ✅ | "REF. NORMAL RECEIPT#" (`invoice-pdf.service.ts:130`) |

### VSDC API consumption (API §3.3)

| § | Endpoint | Status | Where |
|---|---|---|---|
| 58 | `/initializer/selectInitInfo` | ✅ | `vsdc-init.service.ts` (TIN match + counter seed) |
| 59 | `/code/selectCodes`, grouped by class | ✅ | `rra-code.service.ts`, `RraCode` model |
| 60 | Auto item code `RW` + type + pkg + qty unit + 7-digit seq (API §4.17) | ✅ | `item-code.service.ts` |
| 61 | `/itemClass/selectItemsClass` (UNSPSC) | ✅ | `RraItemClassPicker` |
| 62 | `/customers/selectCustomer` | ✅ | Customer verify |
| 63 | `/items/saveItems` | ✅ | `product-sync.service.ts` |
| 64 | `/items/selectItems` | ✅ | Select-item reconcile |
| 65 | `/notices/selectNotices` | ✅ | `RraNotice` |
| 66 | `/imports/selectImportItems` | ✅ | `rra-import.service.ts` |
| 67 | Import request date strictly later than the previous request | ✅ | Cursor in `rra_sync_cursors` |
| 68 | `/imports/updateImportItems` (status 3/4) | ⚠️ | Two tests failing (**B3**) |
| 69 | `/trnsSales/saveSales` | ✅ ⚠️ | Check the `taxRtF`/`taxRtTt` values (**B3**) |
| 70 | `/trnsPurchase/selectTrnsPurchaseSales` | ✅ | `purchase-sync.service.ts` |
| 71 | `/trnsPurchase/savePurchases` (02/04) | ✅ | Books local stock with `skipEbmSync` |
| 72 | `/stock/saveStockItems` (`sarTyCd` 01–06, 11–16) | ✅ | `stock-movement-sync.service.ts` |
| 73 | `/stockMaster/saveStockMaster` | ✅ | After every movement |
| 74 | Real-time stock for imports, purchases, sales | ⚠️ | Import path test failing (**B3**) |
| 75 | Display and handle VSDC errors (API §4.14: 000, 001, 881–884, 891–899, 900–999) | ✅ 🧪 | `vsdc-api.service.ts` classifies retryable vs. final. Make sure the cashier **sees** the `resultMsg` text, not a generic error |

Also implemented, though not on the APP table: branch APIs (`/branches/*`, including pharmacy insurances), `/items/saveItemComposition`, cash deposits/withdrawals (Art. 7.12, `cash-movements`), opening deposit on X/Z, last-receipt recovery reprint (Art. 7.28), auditor overview (Art. 7.26), closing stock by date (Art. 7.31).

---

## 6. Sandbox test run (do before applying)

Run every case against the **real sandbox VSDC** (C1/C2 done). For each one, save the request and response JSON (secrets removed) and the printed PDF into `docs/rra-certification/evidence/<case>/`.

| # | Case | Expected |
|---|---|---|
| T1 | Initialize device | `resultCd 000` or `902` (already installed); counter seeded |
| T2 | Pull codes, item classes, notices, branches | Tables filled; cursor advances |
| T3 | Create goods item + service item → `saveItems` | Auto `itemCd` matches §4.17; `000` |
| T4 | NS, cash, mixed A-EX + B items, with discount | Art. 13.1 layout; QR scans; B printed; signature dashed every 4 chars |
| T5 | NS with only A-EX items | Tax B label still printed (§48); C/D not printed |
| T6 | NS B2B with customer TIN (verified via `selectCustomer`) | Client TIN on receipt |
| T7 | NS without TIN, mobile only | Mobile printed (§35) |
| T8 | NS with purchase code (`prcOrdCd`): valid, invalid, reused | 000 / 882 / 883 shown to the user |
| T9 | Each payment method 01–07 | Correct `pmtTyCd`; X/Z split by payment |
| T10 | CS reprint of T4 | COPY header + watermark + notice, twice the size |
| T11 | NR full refund of T4 with reason code | Negative amounts, REF. NORMAL RECEIPT#, refund recipient logged |
| T12 | Second refund of T4 | Rejected |
| T13 | CR copy of T11 | |
| T14 | TS and TR in training mode | TRAINING labels; no signature |
| T15 | PS proforma | PROFORMA labels; no signature; "NOT AN OFFICIAL RECEIPT" |
| T16 | Sale qty > stock (goods) | Blocked (Art. 7.30) |
| T17 | Stop the WAR / cut the network → try to sell | Clear error; **no receipt printed** (§16, §22) |
| T18 | Wrong TIN in device config | Error, no receipt |
| T19 | 13-digit amount sale | Displays and prints correctly (§19) |
| T20 | X report mid-day, then Z report, then X again | Art. 18/19/20 fields; Z save + verify |
| T21 | PLU report for a date range | Art. 21 fields + remaining stock |
| T22 | Stock in (purchase/adjust) and stock out (sale) | `saveStockItems` + `saveStockMaster` each `000` |
| T23 | Pull purchases → confirm one, reject one | `savePurchases` 02/04; stock booked |
| T24 | Pull imports → approve one, reject one | `updateImportItems` 3/4; stock booked; request-date rule |
| T25 | EJ vs printed slip for T4 and T11 | Identical text |
| T26 | `GET /api/version` | Same version as on the receipt |

---

## 7. Order of work

1. **Code fixes:** B1 (env + never-initialised device), B2 (force flags for fiscalised tenants), B3 (tests + check the `taxRtF` value), B5 (delete `Receipt.tsx`), decide on B4.
2. **Get the suite green:** `cd Backend && node_modules/.bin/vitest run` and `tsc --noEmit`.
3. **Environment:** C1–C10; initialise the demo branch against the sandbox.
4. **Sandbox run:** T1–T26 with evidence saved.
5. **Visual check:** compare the A4/A5/80 mm prints with the CIS Art. 13–17 samples (layout order, label size, minus signs).
6. **Documents:** finish section 4; tag a release and build the disk image.
7. **Submit:** application form + compliance table ("Applicant's comment" + "Document reference" columns, pointing at the evidence folder) to **cis_sdc_certification@rra.gov.rw**.
8. **After approval:** switch the WAR to the production EBM server, get the production device serial, re-initialise, enter the RRA-issued MRC prefix.
