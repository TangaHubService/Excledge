import type { DailyReportData, PluReportData } from "./fiscal-report-pdf.service"
import {
  fmtMoney,
  fmtPlain,
  fmtRwf,
  fmtYmd,
  periodLabel,
  renderRraSummaryPdf,
  renderRraSummaryXlsx,
  renderRraTablePdf,
  renderRraTableXlsx,
  type RraPaymentGrid,
  type RraSummaryReport,
  type RraSummaryRow,
  type RraTableReport,
} from "./rra-report-layout.service"

/**
 * A4 versions of the daily X / Z report (CIS spec Art. 7.6, 18, 19) and the PLU report (Art. 21),
 * laid out like the reports RRA issues from its own VSDC portal. The 80 mm thermal versions live
 * in fiscal-report-pdf.service.ts.
 */

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "CASH",
  CREDIT_CARD: "DEBIT&CREDIT CARD",
  CARD: "DEBIT&CREDIT CARD",
  MOBILE_MONEY: "MOBILE MONEY",
  MTN_MOMO: "MOBILE MONEY",
  AIRTEL_MONEY: "MOBILE MONEY",
  BANK: "BANK CHECK",
  BANK_CHECK: "BANK CHECK",
  INSURANCE: "INSURANCE",
  DEBT: "CREDIT",
  MIXED: "CASH/CREDIT",
}

export const paymentLabel = (k: string | null | undefined): string =>
  PAYMENT_LABELS[String(k ?? "").toUpperCase()] ?? String(k ?? "-").replace(/_/g, " ").toUpperCase()

const abs = (n: number | null | undefined) => Math.abs(Number(n ?? 0))

function dailyDate(data: DailyReportData): string {
  if (data.coversSinceLastZ) return periodLabel(fmtYmd(data.periodStart), fmtYmd(data.periodEnd))
  return data.reportDate
}

/**
 * The X / Z report exactly as RRA's portal prints it: Trade Name / TIN / MRC / Date, then the
 * "All Transactions" table with the same 16 rows, the payment grids (Payment | Amount(NS) |
 * Amount(NR)) for taxable amounts, tax amounts and means of payment.
 */
