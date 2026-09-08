import PDFDocument from "pdfkit"
import type { RenderInvoicePayload } from "./invoice-render.service"
import { formatInvoiceAmount, formatInvoiceDateTime, formatInvoiceQuantity, groupFiscalValue } from "./invoice-format.service"
import { getOrganizationLogo, getRraCertificationLogo } from "./invoice-logo.service"
import { NOT_FISCALIZED_NOTICE, NOT_OFFICIAL_RECEIPT_NOTICE, REFUND_NOTICE, SYSTEM_FOOTER, TRAINING_MODE_LABEL } from "./system-branding.service"
import { dataUrlBuffer, documentIndicator, isFormalNoticeIndicator, isRefundTransaction, safe, taxGroups } from "./invoice-pdf.service"

/**
 * Narrow, continuous "thermal roll" layout for 80mm POS printers — the
 * classic CIS/VSDC receipt format shown in the technical spec's own worked
 * examples (§13–17), as an alternative to the A4 sheet from
 * invoice-pdf.service.ts. Both renderers consume the same RenderInvoicePayload,
 * so nothing about how a sale is composed changes between formats.
 */

// 80mm paper at 72pt/inch, with a small margin on each side for the printer's
// unprintable edge — matches what real thermal printers leave blank.
const PAGE_WIDTH = 226.77
const MARGIN = 10
const CONTENT_LEFT = MARGIN
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const FONT = "Courier"
const FONT_BOLD = "Courier-Bold"
// Generous scratch height for the measuring pass; the real page is sized to
// the exact content height this pass reports.
const MEASURE_HEIGHT = 4000

function dashedLine(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(CONTENT_LEFT, y).lineTo(CONTENT_RIGHT, y).dash(1.5, { space: 1.2 }).stroke().undash()
}

function centeredText(doc: PDFKit.PDFDocument, text: string, y: number, bold = false, size = 6.4): number {
  doc.font(bold ? FONT_BOLD : FONT).fontSize(size)
  doc.text(text, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" })
  return y + doc.heightOfString(text, { width: CONTENT_WIDTH }) + 1
}

/** Left-aligned label + right-aligned value on the same line, like a receipt column pair. */
function labelValueLine(doc: PDFKit.PDFDocument, label: string, value: string, y: number, bold = false): number {
  doc.font(bold ? FONT_BOLD : FONT).fontSize(6.2)
  doc.text(label, CONTENT_LEFT, y, { width: CONTENT_WIDTH * 0.55, align: "left" })
  doc.text(value, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "right" })
  return y + Math.max(doc.heightOfString(label, { width: CONTENT_WIDTH * 0.55 }), 8) + 1
}

function wrappedLine(doc: PDFKit.PDFDocument, text: string, y: number, size = 6.2): number {
  doc.font(FONT).fontSize(size)
  doc.text(text, CONTENT_LEFT, y, { width: CONTENT_WIDTH })
  return y + doc.heightOfString(text, { width: CONTENT_WIDTH }) + 1
}

/**
 * Draws the whole receipt starting at `startY` and returns the final y
 * position. Called twice: once on a tall scratch page purely to learn the
 * total content height, then again on the real, exactly-sized page.
 */
