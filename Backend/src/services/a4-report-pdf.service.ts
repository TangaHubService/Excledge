import PDFDocument from "pdfkit"
import { formatInvoiceAmount, formatInvoiceDateTime, formatInvoiceQuantity } from "./invoice-format.service"
import { getRraCertificationLogo } from "./invoice-logo.service"
import { SYSTEM_FOOTER, SYSTEM_VERSION } from "./system-branding.service"
import type { DailyReportData, FiscalReportHeader, PluReportData } from "./fiscal-report-pdf.service"

/**
 * A4 renderer for every report the RRA CIS-for-VSDC certification asks for: the daily X / Z
 * report (CIS spec Art. 7.6, 18, 19), the PLU report (Art. 21), and the detailed sales,
 * purchases, stock, items and importation reports plus the electronic journal (application
 * checklist rows 25 and 44, Art. 7.11 / 7.14 / 7.31).
 *
 * Every report shares one layout: RRA logo and taxpayer identity (trade name, TIN, MRC, SDC ID)
 * on the first page, a running header on later pages, tables that repeat their header row across
 * page breaks, and a footer with print time, CIS software version and "Page i of n".
 */

export type A4Align = "left" | "right" | "center"

export interface A4Column {
  label: string
  /** Relative width; the table is scaled to the page's content width. */
  width: number
  align?: A4Align
}

export type A4Block =
  | { kind: "kv"; heading?: string; rows: Array<[string, string]>; columns?: 1 | 2 }
  | {
      kind: "table"
      heading?: string
      columns: A4Column[]
      rows: string[][]
      totals?: string[]
      emptyText?: string
    }
  | { kind: "text"; heading?: string; caption?: string; lines: string[] }
  | { kind: "note"; text: string }

export interface A4ReportSpec {
  title: string
  subtitle?: string
  header: FiscalReportHeader
  /** Label/value pairs printed in the box under the header (period, printed at, …). */
  meta: Array<[string, string]>
  blocks: A4Block[]
  landscape?: boolean
  subject: string
}

const MARGIN = 36
const FOOTER_SPACE = 34
const FONT = "Helvetica"
const FONT_BOLD = "Helvetica-Bold"
const FONT_MONO = "Courier"
const BODY_SIZE = 8
const CELL_PAD_X = 4
const CELL_PAD_Y = 2.8
const INK = "#111827"
const MUTED = "#4b5563"
const RULE = "#9ca3af"
const HEAD_FILL = "#e5e7eb"
const ZEBRA_FILL = "#f6f7f9"
const ACCENT = "#1e3a8a"

export const money = (n: number | null | undefined): string => formatInvoiceAmount(Number(n ?? 0))
export const qty = (n: number | null | undefined): string => formatInvoiceQuantity(Number(n ?? 0))
export const dateTime = (v: string | Date | null | undefined): string => {
  if (!v) return "-"
  const d = formatInvoiceDateTime(v)
  return `${d.date} ${d.time}`
}
const ymdText = (raw: unknown): string => {
  const d = String(raw ?? "").replace(/\D/g, "")
  return d.length >= 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : String(raw ?? "-")
}
const text = (v: unknown, fallback = "-"): string => {
  const s = String(v ?? "").trim()
  return s || fallback
}

class A4Writer {
  readonly doc: PDFKit.PDFDocument
  readonly left = MARGIN
  readonly width: number
  readonly bottom: number
  y = MARGIN

  constructor(
    private readonly spec: A4ReportSpec,
    private readonly logo: Buffer | null,
  ) {
    this.doc = new PDFDocument({
      size: "A4",
      layout: spec.landscape ? "landscape" : "portrait",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      compress: true,
      info: {
        Title: spec.title,
        Subject: spec.subject,
        Author: spec.header.orgName || undefined,
        Creator: "Excledge ERP fiscal report service",
        Producer: "PDFKit",
      },
    })
    this.width = this.doc.page.width - MARGIN * 2
    this.bottom = this.doc.page.height - MARGIN - FOOTER_SPACE
  }

  // Page furniture

