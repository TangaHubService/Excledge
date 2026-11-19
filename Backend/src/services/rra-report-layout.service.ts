import PDFDocument from "pdfkit"
import * as XLSX from "xlsx"
import { SYSTEM_NAME, SYSTEM_VERSION } from "./system-branding.service"

/**
 * One layout for every RRA report, modelled on the reports RRA itself issues from its VSDC
 * portal (Sales / Purchases / Imports / PLU and the X / Z daily reports):
 *
 *   - Table reports (sales, purchases, imports, PLU, stock, items, journal): A4 landscape, centred
 *     bold title "<NAME> REPORT", then the taxpayer name, "TIN:" and "Date: <from> - <to>" on the
 *     left, one bordered table with a header row in the system primary blue and centred cells, an optional tinted totals
 *     row, and "Generated on: yyyy-MM-dd HH:mm:ss" centred under the table.
 *   - Summary reports (X / Z): A4 portrait on a light panel, navy title banner, Trade Name / TIN /
 *     MRC / Date block, "All Transactions" and a two-column Description / Amount (RWF) table with a
 *     blue header; payment and tax breakdowns sit in small dashed grids inside the amount cell.
 *     A navy copyright band closes the page.
 *
 * Each report is described once (`RraTableReport` / `RraSummaryReport`) and rendered to PDF or to
 * an Excel workbook, so both downloads always carry the same figures.
 */

export type CellValue = string | number | null | undefined
export type Align = "left" | "center" | "right"

export interface RraColumn {
  label: string
  /** Relative width; columns are scaled to the page's content width. */
  width: number
  align?: Align
  /** Text shown in the PDF (and as the Excel cell when the value is not a number). */
  format?: (v: CellValue) => string
  /** Excel number format for numeric values, e.g. "#,##0.00". */
  numFmt?: string
}

export interface RraTableReport {
  /** Printed centred at the top, e.g. "SALES REPORT". */
  title: string
  orgName: string
  tin: string | null
  /** "2024-09-01 - 2024-09-30", or a single date. */
  period: string
  /** Extra identity lines under the date (branch, MRC, …), printed like the TIN line. */
  extraHeader?: Array<[string, string]>
  columns: RraColumn[]
  rows: CellValue[][]
  totals?: { label: string; span: number; values: CellValue[] }
  emptyText?: string
  /** Short notes printed under the table (truncation warnings, explanations). */
  notes?: string[]
  /** Monospace text records printed after the table (electronic journal). */
  appendix?: { title: string; records: Array<{ caption: string; lines: string[] }> }
  generatedAt?: Date
  /** PDF metadata / Excel sheet name. */
  subject: string
}

export interface RraPaymentGrid {
  head: [string, string, string]
  rows: Array<[string, string, string]>
}

export interface RraSummaryRow {
  label: string
  value?: string
  grid?: RraPaymentGrid
}

export interface RraSummaryReport {
  /** "X Report" / "Z Report" */
  title: string
  tradeName: string
  tin: string | null
  mrc: string | null
  /** Extra identity lines (SDC ID, branch) shown after MRC. */
  extraHeader?: Array<[string, string]>
  date: string
  sectionTitle: string
  rows: RraSummaryRow[]
  notes?: string[]
  generatedAt?: Date
  subject: string
}

