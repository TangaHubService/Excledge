import type { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { buildBranchFilter } from "../middleware/branchAuth.middleware"
import { error as apiError } from "../utils/apiResponse"
import { excludeTrainingReceipts } from "../services/training-mode.service"
import { splitReportSales, type ReportSaleBucket } from "../services/daily-report-aggregate.service"
import { paymentLabel } from "../services/a4-report-pdf.service"
import {
  fmtGrouped,
  fmtMoney,
  fmtPlain,
  fmtStamp,
  fmtYmd,
  periodLabel,
  renderRraTablePdf,
  renderRraTableXlsx,
  type CellValue,
  type RraTableReport,
} from "../services/rra-report-layout.service"
import { getStockReport, getElectronicJournal, loadRraPurchasesReport, loadRraImportsReport, pullFromVsdc } from "./report.controller"

/**
 * PDF and Excel downloads of the detailed reports required by the RRA CIS-for-VSDC application
 * checklist (row 25: sales, purchases, stock, items and importation; row 44: electronic journal;
 * CIS spec Art. 7.11 stock status and Art. 7.31 closing stock at a date). Every report is built
 * once as an `RraTableReport` and rendered in the layout of RRA's own VSDC reports.
 */

type Handler = (req: BranchAuthRequest, res: Response) => unknown

/** Runs a JSON report handler against a captured response and returns its payload. */
function captureJson(handler: Handler, req: BranchAuthRequest, query: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    let status = 200
    const fake: any = {
      status(code: number) {
        status = code
        return fake
      },
      setHeader() {
        return fake
      },
      json(body: any) {
        if (status >= 400) reject(new Error(body?.error ?? body?.message ?? "Report failed"))
        else resolve(body && typeof body === "object" && "success" in body && "data" in body ? body.data : body)
        return fake
      },
      send(body: any) {
        resolve(body)
        return fake
      },
    }
    const proxied = Object.create(req) as BranchAuthRequest
    Object.defineProperty(proxied, "query", { value: { ...req.query, ...query }, enumerable: true })
    Promise.resolve(handler(proxied, fake as Response)).catch(reject)
  })
}

interface Identity {
  orgName: string
  tin: string | null
  extraHeader: Array<[string, string]>
}

async function identity(req: BranchAuthRequest, organizationId: number): Promise<Identity> {
  const branchId = req.selectedBranchId != null && req.selectedBranchId > 0 ? req.selectedBranchId : null
  const [org, branch] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, TIN: true } }),
    branchId != null
      ? prisma.branch.findFirst({ where: { id: branchId, organizationId }, select: { name: true, bhfId: true } })
      : Promise.resolve(null),
  ])
  return {
    orgName: org?.name ?? "",
    tin: org?.TIN ?? null,
    extraHeader: branch ? [["Branch", `${branch.name}${branch.bhfId ? ` (${branch.bhfId})` : ""}`]] : [],
  }
}