export function buildDailyReportSummary(data: DailyReportData): RraSummaryReport {
  const isZ = data.reportType === "Z"
  const s = data.summary

  // Merge methods that print under the same RRA label (e.g. MTN / Airtel → MOBILE MONEY).
  const amounts = new Map<string, { ns: number; nr: number }>()
  const taxes = new Map<string, { ns: number; nr: number }>()
  const add = (m: Map<string, { ns: number; nr: number }>, k: string, ns: number, nr: number) => {
    const l = paymentLabel(k)
    const e = m.get(l) ?? { ns: 0, nr: 0 }
    e.ns += ns
    e.nr += nr
    m.set(l, e)
  }
  for (const [k, v] of Object.entries(data.paymentBreakdown ?? {})) add(amounts, k, Number(v ?? 0), 0)
  for (const [k, v] of Object.entries(data.refundPaymentBreakdown ?? {})) add(amounts, k, 0, abs(v))
  for (const [k, v] of Object.entries(data.paymentTaxBreakdown ?? {})) add(taxes, k, abs(v.ns), abs(v.nr))
  // Every method that has money also gets a tax line (0.00 when untaxed), and vice versa.
  for (const l of amounts.keys()) if (!taxes.has(l)) taxes.set(l, { ns: 0, nr: 0 })
  for (const l of taxes.keys()) if (!amounts.has(l)) amounts.set(l, { ns: 0, nr: 0 })
  if (!amounts.size) {
    amounts.set("CASH", { ns: 0, nr: 0 })
    taxes.set("CASH", { ns: 0, nr: 0 })
  }
  const labels = Array.from(amounts.keys())
  const head: [string, string, string] = ["Payment", "Amount(NS)", "Amount(NR)"]
  const amountGrid: RraPaymentGrid = { head, rows: labels.map((l) => [l, fmtRwf(amounts.get(l)!.ns), fmtRwf(amounts.get(l)!.nr)]) }
  const taxGrid: RraPaymentGrid = { head, rows: labels.map((l) => [l, fmtRwf(taxes.get(l)!.ns, true), fmtRwf(taxes.get(l)!.nr, true)]) }

  const groups = Object.values(data.groupTotals ?? {})
  const groupSales = groups.length ? groups.reduce((t, g) => t + Number(g.salesAmt ?? 0), 0) : s.grossSalesAmt
  const cs = data.copySplit ?? { cs: s.copyCount, cr: 0 }
  const tr = data.trainingSplit ?? { ts: s.trainingCount, tr: 0 }

  const rows: RraSummaryRow[] = [
    { label: "Total Sales Amount (NS)", value: fmtRwf(s.grossSalesAmt) },
    { label: "Total Sales Amount by Main Groups", value: fmtRwf(groupSales) },
    { label: "Number of Sales Receipts (NS)", value: String(s.normalSalesCount) },
    { label: "Total Refund Amount (NR)", value: fmtRwf(abs(s.grossRefundAmt)) },
    { label: "Number of Refund Receipts (NR)", value: String(s.normalRefundsCount) },
    { label: "Taxable Amounts", grid: amountGrid },
    { label: "Opening deposit", value: fmtRwf(s.openingDeposit) },
    { label: "Number of items sold", value: String(data.counters.itemCount) },
    { label: "Tax Amounts", grid: taxGrid },
    { label: "Number of Receipt Copies (CS/CR)", value: `CS : ${cs.cs} | CR : ${cs.cr}` },
    { label: "Number of Receipts in Training Mode (TS/TR)", value: `TS : ${tr.ts} | TR : ${tr.tr}` },
    { label: "Number of Advance Receipts in Proforma Mode (PS)", value: String(s.proformaCount) },
    { label: "Total Sales divided according to means of payment for sales (NS) and refund (NR) receipts", grid: amountGrid },
    { label: "All discounts", value: fmtRwf(s.discountTotal) },
    { label: "Number of incomplete sales", value: String(s.incompleteSalesCount) },
    { label: "Other registrations that have reduced the day sales and their amount", value: s.otherReductionsAmt ? fmtRwf(s.otherReductionsAmt) : "None" },
  ]

  const notes: string[] = []
  if (data.coversSinceLastZ) {
    notes.push("No Z report was closed for the preceding day(s); per CIS spec Art. 20 this report covers the entire period since the previous Z report.")
  }

  return {
    title: isZ ? "Z Report" : "X Report",
    tradeName: data.header.orgName,
    tin: data.header.tin,
    mrc: data.header.mrcNo,
    date: dailyDate(data),
    sectionTitle: "All Transactions",
    rows,
    notes,
    generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
    subject: `${data.reportType} Report`,
  }
}

export function renderDailyReportA4(data: DailyReportData): Promise<Buffer> {
  return renderRraSummaryPdf(buildDailyReportSummary(data))
}

export function renderDailyReportXlsx(data: DailyReportData): Buffer {
  return renderRraSummaryXlsx(buildDailyReportSummary(data))
}

// PLU report (CIS spec Art. 21)

export function buildPluReportTable(data: PluReportData): RraTableReport {
  return {
    title: "PLU REPORT",
    orgName: data.header.orgName,
    tin: data.header.tin,
    period: periodLabel(data.periodStart, data.periodEnd),
    columns: [
      { label: "No", width: 0.6 },
      { label: "Item Name", width: 4.5 },
      { label: "Item Code", width: 2.1 },
      { label: "Unit Price", width: 1.3, format: fmtMoney, numFmt: "#,##0.00" },
      { label: "Tax Rate", width: 1.1, format: (v) => `${fmtPlain(v)}%` },
      { label: "Sold Quantity", width: 1.6, format: fmtPlain, numFmt: "0.###" },
      { label: "Remain Quantity", width: 1.9, format: fmtPlain, numFmt: "0.###" },
    ],
    rows: data.rows.map((r, i) => [i + 1, r.productName, r.itemCd, r.unitPrice, r.taxRate, r.quantity, r.remainingQty]),
    emptyText: "No sales in this period.",
    generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
    subject: "PLU Report",
  }
}

export function renderPluReportA4(data: PluReportData): Promise<Buffer> {
  return renderRraTablePdf(buildPluReportTable(data))
}

export function renderPluReportXlsx(data: PluReportData): Buffer {
  return renderRraTableXlsx(buildPluReportTable(data))
}