// ── Formatting helpers shared by the report builders ─────────────────────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** 1234.5 → "1,234.50" */
export const fmtMoney = (v: CellValue): string => {
  if (v == null || v === "") return ""
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 9000 → "9,000", 593.5 → "593.5" (RRA purchases style). */
export const fmtGrouped = (v: CellValue): string => {
  if (v == null || v === "") return ""
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return round2(n).toLocaleString("en-US", { maximumFractionDigits: 2 })
}

/** Plain number without grouping: 32002, 593.54 (RRA imports style). */
export const fmtPlain = (v: CellValue): string => {
  if (v == null || v === "") return ""
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return String(Math.round(n * 1000) / 1000)
}

/** 92000 → "92,000 RWF"; 5644.07 → "5,644.07 RWF" */
export const fmtRwf = (n: number | null | undefined, fixed = false): string => {
  const v = round2(Number(n ?? 0))
  const s = fixed
    ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return `${s} RWF`
}

const pad2 = (n: number) => String(n).padStart(2, "0")

/** Local date-time as yyyy-MM-dd HH:mm:ss (Africa/Kigali when the server runs there). */
export const fmtStamp = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

/** yyyyMMdd / yyyyMMddHHmmss / ISO → yyyy-MM-dd */
export const fmtYmd = (raw: unknown): string => {
  if (raw instanceof Date) return `${raw.getFullYear()}-${pad2(raw.getMonth() + 1)}-${pad2(raw.getDate())}`
  const s = String(raw ?? "").trim()
  if (!s) return ""
  if (/^\d{8}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export const periodLabel = (start: string | null | undefined, end: string | null | undefined): string => {
  if (start && end) return start === end ? start : `${start} - ${end}`
  return start || end || "All dates"
}

export const SYSTEM_LINE = `${SYSTEM_NAME} v${SYSTEM_VERSION}`

const cellText = (col: RraColumn, v: CellValue): string => {
  if (col.format) return col.format(v)
  return v == null ? "" : String(v)
}

// ── Table report: PDF ───────────────────────────────────────────────────────

const FONT = "Helvetica"
const FONT_BOLD = "Helvetica-Bold"
const FONT_MONO = "Courier"
const INK = "#000000"
const MUTED = "#4b5563"
/** Excledge ERP palette (Frontend tailwind: primary #2563eb, sidebar navy, slate surfaces). */
const HEAD_FILL = "#2563eb"
const TOTAL_FILL = "#eff6ff"
const GRID = "#000000"

const T_MARGIN_X = 48
const T_MARGIN_TOP = 44
const T_MARGIN_BOTTOM = 40
const T_BODY = 8
const T_HEAD = 8
const T_PAD_X = 4
const T_PAD_Y = 6
const T_MIN_ROW = 22

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })
}

/** Writes page numbers once the page count is known (only when there is more than one page). */
function numberPages(doc: PDFKit.PDFDocument, left: number, width: number, bottomGap: number): void {
  const range = doc.bufferedPageRange()
  if (range.count < 2) return
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const saved = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc
      .font(FONT)
      .fontSize(7)
      .fillColor(MUTED)
      .text(`Page ${i - range.start + 1} of ${range.count}`, left, doc.page.height - bottomGap, { width, align: "right", lineBreak: false })
    doc.page.margins.bottom = saved
  }
}