const validDate = (v: unknown): string | null => {
  if (v == null || v === "" || v === "undefined" || v === "null") return null
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

const todayIso = () => fmtYmd(new Date())

const dayRange = (start: string | null, end: string | null) =>
  start || end
    ? { gte: new Date(`${start ?? "2000-01-01"}T00:00:00`), lte: new Date(`${end ?? "2999-12-31"}T23:59:59.999`) }
    : null

type VsdcPull = Awaited<ReturnType<typeof pullFromVsdc>>
type Built = { report: RraTableReport; name: string; vsdc?: VsdcPull }

/** Screen preview: the same table as the PDF, already formatted. */
function tableJson(b: Built) {
  const r = b.report
  const text = (i: number, v: CellValue) => {
    const c = r.columns[i]
    return c?.format ? c.format(v) : v == null ? "" : String(v)
  }
  const span = r.totals ? Math.max(1, Math.min(r.totals.span, r.columns.length)) : 0
  return {
    title: r.title,
    orgName: r.orgName,
    tin: r.tin,
    period: r.period,
    extraHeader: r.extraHeader ?? [],
    columns: r.columns.map((c) => ({ label: c.label, align: c.align ?? "center" })),
    rows: r.rows.map((row) => r.columns.map((_, i) => text(i, row[i]))),
    totals: r.totals ? { label: r.totals.label, span, values: r.totals.values.map((v, i) => text(span + i, v)) } : null,
    emptyText: r.emptyText ?? null,
    notes: r.notes ?? [],
    vsdc: b.vsdc ?? null,
  }
}

/** "Sales [2024-09-23 - 2024-09-27]" — the file naming RRA's portal uses. */
const fileBase = (name: string, period: string) => `${name} [${period}]`.replace(/["\\/]/g, "-")

function send(res: Response, body: Buffer, filename: string, mime: string, inline: boolean) {
  res.setHeader("Content-Type", mime)
  res.setHeader("Content-Length", String(body.length))
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`)
  res.setHeader("Cache-Control", "private, no-store")
  return res.status(200).send(body)
}

/** One builder → a PDF route and an Excel route. */
function reportRoutes(label: string, build: (req: BranchAuthRequest, organizationId: number) => Promise<Built>) {
  const run = (format: "pdf" | "xlsx" | "json") => async (req: Request, res: Response) => {
    try {
      const organizationId = parseInt(req.params.organizationId)
      const built = await build(req as BranchAuthRequest, organizationId)
      const { report, name } = built
      if (format === "json") return res.json({ success: true, data: tableJson(built) })
      const base = fileBase(name, report.period)
      if (format === "xlsx") {
        return send(res, renderRraTableXlsx(report), `${base}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", false)
      }
      return send(res, await renderRraTablePdf(report), `${base}.pdf`, "application/pdf", true)
    } catch (err: any) {
      console.error(`[${label} ${format} Error]:`, err)
      return res.status(500).json(apiError(`Failed to generate the ${label} ${format === "xlsx" ? "Excel file" : "PDF"}`))
    }
  }
  return { pdf: run("pdf"), xlsx: run("xlsx"), json: run("json") }
}

const MONEY = "#,##0.00"
const GROUPED = "#,##0.##"
const QTY = "0.###"

// Sales: one row per receipt (NS / NR), like RRA's Sales report.

const MAX_SALES = 20000