function drawReceipt(
  doc: PDFKit.PDFDocument,
  data: RenderInvoicePayload,
  companyLogo: Buffer | null,
  certificationLogo: Buffer | null,
  startY: number,
): number {
  let y = startY

  // Same two logos as the A4 layout (invoice-pdf.service.ts drawHeader):
  // the RRA logo on the left, the EBM certification seal on the right —
  // just stacked side by side instead of flanking the full-width company
  // block, since 80mm paper has no room for that.
  const logoSize = 28
  let usedLogoRow = false
  if (companyLogo) {
    try {
      doc.image(companyLogo, CONTENT_LEFT, y, { fit: [logoSize, logoSize] })
      usedLogoRow = true
    } catch {
      // Logo is best-effort on the compact layout; text content always prints.
    }
  }
  if (certificationLogo) {
    try {
      doc.image(certificationLogo, CONTENT_RIGHT - logoSize, y, { fit: [logoSize, logoSize] })
      usedLogoRow = true
    } catch {
      // Logo is best-effort on the compact layout; text content always prints.
    }
  }
  if (usedLogoRow) y += logoSize + 4

  y = centeredText(doc, safe(data.company.name, "—"), y, true, 7.5)
  if (data.company.address) y = centeredText(doc, safe(data.company.address), y)
  if (data.company.phone) y = centeredText(doc, `TEL: ${safe(data.company.phone)}`, y)
  y = centeredText(doc, `TIN: ${safe(data.company.tin, "-")}`, y)

  const indicator = documentIndicator(data)
  const isTraining = indicator === TRAINING_MODE_LABEL
  const isProforma = indicator === "PROFORMA"
  if (indicator) {
    y += 2
    y = centeredText(doc, indicator, y, true, 8)
  }
  // Real sale printed before VSDC confirmed it — spell out that the slip is
  // provisional right under the NOT FISCALISED title.
  if (data.invoice.notFiscalized) {
    y = centeredText(doc, NOT_FISCALIZED_NOTICE, y, true, 6)
  }
  // A copied refund (watermark title "COPY") is still a refund and keeps its
  // reference to the original sale, independent of which title printed above.
  if (isRefundTransaction(data)) {
    if (data.invoice.originalReceiptNumber) {
      y = centeredText(doc, `REF. NORMAL RECEIPT#: ${safe(data.invoice.originalReceiptNumber)}`, y)
    }
    y = centeredText(doc, REFUND_NOTICE, y, true)
  }

  y += 2
  dashedLine(doc, y)
  y += 5
  // RRA checklist §35: TIN, name, and mobile contact must always be shown,
  // labels included even when a field is blank — never drop the whole line.
  y = centeredText(doc, `Client: ${safe(data.customer.name)}`, y)
  y = centeredText(doc, `Client TIN: ${safe(data.customer.tin)}`, y)
  y = centeredText(doc, `Client Tel: ${safe(data.customer.phone)}`, y)
  y += 2
  dashedLine(doc, y)
  y += 6

  for (const item of data.items) {
    y = wrappedLine(doc, safe(item.description, "-"), y, 6.3)
    const taxSuffix = safe(item.taxCode)
    const priceLine = `${formatInvoiceAmount(item.unitPrice)}x ${formatInvoiceQuantity(item.quantity)}`
    const totalLine = `${formatInvoiceAmount(item.subtotal)}${taxSuffix}`
    y = labelValueLine(doc, priceLine, totalLine, y)
    if (item.discountPct > 0) {
      y = labelValueLine(doc, `discount -${formatInvoiceQuantity(item.discountPct)}%`, formatInvoiceAmount(item.total), y)
    }
  }

  y += 2
  dashedLine(doc, y)
  y += 5

  const currency = safe(data.invoice.currency || data.company.currency, "RWF")
  const currencyLabel = currency.toUpperCase() === "RWF" ? "" : ` ${currency.toUpperCase()}`
  const groups = taxGroups(data)
  const totalTax = groups.reduce((sum, group) => sum + group.tax, 0)

  y = labelValueLine(doc, `TOTAL${currencyLabel}`, formatInvoiceAmount(data.totals.grandTotal), y, true)
  for (const group of groups) {
    const groupLabel = /^[A-D]$/.test(group.code) ? `${group.code}-${formatInvoiceQuantity(group.rate)}%` : group.code
    y = labelValueLine(doc, `TOTAL ${groupLabel}`, formatInvoiceAmount(group.total), y)
    y = labelValueLine(doc, `TOTAL TAX ${group.code}`, formatInvoiceAmount(group.tax), y)
  }
  y = labelValueLine(doc, "TOTAL TAX", formatInvoiceAmount(totalTax), y)

  y += 2
  dashedLine(doc, y)
  y += 5
  y = labelValueLine(doc, safe(data.invoice.paymentMethod, "CASH").toUpperCase(), formatInvoiceAmount(data.totals.grandTotal), y)
  y = labelValueLine(doc, "ITEMS NUMBER", String(data.items.length), y)
  y += 2
  dashedLine(doc, y)
  y += 6

  const requiresNotice = isFormalNoticeIndicator(indicator) || !data.certification.isCertified
  if (requiresNotice) {
    y = centeredText(doc, NOT_OFFICIAL_RECEIPT_NOTICE, y, true, 6.6)
    y += 3
  }

  const sdc = data.sdcInformation
  // §11/§15-17: COPY repeats its title once more directly above SDC
  // INFORMATION. TRAINING MODE and PROFORMA already print once at the top of
  // the receipt — repeating either here is redundant.
  if (isFormalNoticeIndicator(indicator) && !isTraining && !isProforma) {
    dashedLine(doc, y)
    y += 3
    y = centeredText(doc, indicator, y, true)
    y += 1
  }
  y = centeredText(doc, "SDC INFORMATION", y, true)
  y += 1
  // Proforma / training slips have no VSDC signature but must still print the
  // transaction date/time and receipt number here — fall back to the
  // invoice-level values when the fiscal-specific fields are absent.
  const sdcDate = formatInvoiceDateTime(sdc.sdcDateTime || sdc.date || data.invoice.invoiceDate)
  const sdcReceiptNo = safe(sdc.receiptNumber) || safe(data.invoice.receiptNumber)
  if (sdcDate.date || sdcDate.time) {
    y = wrappedLine(doc, `Date: ${sdcDate.date}  Time: ${sdcDate.time}`, y)
  }
  if (sdc.sdcId) y = wrappedLine(doc, `SDC ID: ${safe(sdc.sdcId)}`, y)
  if (sdcReceiptNo) y = wrappedLine(doc, `RECEIPT NUMBER: ${sdcReceiptNo}`, y)
  if (sdc.internalData) {
    y = wrappedLine(doc, "Internal Data:", y)
    y = centeredText(doc, groupFiscalValue(sdc.internalData), y, false, 5.8)
  }
  if (sdc.receiptSignature) {
    y = wrappedLine(doc, "Receipt Signature:", y)
    y = centeredText(doc, groupFiscalValue(sdc.receiptSignature), y, false, 5.8)
  }

  const qr = dataUrlBuffer(data.verification.qrCodeImage)
  if (qr) {
    y += 3
    try {
      doc.image(qr, PAGE_WIDTH / 2 - 27, y, { fit: [54, 54] })
      y += 58
    } catch {
      // QR is best-effort — the printed fiscal text above is the fallback.
    }
  }

  y += 2
  dashedLine(doc, y)
  y += 5
  // No repeated "RECEIPT NUMBER" here — it already prints once above (SDC
  // INFORMATION block) and the invoice number already shows once at the top
  // of the receipt; showing either again here is just a duplicate value under
  // a new label, most confusing for proforma/training receipts.
  const invoiceDate = formatInvoiceDateTime(data.invoice.invoiceDate)
  y = wrappedLine(doc, `DATE: ${invoiceDate.date}  TIME: ${invoiceDate.time}`, y)
  if (data.company.mrc) y = wrappedLine(doc, `MRC: ${safe(data.company.mrc)}`, y)
  // Proforma and training-mode slips share the same non-fiscal SDC
  // INFORMATION block: they repeat the SDC ID here instead of the software
  // version. §21 still requires the software version on every other (real)
  // receipt type.
  if (isProforma || isTraining) {
    if (sdc.sdcId) y = wrappedLine(doc, `SDC ID: ${safe(sdc.sdcId)}`, y)
  } else if (sdc.softwareVersion) {
    y = wrappedLine(doc, safe(sdc.softwareVersion), y)
  }

  y += 3
  dashedLine(doc, y)
  y += 6
  y = centeredText(doc, "THANK YOU", y, true)
  if (data.footer?.message) y = centeredText(doc, safe(data.footer.message), y)
  y += 4
  y = centeredText(doc, safe(sdc.poweredBy, SYSTEM_FOOTER), y, false, 4.6)

  return y
}