export async function renderRraTablePdf(r: RraTableReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: T_MARGIN_TOP, bottom: T_MARGIN_BOTTOM, left: T_MARGIN_X, right: T_MARGIN_X },
    bufferPages: true,
    compress: true,
    info: { Title: r.title, Subject: r.subject, Author: r.orgName || undefined, Creator: SYSTEM_LINE, Producer: "PDFKit" },
  })
  const out = collect(doc)
  const left = T_MARGIN_X
  const width = doc.page.width - T_MARGIN_X * 2
  const bottom = doc.page.height - T_MARGIN_BOTTOM - 12
  let y = T_MARGIN_TOP

  // Title + identity block.
  doc.font(FONT_BOLD).fontSize(14).fillColor(INK).text(r.title, left, y, { width, align: "center" })
  y = doc.y + 12
  const idLine = (label: string | null, value: string) => {
    doc.font(FONT_BOLD).fontSize(10.5).fillColor(INK).text(label ? `${label}: ${value}` : value, left, y, { width })
    y = doc.y + 6
  }
  idLine(null, r.orgName || "-")
  idLine("TIN", r.tin || "-")
  for (const [k, v] of r.extraHeader ?? []) idLine(k, v)
  idLine("Date", r.period)
  y += 10

  // Table.
  const totalW = r.columns.reduce((s, c) => s + c.width, 0)
  const widths = r.columns.map((c) => (c.width / totalW) * width)
  const xs: number[] = []
  widths.reduce((x, w) => (xs.push(x), x + w), left)

  const measure = (cells: string[], bold: boolean, size: number, ws = widths): number => {
    doc.font(bold ? FONT_BOLD : FONT).fontSize(size)
    let h = 0
    cells.forEach((c, i) => {
      h = Math.max(h, doc.heightOfString(c || " ", { width: ws[i] - T_PAD_X * 2 }))
    })
    return Math.max(T_MIN_ROW, h + T_PAD_Y * 2)
  }

  const drawCells = (cells: string[], ws: number[], cx: number[], h: number, opts: { bold: boolean; size: number; color: string; aligns: Align[] }) => {
    cells.forEach((c, i) => {
      doc.font(opts.bold ? FONT_BOLD : FONT).fontSize(opts.size)
      const th = doc.heightOfString(c || " ", { width: ws[i] - T_PAD_X * 2 })
      doc.fillColor(opts.color).text(c, cx[i] + T_PAD_X, y + (h - th) / 2, { width: ws[i] - T_PAD_X * 2, align: opts.aligns[i] ?? "center" })
    })
    doc.lineWidth(0.6).strokeColor(GRID)
    doc.rect(cx[0], y, ws.reduce((a, b) => a + b, 0), h).stroke()
    for (let i = 1; i < cx.length; i++) doc.moveTo(cx[i], y).lineTo(cx[i], y + h).stroke()
  }

  const headCells = r.columns.map((c) => c.label)
  const drawHead = () => {
    const h = measure(headCells, true, T_HEAD)
    doc.rect(left, y, width, h).fill(HEAD_FILL)
    drawCells(headCells, widths, xs, h, { bold: true, size: T_HEAD, color: "#ffffff", aligns: headCells.map(() => "center") })
    y += h
  }

  const newPage = () => {
    doc.addPage()
    y = T_MARGIN_TOP
    drawHead()
  }

  const bodyRows = r.rows.map((row) => r.columns.map((c, i) => cellText(c, row[i])))
  const aligns = r.columns.map((c) => c.align ?? "center")

  const firstH = bodyRows.length ? measure(bodyRows[0], false, T_BODY) : T_MIN_ROW
  if (y + measure(headCells, true, T_HEAD) + firstH > bottom) {
    doc.addPage()
    y = T_MARGIN_TOP
  }
  drawHead()

  if (!bodyRows.length) {
    const h = T_MIN_ROW
    drawCells([r.emptyText ?? "No records for this period."], [width], [left], h, { bold: false, size: T_BODY, color: MUTED, aligns: ["center"] })
    y += h
  }
  for (const cells of bodyRows) {
    const h = measure(cells, false, T_BODY)
    if (y + h > bottom) newPage()
    drawCells(cells, widths, xs, h, { bold: false, size: T_BODY, color: INK, aligns })
    y += h
  }

  if (r.totals) {
    const span = Math.max(1, Math.min(r.totals.span, r.columns.length))
    const restCols = r.columns.slice(span)
    const cells = [r.totals.label, ...restCols.map((c, i) => cellText(c, r.totals!.values[i]))]
    const ws = [widths.slice(0, span).reduce((a, b) => a + b, 0), ...widths.slice(span)]
    const cx = [left, ...xs.slice(span)]
    const h = measure(cells, true, T_BODY, ws)
    if (y + h > bottom) newPage()
    doc.rect(left, y, width, h).fill(TOTAL_FILL)
    drawCells(cells, ws, cx, h, { bold: true, size: T_BODY, color: INK, aligns: ["center", ...restCols.map((c) => c.align ?? "center")] })
    y += h
  }

  // Notes, generated-on, system line. They may use the bottom margin, above the page number.
  const tailBottom = doc.page.height - 36
  y += 18
  for (const note of r.notes ?? []) {
    doc.font(FONT).fontSize(8)
    const h = doc.heightOfString(note, { width })
    if (y + h > tailBottom) {
      doc.addPage()
      y = T_MARGIN_TOP
    }
    doc.fillColor(MUTED).text(note, left, y, { width, align: "center", lineBreak: true })
    y = doc.y + 6
  }
  if (y + 26 > tailBottom) {
    doc.addPage()
    y = T_MARGIN_TOP
  }
  // Writing inside the bottom margin would otherwise trigger an automatic page break.
  const savedBottom = doc.page.margins.bottom
  doc.page.margins.bottom = 0
  doc.font(FONT).fontSize(9).fillColor(INK).text(`Generated on: ${fmtStamp(r.generatedAt ?? new Date())}`, left, y, { width, align: "center", lineBreak: false })
  y += 14
  doc.font(FONT).fontSize(9).fillColor(INK).text(SYSTEM_LINE, left, y, { width, align: "center", lineBreak: false })
  doc.page.margins.bottom = savedBottom
  y += 30

  // Appendix (journal text).
  if (r.appendix && r.appendix.records.length) {
    doc.addPage()
    y = T_MARGIN_TOP
    doc.font(FONT_BOLD).fontSize(12).fillColor(INK).text(r.appendix.title, left, y, { width, align: "center" })
    y = doc.y + 12
    const pad = 6
    for (const rec of r.appendix.records) {
      if (y + 40 > bottom) {
        doc.addPage()
        y = T_MARGIN_TOP
      }
      doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK).text(rec.caption, left, y, { width })
      y = doc.y + 3
      let boxTop = y
      y += pad
      const close = () => doc.rect(left, boxTop, width, y + pad - boxTop).lineWidth(0.5).strokeColor("#9ca3af").stroke()
      doc.font(FONT_MONO).fontSize(7.5).fillColor(INK)
      for (const raw of rec.lines.length ? rec.lines : [" "]) {
        const line = raw.replace(/\t/g, "    ") || " "
        const h = Math.max(doc.heightOfString(line, { width: width - pad * 2 }), 9)
        if (y + h + pad > bottom) {
          close()
          doc.addPage()
          y = T_MARGIN_TOP
          boxTop = y
          y += pad
          doc.font(FONT_MONO).fontSize(7.5).fillColor(INK)
        }
        doc.text(line, left + pad, y, { width: width - pad * 2 })
        y += h
      }
      close()
      y += pad + 12
    }
  }

  numberPages(doc, left, width, 30)
  doc.end()
  return out
}