const sales = reportRoutes("sales report", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const id = await identity(req, organizationId)
  const range = dayRange(start, end)

  const rows = await prisma.sale.findMany({
    where: excludeTrainingReceipts({
      organizationId,
      ...buildBranchFilter(req),
      status: { in: ["COMPLETED", "REFUNDED"] },
      ...(range ? { createdAt: range } : {}),
    }),
    select: {
      id: true,
      createdAt: true,
      status: true,
      isProforma: true,
      rcptLabel: true,
      reprintCount: true,
      paymentType: true,
      totalAmount: true,
      vatAmount: true,
      invoiceNumber: true,
      saleNumber: true,
      vsdcInvcNo: true,
      localReceiptSeq: true,
      customer: { select: { name: true, TIN: true, phone: true } },
      salePayments: { select: { paymentMethod: true } },
      saleItems: {
        select: { quantity: true, serviceName: true, totalPrice: true, taxCode: true, product: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_SALES + 1,
  })
  const truncated = rows.length > MAX_SALES
  const list = rows.slice(0, MAX_SALES)
  const split = splitReportSales(list as unknown as ReportSaleBucket[])
  const refunds = new Set(split.normalRefunds as unknown as typeof list)
  const receipts = [...(split.normalSales as unknown as typeof list), ...(split.normalRefunds as unknown as typeof list)].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  )

  let total = 0
  let vat = 0
  const body: CellValue[][] = receipts.map((s, i) => {
    const isRefund = refunds.has(s)
    const sign = isRefund ? -1 : 1
    const amount = sign * Math.abs(Number(s.totalAmount))
    const tax = sign * Math.abs(Number(s.vatAmount))
    total += amount
    vat += tax
    const items = s.saleItems.map((it) => `${it.product?.name ?? it.serviceName ?? "Item"} x ${fmtPlain(Math.abs(Number(it.quantity)))}`).join("\n")
    const methods = s.salePayments.length ? s.salePayments.map((p) => paymentLabel(p.paymentMethod)) : [paymentLabel(s.paymentType)]
    return [
      i + 1,
      s.customer?.TIN || s.customer?.phone || "",
      s.customer?.name ?? "",
      s.vsdcInvcNo ?? s.localReceiptSeq ?? s.invoiceNumber ?? s.saleNumber,
      fmtYmd(s.createdAt),
      amount,
      items,
      tax,
      isRefund ? "Refund" : "Sale",
      Array.from(new Set(methods)).join(", "),
    ]
  })

  const report: RraTableReport = {
    title: "SALES REPORT",
    ...id,
    period: periodLabel(start, end),
    columns: [
      { label: "#", width: 0.5 },
      { label: "Buyer TIN", width: 1.4 },
      { label: "Buyer Name", width: 1.8 },
      { label: "Receipt Number", width: 1.3 },
      { label: "Invoice Date", width: 1.3 },
      { label: "Total Amount", width: 1.9, format: fmtMoney, numFmt: MONEY },
      { label: "Items", width: 2.5 },
      { label: "VAT", width: 1.7, format: fmtMoney, numFmt: MONEY },
      { label: "Receipt Type", width: 1.1 },
      { label: "Payment Method", width: 1.6 },
    ],
    rows: body,
    totals: { label: "Total Sales", span: 5, values: [total, "", vat, "", ""] },
    emptyText: "No sales in this period.",
    notes: truncated ? [`Only the first ${MAX_SALES} receipts are listed; narrow the date range for the full detail.`] : [],
    subject: "Sales Report",
  }
  return { report, name: "Sales" }
})
export const getSalesReportPdf = sales.pdf
export const getSalesReportXlsx = sales.xlsx
export const getSalesReportTable = sales.json

// Purchases: supplier invoices received from the VSDC (selectTrnsPurchaseSales).

const purchases = reportRoutes("purchases report", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const id = await identity(req, organizationId)
  const vsdc = await pullFromVsdc("purchases", req, organizationId)
  const data = await loadRraPurchasesReport(req, organizationId)
  const body: CellValue[][] = data.items.map((p, i) => [
    i + 1,
    p.spplrTin,
    p.spplrNm ?? "",
    p.spplrInvcNo,
    p.requestDate,
    p.totAmt,
    p.lines.map((l) => `${l.itemNm ?? ""}=>${l.itemCd ?? ""}=>${fmtPlain(l.qty)}${l.qtyUnitCd ?? ""}`).join("\n"),
    p.totItemCnt,
  ])
  const report: RraTableReport = {
    title: "Purchases REPORT",
    ...id,
    period: periodLabel(start, end),
    columns: [
      { label: "#", width: 0.5 },
      { label: "Supplier TIN", width: 1.3 },
      { label: "Supplier Name", width: 2.6 },
      { label: "Invoice Number", width: 1.4 },
      { label: "Request Date", width: 1.3 },
      { label: "Total Amount", width: 1.4, format: fmtGrouped, numFmt: GROUPED },
      { label: "Items", width: 5.3 },
      { label: "Total Item", width: 1 },
    ],
    rows: body,
    totals: data.items.length ? { label: "Total", span: 5, values: [data.summary.totalAmt, "", data.items.reduce((s, p) => s + Number(p.totItemCnt ?? 0), 0)] } : undefined,
    emptyText: "No purchases received from RRA in this period.",
    subject: "Purchases Report",
  }
  return { report, name: "Purchases", vsdc }
})
export const getPurchasesReportPdf = purchases.pdf
export const getPurchasesReportXlsx = purchases.xlsx
export const getPurchasesReportTable = purchases.json

// Imports: import declaration lines received from the VSDC (selectImportItems).

const imports = reportRoutes("importation report", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const id = await identity(req, organizationId)
  const vsdc = await pullFromVsdc("imports", req, organizationId)
  const data = await loadRraImportsReport(req, organizationId)
  const body: CellValue[][] = data.items.map((m, i) => [
    i + 1,
    m.requestDate,
    m.dclNo ?? m.taskCd,
    m.itemNm ?? "",
    m.qty,
    m.qtyUnitCd ?? "",
    m.supplier ?? "",
    m.agent ?? "",
    m.invcFcurAmt,
    m.invcFcurCd ?? "",
  ])
  const report: RraTableReport = {
    title: "Imports REPORT",
    ...id,
    period: periodLabel(start, end),
    columns: [
      { label: "#", width: 0.5 },
      { label: "Request Date", width: 1.1 },
      { label: "Declaration Number", width: 1.5 },
      { label: "Item Name", width: 2.6 },
      { label: "Quantity", width: 0.9, format: fmtPlain, numFmt: QTY },
      { label: "Quantity Unit Code", width: 1, },
      { label: "Supplier name", width: 4 },
      { label: "Agent name", width: 1.9 },
      { label: "Invoice Foreign Currency Amount", width: 1.4, format: fmtPlain, numFmt: GROUPED },
      { label: "Invoice Foreign Currency", width: 1.4 },
    ],
    rows: body,
    emptyText: "No import declarations received from RRA in this period.",
    subject: "Imports Report",
  }
  return { report, name: "Imports", vsdc }
})
export const getImportationReportPdf = imports.pdf
export const getImportationReportXlsx = imports.xlsx
export const getImportationReportTable = imports.json

