import PDFDocument from "pdfkit"
import { formatInvoiceAmount, formatInvoiceDateTime, formatInvoiceQuantity } from "./invoice-format.service"
import { getRraCertificationLogo } from "./invoice-logo.service"
import { SYSTEM_FOOTER, CIS_VERSION_LABEL } from "./system-branding.service"

/**
 * Thermal-roll (80 mm) renderers for the fiscal reports the RRA certification
 * process asks for alongside the receipts:
 *   - Daily X / Z report (RRA CIS/VSDC spec §6 / Articles 7, 18, 19)
 *   - PLU (Price Look-Up) report (Article 21)
 *
 * Both share the layout language of invoice-receipt-pdf.service.ts so a
 * certified thermal printer produces a consistent-looking strip of paper for
 * every fiscal document.
 */

const PAGE_WIDTH = 226.77
const MARGIN = 10
const CONTENT_LEFT = MARGIN
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const FONT = "Courier"
const FONT_BOLD = "Courier-Bold"
const MEASURE_HEIGHT = 6000

export interface FiscalReportHeader {
  orgName: string
  tin: string | null
  mrcNo: string | null
  sdcId: string | null
  branchName: string | null
  bhfId: string | null
  address: string | null
}

export interface DailyReportData {
  reportType: "X" | "Z"
  reportDate: string
  generatedAt: string
  periodStart: string
  periodEnd: string
  header: FiscalReportHeader
  counters: {
    firstRcptNo: number | null
    lastRcptNo: number | null
    lastTotalRcptNo: number | null
    receiptCount: number
    itemCount: number
  }
  summary: {
    normalSalesCount: number
    normalRefundsCount: number
    grossSalesAmt: number
    grossRefundAmt: number
    netSalesAmt: number
    totalTaxAmt: number
    trainingCount: number
    trainingAmt: number
    copyCount: number
    copyAmt: number
  }
  taxBands: Record<string, { taxableAmt: number; taxAmt: number; salesAmt: number }>
  taxRates: Record<string, number>
  paymentBreakdown: Record<string, number>
  vsdcConfirmation: { checked: boolean; rptDe?: string; error?: string } | null
}

export interface PluReportData {
  header: FiscalReportHeader
  periodLabel: string
  generatedAt: string
  rows: Array<{
    itemCd: string
    productName: string
    unit: string
    quantity: number
    revenue: number
    taxAmount: number
    transactionCount: number
  }>
  summary: { uniqueItemCodes: number; totalQuantity: number; totalRevenue: number; totalTax: number }
}

function safe(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim()
  return text || fallback
}

function dashed(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(CONTENT_LEFT, y).lineTo(CONTENT_RIGHT, y).dash(1.5, { space: 1.2 }).stroke().undash()
}

function centered(doc: PDFKit.PDFDocument, text: string, y: number, bold = false, size = 6.4): number {
  doc.font(bold ? FONT_BOLD : FONT).fontSize(size)
  doc.text(text, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" })
  return y + doc.heightOfString(text, { width: CONTENT_WIDTH }) + 1
}

function pair(doc: PDFKit.PDFDocument, label: string, value: string, y: number, bold = false): number {
  doc.font(bold ? FONT_BOLD : FONT).fontSize(6.2)
  doc.text(label, CONTENT_LEFT, y, { width: CONTENT_WIDTH * 0.58, align: "left" })
  doc.text(value, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "right" })
  return y + Math.max(doc.heightOfString(label, { width: CONTENT_WIDTH * 0.58 }), 8) + 1
}

function line(doc: PDFKit.PDFDocument, text: string, y: number, size = 6.2): number {
  doc.font(FONT).fontSize(size)
  doc.text(text, CONTENT_LEFT, y, { width: CONTENT_WIDTH })
  return y + doc.heightOfString(text, { width: CONTENT_WIDTH }) + 1
}

function drawHeader(doc: PDFKit.PDFDocument, header: FiscalReportHeader, logo: Buffer | null, startY: number): number {
  let y = startY
  if (logo) {
    try {
      doc.image(logo, PAGE_WIDTH / 2 - 20, y, { fit: [40, 40], align: "center" })
      y += 44
    } catch {
      /* logo is best-effort */
    }
  }
  y = centered(doc, safe(header.orgName, "—"), y, true, 7.5)
  if (header.branchName) y = centered(doc, safe(header.branchName), y)
  if (header.address) y = centered(doc, safe(header.address), y)
  y = centered(doc, `TIN: ${safe(header.tin, "-")}`, y)
  if (header.mrcNo) y = centered(doc, `MRC: ${safe(header.mrcNo)}`, y)
  if (header.sdcId) y = centered(doc, `SDC ID: ${safe(header.sdcId)}`, y)
  if (header.bhfId) y = centered(doc, `BHF ID: ${safe(header.bhfId)}`, y)
  return y
}