// ── Summary (X / Z) report: PDF ─────────────────────────────────────────────

const BANNER = "#0f172a"
const TABLE_HEAD = "#2563eb"
const PANEL = "#f8fafc"
const ROW_RULE = "#e2e8f0"
const SECTION = "#2563eb"

export async function renderRraSummaryPdf(r: RraSummaryReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    bufferPages: true,
    compress: true,
    info: { Title: r.title, Subject: r.subject, Author: r.tradeName || undefined, Creator: SYSTEM_LINE, Producer: "PDFKit" },
  })
  const out = collect(doc)
  const W = doc.page.width
  const H = doc.page.height
  const panelX = 34
  const panelW = W - panelX * 2
  const panelTop = 24
  const footerH = 44
  const footerTop = H - 24 - footerH
  const tableX = 50
  const tableW = W - tableX * 2
  const descW = tableW * 0.58
  const valW = tableW - descW
  const PAD = 8
  const PAD_Y = 5
  const contentBottom = footerTop - 16

  const year = (r.generatedAt ?? new Date()).getFullYear()
  const copyright = `© ${year} ${r.tradeName || ""}. All Rights Reserved.`
  const generatedLine = `Generated on: ${fmtStamp(r.generatedAt ?? new Date())}  ·  ${SYSTEM_LINE}`

  const drawFrame = (first: boolean): number => {
    doc.rect(panelX, panelTop, panelW, footerTop + footerH - panelTop).fill(PANEL)
    doc.rect(panelX, footerTop, panelW, footerH).fill(BANNER)
    doc.font(FONT).fontSize(9).fillColor("#ffffff").text(copyright, panelX, footerTop + 11, { width: panelW, align: "center", lineBreak: false })
    doc.font(FONT).fontSize(6.5).fillColor("#cbd5e1").text(generatedLine, panelX, footerTop + 27, { width: panelW, align: "center", lineBreak: false })
    if (!first) return panelTop + 24
    const bannerH = 54
    doc.rect(panelX, panelTop, panelW, bannerH).fill(BANNER)
    doc.font(FONT_BOLD).fontSize(19).fillColor("#ffffff").text(r.title, panelX, panelTop + bannerH / 2 - 10, { width: panelW, align: "center", lineBreak: false })
    return panelTop + bannerH + 16
  }

  let y = drawFrame(true)

  // Identity block.
  const info: Array<[string, string]> = [
    ["Trade Name", r.tradeName || "-"],
    ["TIN", r.tin || "-"],
    ["MRC", r.mrc || "-"],
    ...(r.extraHeader ?? []),
    ["Date", r.date],
  ]
  // Up to four lines on the left as on RRA's report; any extra identity lines go to a right column.
  const leftInfo = info.length > 4 ? [...info.slice(0, 3), info[info.length - 1]] : info
  const rightInfo = info.length > 4 ? info.slice(3, info.length - 1) : []
  const infoTop = y
  const writeInfo = (list: Array<[string, string]>, x: number, w: number) => {
    let iy = infoTop
    for (const [k, v] of list) {
      doc.font(FONT_BOLD).fontSize(9).fillColor(INK).text(`${k}: `, x, iy, { width: w, continued: true }).font(FONT).text(v)
      iy = doc.y + 3
    }
    return iy
  }
  y = Math.max(writeInfo(leftInfo, tableX, tableW * 0.55), writeInfo(rightInfo, tableX + tableW * 0.55, tableW * 0.45))
  y += 4
  doc.font(FONT_BOLD).fontSize(10.5).fillColor(SECTION).text(r.sectionTitle, panelX, y, { width: panelW, align: "center" })
  y = doc.y + 10

  const drawHead = () => {
    const h = 24
    doc.rect(tableX, y, tableW, h).fill(TABLE_HEAD)
    doc.font(FONT_BOLD).fontSize(9).fillColor("#ffffff")
    doc.text("Description", tableX + PAD, y + 8, { width: descW - PAD * 2 })
    doc.text("Amount (RWF)", tableX + descW + PAD, y + 8, { width: valW - PAD * 2 })
    y += h
  }

  // Nested dashed grid geometry.
  const gridW = valW - PAD * 2
  const gridCols = [gridW * 0.3, gridW * 0.35, gridW * 0.35]
  const gridSize = 7.6
  const gridRowH = (cells: string[], bold: boolean) => {
    doc.font(bold ? FONT_BOLD : FONT).fontSize(gridSize)
    return Math.max(...cells.map((c, i) => doc.heightOfString(c || " ", { width: gridCols[i] - 4 }))) + 3
  }
  const gridHeight = (g: RraPaymentGrid) => g.rows.reduce((s, row) => s + gridRowH(row, false), gridRowH(g.head, true)) + 6

  const rowHeight = (row: RraSummaryRow) => {
    doc.font(FONT).fontSize(9)
    const lh = doc.heightOfString(row.label, { width: descW - PAD * 2 })
    let vh = 0
    if (row.grid) vh = gridHeight(row.grid)
    else {
      doc.font(FONT).fontSize(9)
      vh = doc.heightOfString(row.value ?? "", { width: valW - PAD * 2 })
    }
    return Math.max(lh, vh) + PAD_Y * 2 + 2
  }

  drawHead()
  for (const row of r.rows) {
    const h = rowHeight(row)
    if (y + h > contentBottom) {
      doc.addPage()
      y = drawFrame(false)
      drawHead()
    }
    doc.rect(tableX, y, tableW, h).fill("#ffffff")
    doc.lineWidth(0.5).strokeColor(ROW_RULE)
    doc.rect(tableX, y, tableW, h).stroke()
    doc.moveTo(tableX + descW, y).lineTo(tableX + descW, y + h).stroke()

    doc.font(FONT).fontSize(9)
    const lh = doc.heightOfString(row.label, { width: descW - PAD * 2 })
    doc.fillColor(INK).text(row.label, tableX + PAD, y + (h - lh) / 2, { width: descW - PAD * 2 })

    const vx = tableX + descW + PAD
    if (row.grid) {
      const gh = gridHeight(row.grid)
      let gy = y + (h - gh) / 2
      doc.save()
      doc.lineWidth(0.5).strokeColor("#c8c8c8").dash(2, { space: 2 }).rect(vx, gy, gridW, gh).stroke().undash()
      doc.restore()
      gy += 3
      const drawGridRow = (cells: string[], bold: boolean) => {
        const rh = gridRowH(cells, bold)
        let gx = vx
        cells.forEach((c, i) => {
          doc.font(bold ? FONT_BOLD : FONT).fontSize(gridSize).fillColor(INK).text(c, gx + 2, gy, { width: gridCols[i] - 4, align: "center" })
          gx += gridCols[i]
        })
        gy += rh
      }
      drawGridRow(row.grid.head, true)
      for (const gr of row.grid.rows) drawGridRow(gr, false)
    } else {
      doc.font(FONT).fontSize(9)
      const vh = doc.heightOfString(row.value ?? "", { width: valW - PAD * 2 })
      doc.fillColor(INK).text(row.value ?? "", vx, y + (h - vh) / 2, { width: valW - PAD * 2 })
    }
    y += h
  }

  y += 10
  const tail = r.notes ?? []
  for (const t of tail) {
    doc.font(FONT).fontSize(7.5)
    const h = doc.heightOfString(t, { width: tableW })
    if (y + h > footerTop - 4) {
      doc.addPage()
      y = drawFrame(false)
    }
    doc.fillColor(MUTED).text(t, tableX, y, { width: tableW, align: "center" })
    y = doc.y + 3
  }

  // Page numbers inside the panel, only for multi-page output.
  const range = doc.bufferedPageRange()
  if (range.count > 1) {
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.font(FONT).fontSize(7).fillColor(MUTED).text(`Page ${i - range.start + 1} of ${range.count}`, tableX, footerTop - 12, { width: tableW, align: "right", lineBreak: false })
    }
  }
  doc.end()
  return out
}

