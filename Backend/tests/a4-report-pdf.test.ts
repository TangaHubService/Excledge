import { describe, expect, it, vi } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import PDFDocument from "pdfkit"
import * as XLSX from "xlsx"
import {
  buildDailyReportSummary,
  renderDailyReportA4,
  renderDailyReportXlsx,
  renderPluReportA4,
  renderPluReportXlsx,
} from "../src/services/a4-report-pdf.service"
import { renderRraTablePdf, renderRraTableXlsx, fmtMoney } from "../src/services/rra-report-layout.service"
import type { DailyReportData, PluReportData } from "../src/services/fiscal-report-pdf.service"

const header = {
  orgName: "Configured Taxpayer Ltd",
  tin: "100000000",
  mrcNo: "WIS00000001",
  sdcId: "SDC010000001",
  branchName: "Kigali Central",
  bhfId: "00",
  address: "KN 4 Ave, Kigali, Rwanda",
}

function daily(reportType: "X" | "Z"): DailyReportData {
  return {
    reportType,
    reportDate: "2026-08-30",
    generatedAt: "2026-08-30T18:00:00.000Z",
    periodStart: "2026-08-30T00:00:00.000Z",
    periodEnd: "2026-08-30T23:59:59.999Z",
    previousCloseAt: null,
    coversSinceLastZ: false,
    header,
    counters: { firstRcptNo: 12, lastRcptNo: 47, lastTotalRcptNo: 512, receiptCount: 36, itemCount: 120 },
    summary: {
      normalSalesCount: 34,
      normalRefundsCount: 2,
      grossSalesAmt: 4_500_000,
      grossRefundAmt: 118_000,
      netSalesAmt: 4_382_000,
      totalTaxAmt: 668_440,
      trainingCount: 1,
      trainingAmt: 1_180,
      copyCount: 3,
      copyAmt: 35_400,
      openingDeposit: 50_000,
      proformaCount: 1,
      proformaAmt: 23_600,
      discountTotal: 5_000,
      otherReductionsAmt: 0,
      incompleteSalesCount: 2,
    },
    taxBands: {
      A: { taxableAmt: 200_000, taxAmt: 0, salesAmt: 200_000 },
      B: { taxableAmt: 3_714_000, taxAmt: 668_440, salesAmt: 4_382_440 },
      C: { taxableAmt: 0, taxAmt: 0, salesAmt: 0 },
      D: { taxableAmt: 0, taxAmt: 0, salesAmt: 0 },
    },
    taxRates: { A: 0, B: 18, C: 0, D: 0 },
    refundBands: { B: { taxableAmt: -100_000, taxAmt: -15_254, salesAmt: -118_000 } },
    paymentBreakdown: { CASH: 3_900_000, MOBILE_MONEY: 482_000 },
    refundPaymentBreakdown: { CASH: -118_000 },
    groupTotals: { Dairy: { salesAmt: 4_382_440, refundAmt: -118_000, itemCount: 37 } },
    vsdcConfirmation: reportType === "Z" ? { checked: true, rptDe: "20260830" } : null,
    paymentTaxBreakdown: { CASH: { ns: 594_915.25, nr: 18_000 }, MOBILE_MONEY: { ns: 73_525.42, nr: 0 } },
    copySplit: { cs: 2, cr: 1 },
    trainingSplit: { ts: 1, tr: 0 },
  }
}

function plu(rows = 2): PluReportData {
  return {
    header,
    periodLabel: "2026-08-01 → 2026-08-30",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-30",
    reportLabel: "PRICE LOOK-UP (PLU) REPORT",
    cisDesignation: "CIS",
    generatedAt: "2026-08-30T18:00:00.000Z",
    rows: Array.from({ length: rows }, (_, i) => ({
      itemCd: `RW2CTU00000${String(i + 1).padStart(2, "0")}`,
      productName: `Widget ${i + 1}`,
      unit: "PCS",
      unitPrice: 1_180,
      taxRate: 18,
      quantity: 10 + i,
      revenue: 1_180 * (10 + i),
      taxAmount: 180 * (10 + i),
      remainingQty: 100 - i,
      transactionCount: 3,
    })),
    summary: { uniqueItemCodes: rows, totalQuantity: 180, totalRevenue: 212_400, totalTax: 32_400 },
  }
}