// ──────────────────────────────────────────────────────────────
// Daily X / Z report
// ──────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "CASH",
  CREDIT_CARD: "CARD",
  MOBILE_MONEY: "MOBILE MONEY",
  BANK: "BANK",
  INSURANCE: "INSURANCE",
  DEBT: "CREDIT",
  MIXED: "MIXED",
}

function drawDailyReport(doc: PDFKit.PDFDocument, data: DailyReportData, logo: Buffer | null, startY: number): number {
  let y = drawHeader(doc, data.header, logo, startY)

  y += 2
  dashed(doc, y)
  y += 4
  const title = data.reportType === "Z" ? "Z DAILY REPORT (CLOSING)" : "X DAILY REPORT (INTERIM)"
  y = centered(doc, title, y, true, 8)
  y = centered(doc, "THIS IS NOT AN OFFICIAL FISCAL RECEIPT", y, false, 5.4)
  y += 2
  dashed(doc, y)
  y += 4

  const gen = formatInvoiceDateTime(data.generatedAt)
  y = line(doc, `REPORT DATE : ${data.reportDate}`, y)
  y = line(doc, `PRINTED     : ${gen.date} ${gen.time}`, y)
  y = line(doc, `SOFTWARE    : ${CIS_VERSION_LABEL.replace(/^Software version:\s*/i, "")}`, y)

  y += 2
  dashed(doc, y)
  y += 4
  y = centered(doc, "RECEIPT COUNTERS", y, true)
  y = pair(doc, "First receipt no.", data.counters.firstRcptNo != null ? String(data.counters.firstRcptNo) : "-", y)
  y = pair(doc, "Last receipt no.", data.counters.lastRcptNo != null ? String(data.counters.lastRcptNo) : "-", y)
  y = pair(doc, "Total receipts (B)", data.counters.lastTotalRcptNo != null ? String(data.counters.lastTotalRcptNo) : "-", y)
  y = pair(doc, "Receipts this report", String(data.counters.receiptCount), y)
  y = pair(doc, "Items sold (lines)", String(data.counters.itemCount), y)

  y += 2
  dashed(doc, y)
  y += 4
  y = centered(doc, "SALES SUMMARY", y, true)
  y = pair(doc, `Normal sales (${data.summary.normalSalesCount})`, formatInvoiceAmount(data.summary.grossSalesAmt), y)
  y = pair(doc, `Normal refunds (${data.summary.normalRefundsCount})`, `-${formatInvoiceAmount(data.summary.grossRefundAmt)}`, y)
  y = pair(doc, "NET SALES", formatInvoiceAmount(data.summary.netSalesAmt), y, true)
  y = pair(doc, "TOTAL TAX", formatInvoiceAmount(data.summary.totalTaxAmt), y, true)

  y += 2
  dashed(doc, y)
  y += 4
  y = centered(doc, "TAX BANDS", y, true)
  // §48: band B (statutory rate > 0) always prints. §49: A/C/D print only when used.
  const order = ["A", "B", "C", "D"]
  for (const code of order) {
    const band = data.taxBands[code] ?? { taxableAmt: 0, taxAmt: 0, salesAmt: 0 }
    const rate = data.taxRates[code] ?? 0
    const used = band.salesAmt !== 0 || band.taxAmt !== 0
    if (code !== "B" && !used) continue
    y = pair(doc, `${code}-${formatInvoiceQuantity(rate)}% taxable`, formatInvoiceAmount(band.taxableAmt), y)
    y = pair(doc, `${code}-${formatInvoiceQuantity(rate)}% tax`, formatInvoiceAmount(band.taxAmt), y)
  }

  y += 2
  dashed(doc, y)
  y += 4
  y = centered(doc, "PAYMENT METHODS", y, true)
  const payEntries = Object.entries(data.paymentBreakdown)
  if (!payEntries.length) {
    y = line(doc, "(none)", y)
  } else {
    for (const [method, amount] of payEntries) {
      y = pair(doc, PAYMENT_LABELS[method] ?? method, formatInvoiceAmount(amount), y)
    }
  }

  y += 2
  dashed(doc, y)
  y += 4
  y = centered(doc, "NON-FISCAL COUNTS", y, true)
  y = pair(doc, `Training receipts (${data.summary.trainingCount})`, formatInvoiceAmount(data.summary.trainingAmt), y)
  y = pair(doc, `Copy receipts (${data.summary.copyCount})`, formatInvoiceAmount(data.summary.copyAmt), y)

  if (data.reportType === "Z") {
    y += 2
    dashed(doc, y)
    y += 4
    y = centered(doc, "VSDC Z CONFIRMATION", y, true)
    if (!data.vsdcConfirmation) {
      y = line(doc, "Not checked (EBM disabled)", y)
    } else if (data.vsdcConfirmation.error) {
      y = line(doc, safe(data.vsdcConfirmation.error), y, 5.6)
    } else {
      y = line(doc, `Confirmed by VSDC for ${safe(data.vsdcConfirmation.rptDe)}`, y)
    }
  }

  y += 3
  dashed(doc, y)
  y += 4
  y = centered(doc, safe(SYSTEM_FOOTER), y, false, 4.6)
  return y
}