  drawFirstHeader(): void {
    const { doc, spec } = this
    const h = spec.header
    const top = MARGIN
    let textLeft = this.left
    if (this.logo) {
      try {
        doc.image(this.logo, this.left, top, { fit: [56, 56] })
        textLeft = this.left + 66
      } catch {
        /* logo is best-effort */
      }
    }
    const idWidth = this.width * 0.55 - (textLeft - this.left)
    let y = top
    doc.fillColor(INK).font(FONT_BOLD).fontSize(13).text(text(h.orgName), textLeft, y, { width: idWidth })
    y = doc.y + 1
    doc.font(FONT).fontSize(8.5).fillColor(MUTED)
    const idLines = [
      h.branchName ? `Branch: ${h.branchName}${h.bhfId ? ` (BHF ${h.bhfId})` : ""}` : h.bhfId ? `BHF ID: ${h.bhfId}` : null,
      h.address,
      `TIN: ${text(h.tin)}`,
      `MRC: ${text(h.mrcNo)}    SDC ID: ${text(h.sdcId)}`,
    ].filter(Boolean) as string[]
    for (const l of idLines) {
      doc.text(l, textLeft, y, { width: idWidth })
      y = doc.y
    }
    const leftBottom = Math.max(y, this.logo ? top + 58 : y)

    // Title block, right-aligned.
    const titleLeft = this.left + this.width * 0.55
    const titleWidth = this.width * 0.45
    doc.fillColor(ACCENT).font(FONT_BOLD).fontSize(15).text(spec.title, titleLeft, top, { width: titleWidth, align: "right" })
    let ty = doc.y + 1
    if (spec.subtitle) {
      doc.fillColor(MUTED).font(FONT).fontSize(8.5).text(spec.subtitle, titleLeft, ty, { width: titleWidth, align: "right" })
      ty = doc.y
    }
    doc.fillColor(MUTED).font(FONT).fontSize(7).text("Report — not a fiscal receipt", titleLeft, ty + 2, { width: titleWidth, align: "right" })
    ty = doc.y

    this.y = Math.max(leftBottom, ty) + 8
    doc.moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).lineWidth(1.2).strokeColor(ACCENT).stroke()
    this.y += 8