/** Generate the alternative 80mm thermal-roll EBM invoice/receipt. */
export async function generateEbmReceiptPdf80mm(data: RenderInvoicePayload): Promise<Buffer> {
  const [companyLogo, certificationLogo] = await Promise.all([
    getOrganizationLogo(),
    getRraCertificationLogo(),
  ])

  const invoiceTimestamp = new Date(data.invoice.invoiceDate)
  const stableTimestamp = Number.isNaN(invoiceTimestamp.getTime()) ? new Date(0) : invoiceTimestamp
  const documentInfo = {
    Title: `EBM Invoice ${data.invoice.invoiceNumber}`,
    Author: data.company.name,
    Subject: "RRA VSDC EBM 2.1 fiscal invoice (80mm)",
    Creator: "Excel Edge backend invoice service",
    Producer: "PDFKit",
    CreationDate: stableTimestamp,
    ModDate: stableTimestamp,
  }

  // Pass 1: measure on a generously tall scratch page — its output is discarded.
  const scratch = new PDFDocument({ autoFirstPage: false, size: [PAGE_WIDTH, MEASURE_HEIGHT], margin: 0 })
  scratch.on("data", () => {})
  scratch.addPage({ size: [PAGE_WIDTH, MEASURE_HEIGHT], margin: 0 })
  const measuredHeight = drawReceipt(scratch, data, companyLogo, certificationLogo, MARGIN)
  scratch.end()

  // Pass 2: the real page, sized to exactly what was measured (+ bottom margin).
  const pageHeight = Math.ceil(measuredHeight) + MARGIN
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: [PAGE_WIDTH, pageHeight],
    margin: 0,
    compress: true,
    info: documentInfo,
  })

  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  doc.addPage({ size: [PAGE_WIDTH, pageHeight], margin: 0 })
  drawReceipt(doc, data, companyLogo, certificationLogo, MARGIN)
  doc.end()
  return output
}