// Stock (opening / in / out / closing — closing stock at a given date, Art. 7.31)

const stock = reportRoutes("stock report", async (req, organizationId) => {
  const asOf = validDate(req.query.asOf)
  const end = asOf ?? validDate(req.query.endDate) ?? todayIso()
  const start = asOf ?? validDate(req.query.startDate) ?? end
  const id = await identity(req, organizationId)
  const data = await captureJson(getStockReport, req, { startDate: start, endDate: end })
  const rows: any[] = [...(data.data ?? [])].sort((a, b) => String(a.productName).localeCompare(String(b.productName)))
  const s = data.summary ?? {}
  const report: RraTableReport = {
    title: asOf ? "CLOSING STOCK REPORT" : "STOCK REPORT",
    ...id,
    period: asOf ? end : periodLabel(start, end),
    columns: [
      { label: "No", width: 0.5 },
      { label: "Item Name", width: 3.6 },
      { label: "Batch", width: 1.4 },
      { label: "Unit Price", width: 1.3, format: fmtMoney, numFmt: MONEY },
      { label: "Opening Stock", width: 1.3, format: fmtPlain, numFmt: QTY },
      { label: "Stock In", width: 1.1, format: fmtPlain, numFmt: QTY },
      { label: "Stock Out", width: 1.1, format: fmtPlain, numFmt: QTY },
      { label: "Closing Stock", width: 1.3, format: fmtPlain, numFmt: QTY },
      { label: "Stock Value", width: 1.5, format: fmtMoney, numFmt: MONEY },
    ],
    rows: rows.map((r, i) => [i + 1, r.productName ?? "", r.batchNumber ?? "", r.unitPrice, r.openingStock, r.stockIn, r.stockOut, r.closingStock, r.stockValue]),
    totals: { label: "Total", span: 4, values: [s.totalOpening, s.totalIn, s.totalOut, s.totalClosing, s.totalValue] },
    emptyText: "No items in stock.",
    notes: ["Quantities come from the inventory ledger up to the end of each date. Value is at purchase price where recorded, otherwise at sales price."],
    subject: asOf ? "Closing Stock Report" : "Stock Report",
  }
  return { report, name: asOf ? "Closing Stock" : "Stock" }
})
export const getStockReportPdf = stock.pdf
export const getStockReportXlsx = stock.xlsx
export const getStockReportTable = stock.json

// Items (catalogue with RRA classification)