    this.drawMeta()
  }

  private drawMeta(): void {
    const { doc } = this
    const meta = this.spec.meta
    if (!meta.length) return
    const cols = this.spec.landscape ? 3 : 2
    const colW = this.width / cols
    const labelW = colW * 0.42
    const rowsNeeded = Math.ceil(meta.length / cols)
    const start = this.y
    let maxY = start
    for (let r = 0; r < rowsNeeded; r++) {
      let rowBottom = this.y
      for (let c = 0; c < cols; c++) {
        const item = meta[r * cols + c]
        if (!item) continue
        const x = this.left + c * colW
        doc.font(FONT_BOLD).fontSize(BODY_SIZE).fillColor(MUTED).text(item[0], x + 6, this.y + 3, { width: labelW - 6 })
        const lb = doc.y
        doc.font(FONT).fontSize(BODY_SIZE).fillColor(INK).text(item[1], x + labelW, this.y + 3, { width: colW - labelW - 6 })
        rowBottom = Math.max(rowBottom, lb, doc.y)
      }
      this.y = rowBottom + 1
      maxY = this.y
    }
    doc.rect(this.left, start, this.width, maxY - start + 3).lineWidth(0.6).strokeColor(RULE).stroke()
    this.y = maxY + 12
  }

  private drawRunningHeader(): void {
    const { doc, spec } = this
    doc.font(FONT_BOLD).fontSize(9).fillColor(INK).text(text(spec.header.orgName), this.left, MARGIN, { width: this.width * 0.6 })
    doc.font(FONT).fontSize(8).fillColor(MUTED).text(`TIN ${text(spec.header.tin)}`, this.left, doc.y, { width: this.width * 0.6 })
    doc.font(FONT_BOLD).fontSize(9).fillColor(ACCENT).text(spec.title, this.left + this.width * 0.4, MARGIN, { width: this.width * 0.6, align: "right" })
    const y = MARGIN + 24
    doc.moveTo(this.left, y).lineTo(this.left + this.width, y).lineWidth(0.6).strokeColor(RULE).stroke()
    this.y = y + 8
  }

  newPage(): void {
    this.doc.addPage()
    this.drawRunningHeader()
  }

  ensure(height: number): void {
    if (this.y + height > this.bottom) this.newPage()
  }

  drawFooters(printedAt: string): void {
    const { doc } = this
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      // Writing below the bottom margin would otherwise trigger an automatic page break.
      const savedBottom = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      const y = doc.page.height - MARGIN - 18
      doc.moveTo(this.left, y - 4).lineTo(this.left + this.width, y - 4).lineWidth(0.5).strokeColor(RULE).stroke()
      doc.font(FONT).fontSize(7).fillColor(MUTED)
      doc.text(`Printed ${printedAt}  ·  CIS software version v${SYSTEM_VERSION}`, this.left, y, { width: this.width * 0.7, lineBreak: false })
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, this.left + this.width * 0.7, y, { width: this.width * 0.3, align: "right", lineBreak: false })
      doc.fontSize(6.5).text(SYSTEM_FOOTER, this.left, y + 10, { width: this.width, align: "center", lineBreak: false })
      doc.page.margins.bottom = savedBottom
    }
  }

  // Blocks

  heading(label: string): void {
    const { doc } = this
    this.ensure(44)
    doc.font(FONT_BOLD).fontSize(10).fillColor(ACCENT).text(label.toUpperCase(), this.left, this.y, { width: this.width })
    this.y = doc.y + 2
    doc.moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).lineWidth(0.6).strokeColor(ACCENT).stroke()
    this.y += 4
  }

  table(columns: A4Column[], rows: string[][], opts: { totals?: string[]; showHeader?: boolean; emptyText?: string; boldFirstCol?: boolean } = {}): void {
    const { doc } = this
    const showHeader = opts.showHeader !== false
    const totalWeight = columns.reduce((s, c) => s + c.width, 0)
    const widths = columns.map((c) => (c.width / totalWeight) * this.width)
    const xs: number[] = []
    widths.reduce((x, w) => (xs.push(x), x + w), this.left)

    const measureRow = (cells: string[], bold: boolean): number => {
      doc.font(bold ? FONT_BOLD : FONT).fontSize(BODY_SIZE)
      let h = 0
      cells.forEach((cell, i) => {
        h = Math.max(h, doc.heightOfString(cell ?? "", { width: widths[i] - CELL_PAD_X * 2 }))
      })
      return h + CELL_PAD_Y * 2
    }

    const drawRow = (cells: string[], kind: "head" | "body" | "zebra" | "total", boldCols: Set<number> = new Set()): void => {
      const bold = kind === "head" || kind === "total"
      const h = measureRow(cells, bold)
      if (kind === "head") doc.rect(this.left, this.y, this.width, h).fill(HEAD_FILL)
      if (kind === "zebra") doc.rect(this.left, this.y, this.width, h).fill(ZEBRA_FILL)
      if (kind === "total") {
        doc.moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).lineWidth(0.9).strokeColor(INK).stroke()
      }
      cells.forEach((cell, i) => {
        doc
          .font(bold || boldCols.has(i) ? FONT_BOLD : FONT)
          .fontSize(BODY_SIZE)
          .fillColor(kind === "head" ? INK : INK)
          .text(cell ?? "", xs[i] + CELL_PAD_X, this.y + CELL_PAD_Y, {
            width: widths[i] - CELL_PAD_X * 2,
            align: columns[i].align ?? "left",
          })
      })
      this.y += h
      if (kind !== "head") {
        doc.moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).lineWidth(0.3).strokeColor("#d1d5db").stroke()
      }
    }

    const head = columns.map((c) => c.label)
    const headH = showHeader ? measureRow(head, true) : 0
    const firstH = rows.length ? measureRow(rows[0], false) : 16
    this.ensure(headH + firstH)
    if (showHeader) drawRow(head, "head")

    if (!rows.length) {
      doc.font(FONT).fontSize(BODY_SIZE).fillColor(MUTED).text(opts.emptyText ?? "No records for this period.", this.left + CELL_PAD_X, this.y + CELL_PAD_Y, { width: this.width - CELL_PAD_X * 2 })
      this.y = doc.y + CELL_PAD_Y
    }

    const boldCols = opts.boldFirstCol ? new Set([0]) : undefined
    rows.forEach((row, idx) => {
      const h = measureRow(row, false)
      if (this.y + h > this.bottom) {
        this.newPage()
        if (showHeader) drawRow(head, "head")
      }
      drawRow(row, idx % 2 === 1 ? "zebra" : "body", boldCols)
    })

    if (opts.totals) {
      this.ensure(measureRow(opts.totals, true))
      drawRow(opts.totals, "total")
    }
    this.y += 10
  }

  kv(rows: Array<[string, string]>, columns: 1 | 2): void {
    if (columns === 2) {
      const packed: string[][] = []
      for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i]
        const b = rows[i + 1] ?? ["", ""]
        packed.push([a[0], a[1], b[0], b[1]])
      }
      this.table(
        [
          { label: "", width: 3 },
          { label: "", width: 2, align: "right" },
          { label: "", width: 3 },
          { label: "", width: 2, align: "right" },
        ],
        packed,
        { showHeader: false },
      )
    } else {
      this.table([{ label: "", width: 3 }, { label: "", width: 2, align: "right" }], rows, { showHeader: false })
    }
  }

  textBlock(lines: string[], caption?: string): void {
    const { doc } = this
    const lineH = 9
    const pad = 5
    const needed = Math.min(lines.length, 6) * lineH + pad * 2 + (caption ? 12 : 0)
    this.ensure(needed)
    if (caption) {
      doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK).text(caption, this.left, this.y, { width: this.width })
      this.y = doc.y + 2
    }
    let boxTop = this.y
    this.y += pad
    const closeBox = () => {
      doc.rect(this.left, boxTop, this.width, this.y + pad - boxTop).lineWidth(0.5).strokeColor(RULE).stroke()
    }
    doc.font(FONT_MONO).fontSize(7.5).fillColor(INK)
    for (const raw of lines) {
      const l = raw.replace(/\t/g, "    ")
      const h = Math.max(doc.heightOfString(l || " ", { width: this.width - pad * 2 }), lineH)
      if (this.y + h + pad > this.bottom) {
        closeBox()
        this.newPage()
        boxTop = this.y
        this.y += pad
        doc.font(FONT_MONO).fontSize(7.5).fillColor(INK)
      }
      doc.text(l || " ", this.left + pad, this.y, { width: this.width - pad * 2 })
      this.y += h
    }
    closeBox()
    this.y += pad + 10
  }

  note(t: string): void {
    const { doc } = this
    doc.font(FONT).fontSize(7.5)
    this.ensure(doc.heightOfString(t, { width: this.width }) + 6)
    doc.fillColor(MUTED).text(t, this.left, this.y, { width: this.width })
    this.y = doc.y + 8
  }
}

