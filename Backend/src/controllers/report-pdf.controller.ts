import type { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { buildBranchFilter } from "../middleware/branchAuth.middleware"
import { error as apiError } from "../utils/apiResponse"
import { resolveReportMrc } from "../utils/mrc"
import type { FiscalReportHeader } from "../services/fiscal-report-pdf.service"
import { renderA4Report, money, qty, dateTime, type A4ReportSpec } from "../services/a4-report-pdf.service"
import { SYSTEM_VERSION } from "../services/system-branding.service"
import {
  getSalesReport,
  getStockReport,
  getElectronicJournal,
  getPurchasesReport,
  getImportationReport,
} from "./report.controller"

/**
 * A4 PDF versions of the detailed reports required by the RRA CIS-for-VSDC application checklist
 * (row 25: "detailed report of sales, purchases, stock, items and importation"; row 44: electronic
 * journal; CIS spec Art. 7.11 stock status and Art. 7.31 closing stock at a given date).
 *
 * Each endpoint reuses the JSON report handler for its data so the PDF can never disagree with
 * what the screen shows.
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

async function buildHeader(req: BranchAuthRequest, organizationId: number): Promise<FiscalReportHeader> {
  const branchId = req.selectedBranchId != null && req.selectedBranchId > 0 ? req.selectedBranchId : null
  const [org, branch] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, TIN: true, address: true, ebmSerialNo: true, mrcNo: true, ebmDeviceId: true },
    }),
    branchId != null
      ? prisma.branch.findFirst({
          where: { id: branchId, organizationId },
          select: { name: true, bhfId: true, ebmSerialNo: true, mrcNo: true, ebmDeviceId: true, ebmInitInfo: true, address: true },
        })
      : Promise.resolve(null),
  ])
  return {
    orgName: org?.name ?? "",
    tin: org?.TIN ?? null,
    mrcNo: resolveReportMrc(branch, org),
    sdcId: branch?.ebmDeviceId ?? org?.ebmDeviceId ?? null,
    branchName: branch?.name ?? null,
    bhfId: branch?.bhfId ?? null,
    address: branch?.address ?? org?.address ?? null,
  }
}

const validDate = (v: unknown): string | null => {
  if (v == null || v === "" || v === "undefined" || v === "null") return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function periodMeta(start: string | null, end: string | null): Array<[string, string]> {
  if (!start && !end) return [["Period", "All dates"]]
  return [
    ["From", start ?? "-"],
    ["To", end ?? "-"],
  ]
}

function baseMeta(): Array<[string, string]> {
  return [
    ["CIS designation", `Excledge ERP v${SYSTEM_VERSION}`],
    ["Generated", dateTime(new Date())],
  ]
}

/** yyyyMMdd → yyyy-MM-dd */
const ymd = (raw: string | null | undefined): string => {
  const d = String(raw ?? "").replace(/\D/g, "")
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : String(raw ?? "-")
}

async function sendPdf(res: Response, spec: A4ReportSpec, filename: string) {
  const pdf = await renderA4Report(spec)
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Length", String(pdf.length))
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`)
  res.setHeader("Cache-Control", "private, no-store")
  return res.status(200).send(pdf)
}

function pdfRoute(label: string, build: (req: BranchAuthRequest, organizationId: number) => Promise<{ spec: A4ReportSpec; filename: string }>) {
  return async (req: Request, res: Response) => {
    try {
      const organizationId = parseInt(req.params.organizationId)
      const { spec, filename } = await build(req as BranchAuthRequest, organizationId)
      return await sendPdf(res, spec, filename)
    } catch (err: any) {
      console.error(`[${label} PDF Error]:`, err)
      return res.status(500).json(apiError(`Failed to generate the ${label} PDF`))
    }
  }
}

// Sales

const MAX_SALE_PAGES = 40

export const getSalesReportPdf = pdfRoute("sales report", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const header = await buildHeader(req, organizationId)

  const first = await captureJson(getSalesReport, req, { page: "1", limit: "500", sortBy: "date", sortOrder: "asc" })
  const transactions: any[] = [...(first.transactions ?? [])]
  const totalPages = Math.min(first.pagination?.totalPages ?? 1, MAX_SALE_PAGES)
  for (let p = 2; p <= totalPages; p++) {
    const page = await captureJson(getSalesReport, req, { page: String(p), limit: "500", sortBy: "date", sortOrder: "asc" })
    transactions.push(...(page.transactions ?? []))
  }
  const truncated = (first.pagination?.totalPages ?? 1) > MAX_SALE_PAGES
  const s = first.summary ?? {}

  const totals = transactions.reduce(
    (a, t) => ({ q: a.q + Number(t.quantity ?? 0), d: a.d + Number(t.discount ?? 0), amt: a.amt + Number(t.total ?? 0), tax: a.tax + Number(t.taxAmount ?? 0) }),
    { q: 0, d: 0, amt: 0, tax: 0 },
  )

  const paymentLabel = (t: any) =>
    Array.isArray(t.payments) && t.payments.length
      ? t.payments.map((p: any) => String(p.method ?? "").replace(/_/g, " ").toLowerCase()).join(", ")
      : String(t.paymentType ?? "-").replace(/_/g, " ").toLowerCase()

  const spec: A4ReportSpec = {
    title: "DETAILED SALES REPORT",
    subtitle: "Sales per receipt line",
    header,
    landscape: true,
    meta: [...periodMeta(start, end), ...baseMeta(), ["Receipts", String(s.totalTransactions ?? 0)], ["Lines", String(transactions.length)]],
    blocks: [
      {
        kind: "kv",
        heading: "Summary",
        rows: [
          ["Total sales incl. tax", money(s.totalRevenue)],
          ["Total refunds", money(s.totalRefunds)],
          ["Net sales", money(s.netRevenue)],
          ["Taxable amount", money(s.totalTaxable)],
          ["Total tax (VAT)", money(s.totalVat)],
          ["Total discounts", money(totals.d)],
          ["Number of receipts", String(s.totalTransactions ?? 0)],
          ["Quantity sold", qty(totals.q)],
        ],
      },
      {
        kind: "table",
        heading: "Sales lines",
        columns: [
          { label: "Date", width: 1.5 },
          { label: "Invoice", width: 3.3 },
          { label: "Status", width: 1.5 },
          { label: "Item", width: 2.9 },
          { label: "Category", width: 1.5 },
          { label: "Qty", width: 1, align: "right" },
          { label: "Unit price", width: 1.5, align: "right" },
          { label: "Discount", width: 1.3, align: "right" },
          { label: "Amount", width: 1.6, align: "right" },
          { label: "Tax %", width: 0.9, align: "right" },
          { label: "Tax", width: 1.3, align: "right" },
          { label: "Payment", width: 1.4 },
          { label: "Seller", width: 1.6 },
        ],
        rows: transactions.map((t) => [
          String(t.date ?? "-"),
          String(t.invoiceNumber ?? t.saleNumber ?? "-"),
          String(t.status ?? "-").toLowerCase(),
          String(t.product ?? "-"),
          String(t.category ?? "-"),
          qty(t.quantity),
          money(t.unitPrice),
          money(t.discount),
          money(t.total),
          `${qty(t.taxRate)}%`,
          money(t.taxAmount),
          paymentLabel(t),
          String(t.seller ?? "-"),
        ]),
        totals: ["Total", "", "", "", "", qty(totals.q), "", money(totals.d), money(totals.amt), "", money(totals.tax), "", ""],
        emptyText: "No sales in this period.",
      },
      ...(truncated ? [{ kind: "note" as const, text: `Only the first ${MAX_SALE_PAGES * 500} receipts are listed; narrow the date range for the full detail.` }] : []),
    ],
    subject: "Detailed sales report",
  }
  return { spec, filename: `sales-report-${start ?? "all"}-${end ?? "all"}.pdf` }
})

// Stock (opening / in / out / closing — closing stock at a given date, Art. 7.31)

export const getStockReportPdf = pdfRoute("stock report", async (req, organizationId) => {
  const asOf = validDate(req.query.asOf)
  const end = asOf ?? validDate(req.query.endDate) ?? todayIso()
  const start = asOf ?? validDate(req.query.startDate) ?? end
  const header = await buildHeader(req, organizationId)
  const data = await captureJson(getStockReport, req, { startDate: start, endDate: end })
  const rows: any[] = [...(data.data ?? [])].sort((a, b) => String(a.productName).localeCompare(String(b.productName)))
  const s = data.summary ?? {}

  const spec: A4ReportSpec = {
    title: asOf ? "CLOSING STOCK REPORT" : "STOCK REPORT",
    subtitle: asOf ? `Stock on hand as at ${end}` : "Opening, movements and closing stock",
    header,
    meta: [["From", start], ["To (closing date)", end], ...baseMeta(), ["Items", String(rows.length)]],
    blocks: [
      {
        kind: "kv",
        heading: "Summary",
        rows: [
          ["Opening stock (qty)", qty(s.totalOpening)],
          ["Stock in (qty)", qty(s.totalIn)],
          ["Stock out (qty)", qty(s.totalOut)],
          ["Closing stock (qty)", qty(s.totalClosing)],
          ["Closing stock value", money(s.totalValue)],
          ["Number of items", String(rows.length)],
        ],
      },
      {
        kind: "table",
        heading: "Stock per item",
        columns: [
          { label: "Item", width: 3.6 },
          { label: "Batch", width: 1.5 },
          { label: "Unit price", width: 1.5, align: "right" },
          { label: "Opening", width: 1.3, align: "right" },
          { label: "In", width: 1.2, align: "right" },
          { label: "Out", width: 1.2, align: "right" },
          { label: `Closing ${end}`, width: 1.5, align: "right" },
          { label: "Value", width: 1.7, align: "right" },
        ],
        rows: rows.map((r) => [
          String(r.productName ?? "-"),
          String(r.batchNumber ?? "-"),
          money(r.unitPrice),
          qty(r.openingStock),
          qty(r.stockIn),
          qty(r.stockOut),
          qty(r.closingStock),
          money(r.stockValue),
        ]),
        totals: ["Total", "", "", qty(s.totalOpening), qty(s.totalIn), qty(s.totalOut), qty(s.totalClosing), money(s.totalValue)],
        emptyText: "No items in stock.",
      },
      { kind: "note", text: "Quantities are computed from the inventory ledger up to the end of each date. Value is at purchase price where recorded, otherwise at sales price." },
    ],
    subject: asOf ? "Closing stock report" : "Stock report",
  }
  return { spec, filename: `${asOf ? "closing-stock" : "stock-report"}-${end}.pdf` }
})

// Items (catalogue with RRA classification)

export const getItemsReportPdf = pdfRoute("items report", async (req, organizationId) => {
  const header = await buildHeader(req, organizationId)
  const branchFilter = buildBranchFilter(req)
  const products = await prisma.product.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      itemCd: true,
      itemClsCd: true,
      category: true,
      itemType: true,
      taxCode: true,
      measurementUnit: true,
      qtyUnitCd: true,
      pkgUnitCd: true,
      unitPrice: true,
      purchasePrice: true,
      quantity: true,
      isActive: true,
      ebmSyncStatus: true,
    },
    orderBy: { name: "asc" },
    take: 5000,
  })

  // Branch-scoped on-hand from the ledger when a branch is selected; catalogue quantity otherwise.
  let onHand: Map<number, number> | null = null
  if (Object.keys(branchFilter).length) {
    const grouped = await prisma.inventoryLedger.groupBy({
      by: ["productId", "direction"],
      where: { organizationId, ...branchFilter },
      _sum: { quantity: true },
    })
    onHand = new Map()
    for (const g of grouped) {
      const q = Number(g._sum.quantity ?? 0)
      onHand.set(g.productId, (onHand.get(g.productId) ?? 0) + (g.direction === "IN" ? q : -q))
    }
  }

  const rows = products.map((p) => {
    const stock = onHand ? onHand.get(p.id) ?? 0 : Number(p.quantity)
    return { p, stock }
  })
  const totalValue = rows.reduce((s, { p, stock }) => s + (p.itemType === "SERVICE" ? 0 : stock * Number(p.purchasePrice ?? p.unitPrice)), 0)

  const spec: A4ReportSpec = {
    title: "ITEMS REPORT",
    subtitle: "Registered items and stock status",
    header,
    landscape: true,
    meta: [...baseMeta(), ["Items", String(products.length)], ["Active", String(products.filter((p) => p.isActive).length)]],
    blocks: [
      {
        kind: "table",
        heading: "Items",
        columns: [
          { label: "Item code", width: 2.4 },
          { label: "Item name", width: 3.4 },
          { label: "Classification", width: 1.7 },
          { label: "Category", width: 1.7 },
          { label: "Type", width: 1.5 },
          { label: "Tax", width: 0.9, align: "center" },
          { label: "Unit", width: 0.9, align: "center" },
          { label: "Sales price", width: 1.5, align: "right" },
          { label: "Purchase price", width: 1.5, align: "right" },
          { label: "In stock", width: 1.2, align: "right" },
          { label: "RRA sync", width: 1.3 },
          { label: "Status", width: 1.1 },
        ],
        rows: rows.map(({ p, stock }) => [
          p.itemCd ?? "-",
          p.name,
          p.itemClsCd ?? "-",
          p.category ?? "-",
          String(p.itemType).toLowerCase().replace(/_/g, " "),
          p.taxCode ?? "-",
          p.qtyUnitCd ?? String(p.measurementUnit),
          money(Number(p.unitPrice)),
          p.purchasePrice != null ? money(Number(p.purchasePrice)) : "-",
          p.itemType === "SERVICE" ? "n/a" : qty(stock),
          String(p.ebmSyncStatus).toLowerCase(),
          p.isActive ? "active" : "inactive",
        ]),
        emptyText: "No items registered.",
      },
      { kind: "kv", heading: "Summary", rows: [["Stock value (at purchase price)", money(totalValue)], ["Items listed", String(products.length)]] },
    ],
    subject: "Items report",
  }
  return { spec, filename: `items-report-${todayIso()}.pdf` }
})

// Purchases (local purchase orders + supplier invoices received from RRA + imports)

function importTable(items: any[]) {
  return {
    kind: "table" as const,
    columns: [
      { label: "Declaration", width: 1.9 },
      { label: "Date", width: 1.3 },
      { label: "Seq", width: 0.6, align: "right" as const },
      { label: "HS code", width: 1.4 },
      { label: "Item", width: 3 },
      { label: "Origin", width: 0.9, align: "center" as const },
      { label: "Supplier", width: 2.2 },
      { label: "Qty", width: 1, align: "right" as const },
      { label: "Invoice amount", width: 1.7, align: "right" as const },
      { label: "Status", width: 1.2 },
    ],
    rows: items.map((i) => [
      String(i.dclNo ?? "-"),
      ymd(i.dclDe),
      String(i.itemSeq ?? "-"),
      String(i.hsCd ?? "-"),
      String(i.itemNm ?? "-"),
      String(i.orgnNatCd ?? "-"),
      String(i.supplier ?? "-"),
      i.qty != null ? qty(i.qty) : "-",
      i.invcFcurAmt != null ? `${money(i.invcFcurAmt)} ${i.invcFcurCd ?? ""}`.trim() : "-",
      String(i.status ?? "-").toLowerCase(),
    ]),
    emptyText: "No import declarations in this period.",
  }
}

export const getPurchasesReportPdf = pdfRoute("purchases report", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const header = await buildHeader(req, organizationId)
  const data = await captureJson(getPurchasesReport, req)
  const orders: any[] = data.orders ?? []
  const rra = data.rraPurchases ?? { summary: {}, items: [] }
  const imports = data.importation ?? { summary: {}, items: [] }
  const s = data.summary ?? {}

  const lines = orders.flatMap((o) =>
    (o.items ?? []).map((it: any) => [
      String(o.orderNumber ?? o.id),
      String(it.productName ?? "-"),
      qty(it.quantity),
      qty(it.quantityReceived),
      money(it.unitPrice),
      it.taxCode ? `${it.taxCode} ${qty(it.taxRate)}%` : `${qty(it.taxRate)}%`,
      money(it.totalPrice),
    ]),
  )

  const spec: A4ReportSpec = {
    title: "PURCHASES REPORT",
    subtitle: "Purchase orders, RRA supplier invoices and imports",
    header,
    landscape: true,
    meta: [...periodMeta(start, end), ...baseMeta()],
    blocks: [
      {
        kind: "kv",
        heading: "Summary",
        rows: [
          ["Purchase orders", String(s.orderCount ?? 0)],
          ["Purchase orders total", money(s.totalPurchases)],
          ["Purchase orders tax", money(s.totalTax)],
          ["Orders received", String(s.receivedCount ?? 0)],
          ["RRA supplier invoices", String(rra.summary?.invoices ?? 0)],
          ["RRA invoices total", money(rra.summary?.totalAmt)],
          ["RRA invoices tax", money(rra.summary?.totalTax)],
          ["Invoices confirmed / pending / rejected", `${rra.summary?.CONFIRMED ?? 0} / ${rra.summary?.PENDING ?? 0} / ${rra.summary?.REJECTED ?? 0}`],
          ["Import lines", String(imports.summary?.lines ?? 0)],
          ["Imports approved / pending / rejected", `${imports.summary?.APPROVED ?? 0} / ${imports.summary?.PENDING ?? 0} / ${imports.summary?.REJECTED ?? 0}`],
        ],
      },
      {
        kind: "table",
        heading: "Supplier invoices received from RRA",
        columns: [
          { label: "Date", width: 1.3 },
          { label: "Supplier TIN", width: 1.5 },
          { label: "Supplier", width: 3.2 },
          { label: "Invoice no.", width: 1.3, align: "right" },
          { label: "Items", width: 0.8, align: "right" },
          { label: "Tax", width: 1.6, align: "right" },
          { label: "Total", width: 1.8, align: "right" },
          { label: "Status", width: 1.3 },
        ],
        rows: (rra.items ?? []).map((i: any) => [
          ymd(i.salesDt),
          String(i.spplrTin ?? "-"),
          String(i.spplrNm ?? "-"),
          String(i.spplrInvcNo ?? "-"),
          String(i.totItemCnt ?? 0),
          money(i.totTaxAmt),
          money(i.totAmt),
          String(i.status ?? "-").toLowerCase(),
        ]),
        totals: ["Total", "", "", "", "", money(rra.summary?.totalTax), money(rra.summary?.totalAmt), ""],
        emptyText: "No supplier invoices received from RRA in this period.",
      },
      {
        kind: "table",
        heading: "Purchase orders",
        columns: [
          { label: "Order no.", width: 1.7 },
          { label: "Ordered", width: 1.3 },
          { label: "Received", width: 1.3 },
          { label: "Supplier", width: 3 },
          { label: "Branch", width: 1.6 },
          { label: "Status", width: 1.4 },
          { label: "Lines", width: 0.8, align: "right" },
          { label: "Tax", width: 1.5, align: "right" },
          { label: "Total", width: 1.8, align: "right" },
        ],
        rows: orders.map((o) => [
          String(o.orderNumber ?? o.id),
          String(o.orderedAt ?? "-"),
          String(o.receivedAt ?? "-"),
          String(o.supplierName || "-"),
          String(o.branch ?? "-"),
          String(o.status ?? "-").toLowerCase(),
          String(o.itemCount ?? 0),
          money(o.taxTotal),
          money(o.totalAmount),
        ]),
        totals: ["Total", "", "", "", "", "", String(lines.length), money(s.totalTax), money(s.totalPurchases)],
        emptyText: "No purchase orders in this period.",
      },
      {
        kind: "table",
        heading: "Purchase order lines",
        columns: [
          { label: "Order no.", width: 1.7 },
          { label: "Item", width: 4 },
          { label: "Qty ordered", width: 1.3, align: "right" },
          { label: "Qty received", width: 1.3, align: "right" },
          { label: "Unit price", width: 1.6, align: "right" },
          { label: "Tax", width: 1.2, align: "center" },
          { label: "Amount", width: 1.8, align: "right" },
        ],
        rows: lines,
        emptyText: "No purchase order lines in this period.",
      },
      { heading: "Imported items", ...importTable(imports.items ?? []) },
    ],
    subject: "Purchases report",
  }
  return { spec, filename: `purchases-report-${start ?? "all"}-${end ?? "all"}.pdf` }
})

// Importation

export const getImportationReportPdf = pdfRoute("importation report", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const header = await buildHeader(req, organizationId)
  const data = await captureJson(getImportationReport, req)
  let items: any[] = data.items ?? []
  if (start || end) {
    const lo = (start ?? "0000-00-00").replace(/-/g, "")
    const hi = (end ?? "9999-99-99").replace(/-/g, "")
    items = items.filter((i) => {
      const d = String(i.dclDe ?? "").replace(/\D/g, "").slice(0, 8)
      return d >= lo && d <= hi
    })
  }
  const by = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<string, number>
  for (const i of items) by[i.status] = (by[i.status] ?? 0) + 1

  const spec: A4ReportSpec = {
    title: "IMPORTATION REPORT",
    subtitle: "Import declaration items from RRA customs",
    header,
    landscape: true,
    meta: [...periodMeta(start, end), ...baseMeta()],
    blocks: [
      {
        kind: "kv",
        heading: "Summary",
        rows: [
          ["Import lines", String(items.length)],
          ["Approved", String(by.APPROVED ?? 0)],
          ["Pending", String(by.PENDING ?? 0)],
          ["Rejected", String(by.REJECTED ?? 0)],
        ],
      },
      { heading: "Imported items", ...importTable(items) },
    ],
    subject: "Importation report",
  }
  return { spec, filename: `importation-report-${start ?? "all"}-${end ?? "all"}.pdf` }
})

// Electronic journal

const MAX_EJ_PAGES = 25

export const getElectronicJournalPdf = pdfRoute("electronic journal", async (req, organizationId) => {
  const start = validDate(req.query.startDate)
  const end = validDate(req.query.endDate)
  const header = await buildHeader(req, organizationId)

  const first = await captureJson(getElectronicJournal, req, { page: "1", limit: "200" })
  const entries: any[] = [...(first.entries ?? [])]
  const pages = Math.min(first.pagination?.totalPages ?? 1, MAX_EJ_PAGES)
  for (let p = 2; p <= pages; p++) {
    const page = await captureJson(getElectronicJournal, req, { page: String(p), limit: "200" })
    entries.push(...(page.entries ?? []))
  }
  const truncated = (first.pagination?.totalPages ?? 1) > MAX_EJ_PAGES
  entries.sort((a, b) => new Date(a.sdcDateTime ?? a.createdAt).getTime() - new Date(b.sdcDateTime ?? b.createdAt).getTime())

  const spec: A4ReportSpec = {
    title: "ELECTRONIC JOURNAL",
    subtitle: "Journal records issued with each receipt",
    header,
    meta: [...periodMeta(start, end), ...baseMeta(), ["Records", String(entries.length)], ["Sent to VSDC", String(entries.filter((e) => e.ejSent).length)]],
    blocks: [
      {
        kind: "table",
        heading: "Journal index",
        columns: [
          { label: "SDC date / time", width: 2 },
          { label: "Invoice", width: 2.8 },
          { label: "Type", width: 0.7, align: "center" },
          { label: "Receipt no. (A/B)", width: 1.6, align: "right" },
          { label: "SDC ID", width: 1.8 },
          { label: "EJ sent", width: 0.8, align: "center" },
        ],
        rows: entries.map((e) => [
          dateTime(e.sdcDateTime ?? e.createdAt),
          String(e.invoiceNumber ?? e.ebmInvoiceNumber ?? "-"),
          String(e.rcptLabel ?? "NS"),
          `${e.sdcRcptNo ?? "-"} / ${e.totalRcptNo ?? "-"}`,
          String(e.sdcId ?? "-"),
          e.ejSent ? "yes" : "no",
        ]),
        emptyText: "No journal records in this period.",
      },
      ...entries.map((e, idx) => ({
        kind: "text" as const,
        heading: idx === 0 ? "Journal records" : undefined,
        caption: `${e.rcptLabel ?? "NS"} ${e.sdcRcptNo ?? "-"}/${e.totalRcptNo ?? "-"}  ·  Invoice ${e.invoiceNumber ?? e.ebmInvoiceNumber ?? "-"}  ·  ${dateTime(e.sdcDateTime ?? e.createdAt)}`,
        lines: String(e.journalText ?? "").split(/\r?\n/),
      })),
      ...(truncated ? [{ kind: "note" as const, text: `Only the first ${MAX_EJ_PAGES * 200} journal records are included; narrow the date range for the rest.` }] : []),
    ],
    subject: "CIS electronic journal",
  }
  return { spec, filename: `electronic-journal-${start ?? "all"}-${end ?? "all"}.pdf` }
})