const items = reportRoutes("items report", async (req, organizationId) => {
  const id = await identity(req, organizationId)
  const branchFilter = buildBranchFilter(req)
  // Stock "as at" a date: ledger movements up to the end of that day.
  const asOf = validDate(req.query.asOf) ?? validDate(req.query.endDate)
  const products = await prisma.product.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      itemCd: true,
      itemClsCd: true,
      itemType: true,
      taxCode: true,
      measurementUnit: true,
      qtyUnitCd: true,
      unitPrice: true,
      purchasePrice: true,
      quantity: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
    take: 10000,
  })

  // Branch-scoped on-hand from the ledger when a branch is selected; catalogue quantity otherwise.
  let onHand: Map<number, number> | null = null
  if (Object.keys(branchFilter).length || asOf) {
    const grouped = await prisma.inventoryLedger.groupBy({
      by: ["productId", "direction"],
      where: { organizationId, ...branchFilter, ...(asOf ? { createdAt: { lte: new Date(`${asOf}T23:59:59.999`) } } : {}) },
      _sum: { quantity: true },
    })
    onHand = new Map()
    for (const g of grouped) {
      const q = Number(g._sum.quantity ?? 0)
      onHand.set(g.productId, (onHand.get(g.productId) ?? 0) + (g.direction === "IN" ? q : -q))
    }
  }

  const report: RraTableReport = {
    title: "ITEMS REPORT",
    ...id,
    period: asOf ?? todayIso(),
    columns: [
      { label: "No", width: 0.5 },
      { label: "Item Code", width: 2 },
      { label: "Item Name", width: 3.2 },
      { label: "Item Classification", width: 1.6 },
      { label: "Item Type", width: 1.2 },
      { label: "Tax Type", width: 0.9 },
      { label: "Unit", width: 0.8 },
      { label: "Unit Price", width: 1.3, format: fmtMoney, numFmt: MONEY },
      { label: "Purchase Price", width: 1.3, format: fmtMoney, numFmt: MONEY },
      { label: "Remain Quantity", width: 1.3, format: fmtPlain, numFmt: QTY },
      { label: "Status", width: 1 },
    ],
    rows: products.map((p, i) => [
      i + 1,
      p.itemCd ?? "",
      p.name,
      p.itemClsCd ?? "",
      String(p.itemType).replace(/_/g, " "),
      p.taxCode ?? "",
      p.qtyUnitCd ?? String(p.measurementUnit),
      Number(p.unitPrice),
      p.purchasePrice != null ? Number(p.purchasePrice) : null,
      p.itemType === "SERVICE" ? "N/A" : onHand ? onHand.get(p.id) ?? 0 : Number(p.quantity),
      p.isActive ? "Active" : "Inactive",
    ]),
    emptyText: "No items registered.",
    subject: "Items Report",
  }
  return { report, name: "Items" }
})
export const getItemsReportPdf = items.pdf
export const getItemsReportXlsx = items.xlsx
export const getItemsReportTable = items.json

// Electronic journal

const MAX_EJ_PAGES = 25

const journal = reportRoutes("electronic journal", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const id = await identity(req, organizationId)
  const first = await captureJson(getElectronicJournal, req, { page: "1", limit: "200" })
  const entries: any[] = [...(first.entries ?? [])]
  const pages = Math.min(first.pagination?.totalPages ?? 1, MAX_EJ_PAGES)
  for (let p = 2; p <= pages; p++) {
    const page = await captureJson(getElectronicJournal, req, { page: String(p), limit: "200" })
    entries.push(...(page.entries ?? []))
  }
  const truncated = (first.pagination?.totalPages ?? 1) > MAX_EJ_PAGES
  entries.sort((a, b) => new Date(a.sdcDateTime ?? a.createdAt).getTime() - new Date(b.sdcDateTime ?? b.createdAt).getTime())
  const when = (e: any) => fmtStamp(new Date(e.sdcDateTime ?? e.createdAt))

  const report: RraTableReport = {
    title: "ELECTRONIC JOURNAL REPORT",
    ...id,
    period: periodLabel(start, end),
    columns: [
      { label: "#", width: 0.5 },
      { label: "SDC Date / Time", width: 2 },
      { label: "Invoice Number", width: 2.6 },
      { label: "Receipt Type", width: 1 },
      { label: "Receipt Number (A/B)", width: 1.7 },
      { label: "SDC ID", width: 1.8 },
      { label: "EJ Sent", width: 0.9 },
    ],
    rows: entries.map((e, i) => [
      i + 1,
      when(e),
      e.invoiceNumber ?? e.ebmInvoiceNumber ?? "",
      e.rcptLabel ?? "NS",
      `${e.sdcRcptNo ?? "-"} / ${e.totalRcptNo ?? "-"}`,
      e.sdcId ?? "",
      e.ejSent ? "Yes" : "No",
    ]),
    emptyText: "No journal records in this period.",
    notes: truncated ? [`Only the first ${MAX_EJ_PAGES * 200} journal records are included; narrow the date range for the rest.`] : [],
    appendix: {
      title: "Journal Records",
      records: entries.map((e) => ({
        caption: `${e.rcptLabel ?? "NS"} ${e.sdcRcptNo ?? "-"}/${e.totalRcptNo ?? "-"}  ·  Invoice ${e.invoiceNumber ?? e.ebmInvoiceNumber ?? "-"}  ·  ${when(e)}`,
        lines: String(e.journalText ?? "").split(/\r?\n/),
      })),
    },
    subject: "Electronic Journal",
  }
  return { report, name: "Electronic Journal" }
})
export const getElectronicJournalPdf = journal.pdf
export const getElectronicJournalXlsx = journal.xlsx