export async function renderA4Report(spec: A4ReportSpec): Promise<Buffer> {
  const logo = await getRraCertificationLogo().catch(() => null)
  const w = new A4Writer(spec, logo)
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    w.doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    w.doc.on("end", () => resolve(Buffer.concat(chunks)))
    w.doc.on("error", reject)
  })

  w.drawFirstHeader()
  for (const block of spec.blocks) {
    if (block.kind === "note") {
      w.note(block.text)
      continue
    }
    if (block.heading) w.heading(block.heading)
    if (block.kind === "kv") w.kv(block.rows, block.columns ?? 2)
    else if (block.kind === "table") w.table(block.columns, block.rows, { totals: block.totals, emptyText: block.emptyText })
    else w.textBlock(block.lines, block.caption)
  }
  w.drawFooters(dateTime(new Date()))
  w.doc.end()
  return output
}

// Daily X / Z report (CIS spec Art. 18 / 19)

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  BANK: "Bank / cheque",
  INSURANCE: "Insurance",
  DEBT: "Credit",
  MIXED: "Mixed",
}

export function buildDailyReportA4(data: DailyReportData): A4ReportSpec {
  const isZ = data.reportType === "Z"
  const s = data.summary
  const meta: Array<[string, string]> = [
    ["Report", isZ ? "Z daily report (closing)" : "X daily report (interim)"],
    ["Report date", data.reportDate],
    ["Period from", dateTime(data.periodStart)],
    ["Period to", dateTime(data.periodEnd)],
    ["CIS designation", `Excledge ERP v${SYSTEM_VERSION}`],
    ["Generated", dateTime(data.generatedAt)],
  ]
  if (isZ) {
    const c = data.vsdcConfirmation
    meta.push([
      "VSDC confirmation",
      !c
        ? "Not checked (EBM disabled)"
        : c.error && c.savedAt
          ? `Saved at VSDC ${dateTime(c.savedAt)}; RRA confirmation pending`
          : c.error
            ? c.error
            : `Confirmed by VSDC for ${ymdText(c.rptDe)}`,
    ])
  }
  if (data.coversSinceLastZ && data.previousCloseAt) {
    meta.push(["Covers since last Z", dateTime(data.previousCloseAt)])
  }

  const order = ["A", "B", "C", "D"]
  const zeroBand = { taxableAmt: 0, taxAmt: 0, salesAmt: 0 }
  const refundBands = data.refundBands ?? {}
  const bandRows: string[][] = []
  const tot = { st: 0, sx: 0, rt: 0, rx: 0 }
  for (const code of order) {
    const sb = data.taxBands[code] ?? zeroBand
    const rb = refundBands[code] ?? zeroBand
    const used = sb.salesAmt !== 0 || sb.taxAmt !== 0 || rb.salesAmt !== 0 || rb.taxAmt !== 0
    // Art. 7.22/7.23: a rate > 0 (B) always prints; 0% rates print only when used.
    if (code !== "B" && !used) continue
    const rate = data.taxRates[code] ?? 0
    bandRows.push([code, `${qty(rate)}%`, money(sb.taxableAmt), money(sb.taxAmt), money(rb.taxableAmt), money(rb.taxAmt)])
    tot.st += sb.taxableAmt
    tot.sx += sb.taxAmt
    tot.rt += rb.taxableAmt
    tot.rx += rb.taxAmt
  }

  const payKeys = Array.from(new Set([...Object.keys(data.paymentBreakdown ?? {}), ...Object.keys(data.refundPaymentBreakdown ?? {})]))
  let paySales = 0
  let payRefunds = 0
  const payRows = payKeys.map((k) => {
    const sv = data.paymentBreakdown?.[k] ?? 0
    const rv = data.refundPaymentBreakdown?.[k] ?? 0
    paySales += sv
    payRefunds += rv
    return [PAYMENT_LABELS[k] ?? k, money(sv), money(rv)]
  })

  const groupEntries = Object.entries(data.groupTotals ?? {})

  const blocks: A4Block[] = [
    {
      kind: "kv",
      heading: "Receipt counters",
      rows: [
        ["First receipt number", data.counters.firstRcptNo != null ? String(data.counters.firstRcptNo) : "-"],
        ["Last receipt number", data.counters.lastRcptNo != null ? String(data.counters.lastRcptNo) : "-"],
        ["Total receipt counter (B)", data.counters.lastTotalRcptNo != null ? String(data.counters.lastTotalRcptNo) : "-"],
        ["Receipts in this report", String(data.counters.receiptCount)],
        ["Number of items sold", qty(data.counters.itemCount)],
        ["Opening deposit", money(s.openingDeposit)],
      ],
    },
    {
      kind: "table",
      heading: "Sales and refunds",
      columns: [
        { label: "Receipt type", width: 4 },
        { label: "Label", width: 1.2, align: "center" },
        { label: "Number of receipts", width: 2, align: "right" },
        { label: "Amount incl. tax", width: 2.4, align: "right" },
      ],
      rows: [
        ["Normal sales", "NS", String(s.normalSalesCount), money(s.grossSalesAmt)],
        ["Normal refunds", "NR", String(s.normalRefundsCount), `-${money(s.grossRefundAmt)}`],
      ],
      totals: ["Net sales", "", String(s.normalSalesCount + s.normalRefundsCount), money(s.netSalesAmt)],
    },
    {
      kind: "table",
      heading: "Taxable amounts and tax per rate",
      columns: [
        { label: "Tax label", width: 1.2, align: "center" },
        { label: "Rate", width: 1.2, align: "right" },
        { label: "Sales (NS) taxable", width: 2.4, align: "right" },
        { label: "Sales (NS) tax", width: 2.2, align: "right" },
        { label: "Refunds (NR) taxable", width: 2.4, align: "right" },
        { label: "Refunds (NR) tax", width: 2.2, align: "right" },
      ],
      rows: bandRows,
      totals: ["Total", "", money(tot.st), money(tot.sx), money(tot.rt), money(tot.rx)],
    },
    {
      kind: "table",
      heading: "Means of payment",
      columns: [
        { label: "Means of payment", width: 4 },
        { label: "Sales (NS)", width: 2.5, align: "right" },
        { label: "Refunds (NR)", width: 2.5, align: "right" },
      ],
      rows: payRows,
      totals: ["Total", money(paySales), money(payRefunds)],
      emptyText: "No payments in this period.",
    },
  ]

  if (groupEntries.length) {
    blocks.push({
      kind: "table",
      heading: "Sales per main group",
      columns: [
        { label: "Main group", width: 4 },
        { label: "Items", width: 1.5, align: "right" },
        { label: "Sales (NS)", width: 2.5, align: "right" },
        { label: "Refunds (NR)", width: 2.5, align: "right" },
      ],
      rows: groupEntries.map(([g, v]) => [text(g, "Uncategorized"), qty(v.itemCount), money(v.salesAmt), money(v.refundAmt)]),
    })
  }

  blocks.push({
    kind: "table",
    heading: "Copies, training, proforma and other registrations",
    columns: [
      { label: "Registration", width: 4.5 },
      { label: "Label", width: 1.2, align: "center" },
      { label: "Count", width: 1.5, align: "right" },
      { label: "Amount incl. tax", width: 2.4, align: "right" },
    ],
    rows: [
      ["Receipt copies", "CS / CR", String(s.copyCount), money(s.copyAmt)],
      ["Training mode receipts", "TS / TR", String(s.trainingCount), money(s.trainingAmt)],
      ["Advance (proforma) receipts", "PS", String(s.proformaCount), money(s.proformaAmt)],
      ["All discounts", "", "", money(s.discountTotal)],
      ["Other registrations that reduced sales (voids)", "", "", money(s.otherReductionsAmt)],
      ["Incomplete sales", "", String(s.incompleteSalesCount), ""],
    ],
  })

  blocks.push({
    kind: "note",
    text: data.coversSinceLastZ
      ? "No Z report was closed for the preceding day(s); per CIS spec Art. 20 this report covers the entire period since the previous Z report."
      : isZ
        ? "Z daily report: summary of all registrations for the day (00:00:00 – 23:59:59). Business and accounting record."
        : "X daily report: summary of sales since the end of the previous Z report.",
  })

  return {
    title: isZ ? "Z DAILY REPORT" : "X DAILY REPORT",
    subtitle: isZ ? "End-of-day closing" : "Interim — since last Z",
    header: data.header,
    meta,
    blocks,
    subject: `RRA ${data.reportType} daily report`,
  }
}

