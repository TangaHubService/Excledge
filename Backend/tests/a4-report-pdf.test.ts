import { describe, expect, it, vi } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import PDFDocument from "pdfkit"
import {
  buildDailyReportA4,
  renderA4Report,
  renderDailyReportA4,
  renderPluReportA4,
} from "../src/services/a4-report-pdf.service"
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

describe("A4 report PDFs", () => {
  it("renders the X daily report on A4 with every Art. 18 section", async () => {
    const pdf = await renderDailyReportA4(daily("X"))
    maybeWrite("x-report.pdf", pdf)
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
    expect(pdf.toString("latin1")).toMatch(A4_PORTRAIT)
    const text = await drawnText(() => renderDailyReportA4(daily("X")))
    for (const needle of [
      "X DAILY REPORT",
      "TIN: 100000000",
      "RECEIPT COUNTERS",
      "Normal sales",
      "Normal refunds",
      "TAXABLE AMOUNTS AND TAX PER RATE",
      "MEANS OF PAYMENT",
      "SALES PER MAIN GROUP",
      "Opening deposit",
      "Receipt copies",
      "Training mode receipts",
      "Advance (proforma) receipts",
      "All discounts",
      "Incomplete sales",
      "Page 1 of 1",
    ]) {
      expect(text).toContain(needle)
    }
    expect(text).not.toContain("VSDC confirmation")
  })

  it("renders the Z daily report with the VSDC confirmation", async () => {
    const pdf = await renderDailyReportA4(daily("Z"))
    maybeWrite("z-report.pdf", pdf)
    const text = await drawnText(() => renderDailyReportA4(daily("Z")))
    expect(text).toContain("Z DAILY REPORT")
    expect(text).toContain("VSDC confirmation")
    expect(text).toContain("Confirmed by VSDC for 30/08/2026")
    expect(pageCount(pdf)).toBe(1)
  })

  it("prints band B always and 0% bands only when used (Art. 7.22/7.23)", () => {
    const spec = buildDailyReportA4(daily("X"))
    const bands = spec.blocks.find((b) => b.kind === "table" && b.heading === "Taxable amounts and tax per rate")
    expect(bands && bands.kind === "table" && bands.rows.map((r) => r[0])).toEqual(["A", "B"])
  })

  it("renders the PLU report on A4 and paginates long item lists", async () => {
    const short = await renderPluReportA4(plu(2))
    maybeWrite("plu-report.pdf", await renderPluReportA4(plu(90)))
    expect(short.toString("latin1")).toMatch(A4_PORTRAIT)
    expect(pageCount(short)).toBe(1)
    const long = await renderPluReportA4(plu(90))
    expect(pageCount(long)).toBeGreaterThan(1)
    const text = await drawnText(() => renderPluReportA4(plu(90)))
    expect(text).toMatch(/Page 2 of \d/)
    // The table header repeats on every page.
    expect((text.match(/Remaining stock/g) ?? []).length).toBe(pageCount(long))
  })

  it("renders landscape table reports and journal text blocks", async () => {
    const pdf = await renderA4Report({
      title: "ELECTRONIC JOURNAL",
      header,
      landscape: true,
      meta: [["From", "2026-08-01"]],
      subject: "test",
      blocks: [
        { kind: "table", heading: "Index", columns: [{ label: "A", width: 1 }, { label: "B", width: 1, align: "right" }], rows: [["x", "1"]] },
        { kind: "text", heading: "Journal records", caption: "NS 1/1", lines: Array.from({ length: 120 }, (_, i) => `LINE ${i}`) },
      ],
    })
    maybeWrite("journal-sample.pdf", pdf)
    expect(pdf.toString("latin1")).toMatch(A4_LANDSCAPE)
    expect(pageCount(pdf)).toBeGreaterThan(1)
  })
})