const A4_PORTRAIT = /MediaBox\s*\[\s*0\s+0\s+595\.28\s+841\.89/
const A4_LANDSCAPE = /MediaBox\s*\[\s*0\s+0\s+841\.89\s+595\.28/
const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length

/** Set A4_REPORT_OUT=<dir> to write the rendered samples for a visual check. */
function maybeWrite(name: string, pdf: Buffer) {
  const dir = process.env.A4_REPORT_OUT
  if (dir) writeFileSync(join(dir, name), pdf)
}

async function drawnText(render: () => Promise<Buffer>): Promise<string> {
  const drawn: string[] = []
  const original = PDFDocument.prototype.text
  const spy = vi.spyOn(PDFDocument.prototype, "text").mockImplementation(function (this: any, ...args: any[]) {
    drawn.push(String(args[0]))
    return original.apply(this, args as any)
  })
  try {
    await render()
  } finally {
    spy.mockRestore()
  }
  return drawn.join("\n")
}

describe("RRA-layout report PDFs", () => {
  it("renders the X report like RRA's portal: banner, identity block, All Transactions", async () => {
    const pdf = await renderDailyReportA4(daily("X"))
    maybeWrite("x-report.pdf", pdf)
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdf.toString("latin1")).toMatch(A4_PORTRAIT)
    const text = await drawnText(() => renderDailyReportA4(daily("X")))
    for (const needle of [
      "X Report",
      "Trade Name: ",
      "Configured Taxpayer Ltd",
      "MRC: ",
      "All Transactions",
      "Description",
      "Amount (RWF)",
      "Total Sales Amount (NS)",
      "4,500,000 RWF",
      "Total Sales Amount by Main Groups",
      "Number of Sales Receipts (NS)",
      "Total Refund Amount (NR)",
      "118,000 RWF",
      "Number of Refund Receipts (NR)",
      "Taxable Amounts",
      "Opening deposit",
      "Number of items sold",
      "Tax Amounts",
      "594,915.25 RWF",
      "CS : 2 | CR : 1",
      "Number of Receipt Copies (CS/CR)",
      "Number of Receipts in Training Mode (TS/TR)",
      "Number of Advance Receipts in Proforma Mode (PS)",
      "Total Sales divided according to means of payment for sales (NS) and refund (NR) receipts",
      "MOBILE MONEY",
      "All discounts",
      "Number of incomplete sales",
      "Other registrations that have reduced the day sales and their amount",
      "All Rights Reserved.",
    ]) {
      expect(text).toContain(needle)
    }
    expect(text).not.toContain("VSDC confirmation")
    expect(pageCount(pdf)).toBe(1)
  })

  it("renders the Z report with the VSDC confirmation", async () => {
    const pdf = await renderDailyReportA4(daily("Z"))
    maybeWrite("z-report.pdf", pdf)
    const text = await drawnText(() => renderDailyReportA4(daily("Z")))
    expect(text).toContain("Z Report")
    expect(text).not.toContain("VSDC confirmation")
    expect(pageCount(pdf)).toBe(1)
  })

  it("has exactly the 16 rows of RRA's X/Z report, with payment grids", () => {
    const spec = buildDailyReportSummary({ ...daily("Z"), copySplit: { cs: 2, cr: 1 }, trainingSplit: { ts: 1, tr: 0 }, paymentTaxBreakdown: { CASH: { ns: 594_915.25, nr: 18_000 } } })
    expect(spec.rows).toHaveLength(16)
    expect(spec.rows.map((r) => r.label).at(-1)).toBe("Other registrations that have reduced the day sales and their amount")
    const tax = spec.rows.find((r) => r.label === "Tax Amounts")
    expect(tax?.grid?.head).toEqual(["Payment", "Amount(NS)", "Amount(NR)"])
    expect(tax?.grid?.rows).toContainEqual(["CASH", "594,915.25 RWF", "18,000.00 RWF"])
    expect(spec.rows.find((r) => r.label.startsWith("Number of Receipt Copies"))?.value).toBe("CS : 2 | CR : 1")
    expect(spec.extraHeader ?? []).toEqual([])
  })

  it("exports the X report to Excel with the same rows", () => {
    const wb = XLSX.read(renderDailyReportXlsx(daily("X")), { type: "buffer" })
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    expect(rows[0][0]).toBe("X Report")
    expect(rows.some((r) => r[0] === "Total Sales Amount (NS)" && r[1] === "4,500,000 RWF")).toBe(true)
  })

  it("renders the PLU report in RRA's landscape table layout and paginates", async () => {
    const short = await renderPluReportA4(plu(2))
    maybeWrite("plu-report.pdf", short)
    expect(short.toString("latin1")).toMatch(A4_LANDSCAPE)
    expect(pageCount(short)).toBe(1)
    const text = await drawnText(() => renderPluReportA4(plu(2)))
    for (const needle of ["PLU REPORT", "Configured Taxpayer Ltd", "TIN: 100000000", "Date: 2026-08-01 - 2026-08-30", "Item Name", "Remain Quantity", "Generated on: "]) {
      expect(text).toContain(needle)
    }
    const long = await renderPluReportA4(plu(90))
    expect(pageCount(long)).toBeGreaterThan(1)
    const longText = await drawnText(() => renderPluReportA4(plu(90)))
    expect(longText).toMatch(/Page 2 of \d/)
    expect((longText.match(/Remain Quantity/g) ?? []).length).toBe(pageCount(long))
  })

  it("exports the PLU report to Excel with numeric cells", () => {
    const wb = XLSX.read(renderPluReportXlsx(plu(3)), { type: "buffer" })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })
    const head = rows.findIndex((r) => r[0] === "No")
    expect(rows[head]).toEqual(["No", "Item Name", "Item Code", "Unit Price", "Tax Rate", "Sold Quantity", "Remain Quantity"])
    expect(rows[head + 1][3]).toBe(1180)
  })

  it("renders a totals row and journal appendix", async () => {
    const report = {
      title: "SALES REPORT",
      orgName: header.orgName,
      tin: header.tin,
      period: "2026-08-01 - 2026-08-30",
      columns: [
        { label: "#", width: 0.5 },
        { label: "Items", width: 3 },
        { label: "Total Amount", width: 1.5, format: fmtMoney, numFmt: "#,##0.00" },
      ],
      rows: [[1, "GYM (Session) x 1\nSwim x 2", 4000]],
      totals: { label: "Total Sales", span: 2, values: [4000] },
      appendix: { title: "Journal Records", records: [{ caption: "NS 1/1", lines: Array.from({ length: 120 }, (_, i) => `LINE ${i}`) }] },
      subject: "test",
    }
    const pdf = await renderRraTablePdf(report)
    maybeWrite("sales-sample.pdf", pdf)
    expect(pdf.toString("latin1")).toMatch(A4_LANDSCAPE)
    expect(pageCount(pdf)).toBeGreaterThan(1)
    const text = await drawnText(() => renderRraTablePdf(report))
    expect(text).toContain("Total Sales")
    expect(text).toContain("4,000.00")
    const wb = XLSX.read(renderRraTableXlsx(report), { type: "buffer" })
    expect(wb.SheetNames).toHaveLength(2)
  })
})