export function renderDailyReportA4(data: DailyReportData): Promise<Buffer> {
  return renderA4Report(buildDailyReportA4(data))
}

// PLU report (CIS spec Art. 21)

export function buildPluReportA4(data: PluReportData): A4ReportSpec {
  return {
    title: "PLU REPORT",
    subtitle: data.reportLabel,
    header: data.header,
    meta: [
      ["Period", data.periodLabel],
      ["From", text(data.periodStart)],
      ["To", text(data.periodEnd)],
      ["CIS designation", `${data.cisDesignation} — Excledge ERP v${SYSTEM_VERSION}`],
      ["Generated", dateTime(data.generatedAt)],
      ["Item codes", String(data.summary.uniqueItemCodes)],
    ],
    blocks: [
      {
        kind: "table",
        heading: "Items sold",
        columns: [
          { label: "Item code", width: 2.6 },
          { label: "Item name", width: 3.6 },
          { label: "Unit price", width: 1.7, align: "right" },
          { label: "Tax rate", width: 1.1, align: "right" },
          { label: "Qty sold", width: 1.4, align: "right" },
          { label: "Amount", width: 1.9, align: "right" },
          { label: "Tax", width: 1.6, align: "right" },
          { label: "Remaining stock", width: 1.6, align: "right" },
        ],
        rows: data.rows.map((r) => [
          text(r.itemCd),
          text(r.productName),
          money(r.unitPrice),
          `${qty(r.taxRate)}%`,
          `${qty(r.quantity)} ${r.unit ?? ""}`.trim(),
          money(r.revenue),
          money(r.taxAmount),
          qty(r.remainingQty),
        ]),
        totals: ["Total", "", "", "", qty(data.summary.totalQuantity), money(data.summary.totalRevenue), money(data.summary.totalTax), ""],
        emptyText: "No sales in this period.",
      },
    ],
    subject: "RRA PLU report",
  }
}

export function renderPluReportA4(data: PluReportData): Promise<Buffer> {
  return renderA4Report(buildPluReportA4(data))
}