// ── Excel ────────────────────────────────────────────────────────────────────

const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report"

function toBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

export function renderRraTableXlsx(r: RraTableReport): Buffer {
  const aoa: CellValue[][] = []
  const n = r.columns.length
  aoa.push([r.title])
  aoa.push([r.orgName])
  aoa.push([`TIN: ${r.tin ?? "-"}`])
  for (const [k, v] of r.extraHeader ?? []) aoa.push([`${k}: ${v}`])
  aoa.push([`Date: ${r.period}`])
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(r.columns.map((c) => c.label))
  for (const row of r.rows) {
    aoa.push(
      r.columns.map((c, i) => {
        const v = row[i]
        if (typeof v === "number" && c.numFmt) return v
        return cellText(c, v)
      }),
    )
  }
  if (!r.rows.length) aoa.push([r.emptyText ?? "No records for this period."])
  let totalsRow = -1
  if (r.totals) {
    totalsRow = aoa.length
    const span = Math.max(1, Math.min(r.totals.span, n))
    const rest = r.columns.slice(span).map((c, i) => {
      const v = r.totals!.values[i]
      if (typeof v === "number" && c.numFmt) return v
      return cellText(c, v)
    })
    aoa.push([r.totals.label, ...Array(span - 1).fill(""), ...rest])
  }
  aoa.push([])
  for (const note of r.notes ?? []) aoa.push([note])
  aoa.push([`Generated on: ${fmtStamp(r.generatedAt ?? new Date())}`])
  aoa.push([SYSTEM_LINE])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Number formats on numeric body cells.
  for (let ri = headerRow + 1; ri < aoa.length; ri++) {
    r.columns.forEach((c, ci) => {
      if (!c.numFmt) return
      const ref = XLSX.utils.encode_cell({ r: ri, c: ci })
      const cell = ws[ref]
      if (cell && cell.t === "n") cell.z = c.numFmt
    })
  }
  ws["!cols"] = r.columns.map((c) => ({ wch: Math.max(8, Math.min(60, Math.round(c.width * 9))) }))
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: n - 1 } }]
  if (totalsRow >= 0 && r.totals && r.totals.span > 1) merges.push({ s: { r: totalsRow, c: 0 }, e: { r: totalsRow, c: r.totals.span - 1 } })
  ws["!merges"] = merges
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + Math.max(r.rows.length, 1), c: n - 1 } }) }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName(r.subject))
  if (r.appendix && r.appendix.records.length) {
    const lines: string[][] = [[r.appendix.title], []]
    for (const rec of r.appendix.records) {
      lines.push([rec.caption])
      for (const l of rec.lines) lines.push([l])
      lines.push([])
    }
    const js = XLSX.utils.aoa_to_sheet(lines)
    js["!cols"] = [{ wch: 90 }]
    XLSX.utils.book_append_sheet(wb, js, sheetName(r.appendix.title))
  }
  return toBuffer(wb)
}

export function renderRraSummaryXlsx(r: RraSummaryReport): Buffer {
  const aoa: string[][] = [
    [r.title],
    [`Trade Name: ${r.tradeName}`],
    [`TIN: ${r.tin ?? "-"}`],
    [`MRC: ${r.mrc ?? "-"}`],
    ...(r.extraHeader ?? []).map(([k, v]) => [`${k}: ${v}`]),
    [`Date: ${r.date}`],
    [],
    [r.sectionTitle],
    ["Description", "Amount (RWF)", "", ""],
  ]
  for (const row of r.rows) {
    if (row.grid) {
      aoa.push([row.label, ...row.grid.head])
      for (const gr of row.grid.rows) aoa.push(["", ...gr])
    } else {
      aoa.push([row.label, row.value ?? ""])
    }
  }
  aoa.push([])
  for (const note of r.notes ?? []) aoa.push([note])
  aoa.push([`Generated on: ${fmtStamp(r.generatedAt ?? new Date())}`])
  aoa.push([SYSTEM_LINE])
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws["!cols"] = [{ wch: 62 }, { wch: 22 }, { wch: 18 }, { wch: 18 }]
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName(r.subject))
  return toBuffer(wb)
}