// ──────────────────────────────────────────────────────────────
// PLU report
// ──────────────────────────────────────────────────────────────

function drawPluReport(doc: PDFKit.PDFDocument, data: PluReportData, logo: Buffer | null, startY: number): number {
  let y = drawHeader(doc, data.header, logo, startY)

  y += 2
  dashed(doc, y)
  y += 4
  y = centered(doc, "PLU REPORT", y, true, 8)
  y = centered(doc, "THIS IS NOT AN OFFICIAL FISCAL RECEIPT", y, false, 5.4)
  y += 2
  dashed(doc, y)
  y += 4
  const gen = formatInvoiceDateTime(data.generatedAt)
  y = line(doc, `PERIOD  : ${data.periodLabel}`, y)
  y = line(doc, `PRINTED : ${gen.date} ${gen.time}`, y)
  y = line(doc, `SOFTWARE: ${CIS_VERSION_LABEL.replace(/^Software version:\s*/i, "")}`, y)

  y += 2
  dashed(doc, y)
  y += 4

  for (const row of data.rows) {
    y = line(doc, safe(row.productName, "-"), y, 6.3)
    y = line(doc, `  ${safe(row.itemCd, "-")}`, y, 5.6)
    y = pair(doc, `  qty ${formatInvoiceQuantity(row.quantity)} ${safe(row.unit)}`, formatInvoiceAmount(row.revenue), y)
    y = pair(doc, `  tax`, formatInvoiceAmount(row.taxAmount), y)
    y += 1
  }

  y += 1
  dashed(doc, y)
  y += 4
  y = centered(doc, "TOTALS", y, true)
  y = pair(doc, "Unique item codes", String(data.summary.uniqueItemCodes), y)
  y = pair(doc, "Total quantity", formatInvoiceQuantity(data.summary.totalQuantity), y)
  y = pair(doc, "Total revenue", formatInvoiceAmount(data.summary.totalRevenue), y, true)
  y = pair(doc, "Total tax", formatInvoiceAmount(data.summary.totalTax), y, true)

  y += 3
  dashed(doc, y)
  y += 4
  y = centered(doc, safe(SYSTEM_FOOTER), y, false, 4.6)
  return y
}

// ──────────────────────────────────────────────────────────────
// Two-pass render (measure → size the page exactly)
// ──────────────────────────────────────────────────────────────

async function renderRoll(
  draw: (doc: PDFKit.PDFDocument, logo: Buffer | null, startY: number) => number,
  subject: string,
): Promise<Buffer> {
  const logo = await getRraCertificationLogo()

  const scratch = new PDFDocument({ autoFirstPage: false, size: [PAGE_WIDTH, MEASURE_HEIGHT], margin: 0 })
  scratch.on("data", () => {})
  scratch.addPage({ size: [PAGE_WIDTH, MEASURE_HEIGHT], margin: 0 })
  const measuredHeight = draw(scratch, logo, MARGIN)
  scratch.end()

  const pageHeight = Math.ceil(measuredHeight) + MARGIN
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: [PAGE_WIDTH, pageHeight],
    margin: 0,
    compress: true,
    info: { Subject: subject, Creator: "Excel Edge backend fiscal report service", Producer: "PDFKit" },
  })

  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  doc.addPage({ size: [PAGE_WIDTH, pageHeight], margin: 0 })
  draw(doc, logo, MARGIN)
  doc.end()
  return output
}

export function renderDailyReportPdf(data: DailyReportData): Promise<Buffer> {
  return renderRoll((doc, logo, y) => drawDailyReport(doc, data, logo, y), `RRA ${data.reportType} daily report`)
}

export function renderPluReportPdf(data: PluReportData): Promise<Buffer> {
  return renderRoll((doc, logo, y) => drawPluReport(doc, data, logo, y), "RRA PLU report")
}
