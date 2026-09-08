/**
 * Single source of truth for the composed ERP sales-invoice payload
 * produced by GET /api/sales/:orgId/invoices/:saleId.
 *
 * The backend owns all invoice values and the authoritative PDF. These types
 * describe the metadata envelope used for status and filenames in the UI.
 */

import type { InvoicePdfFormat } from "./invoice-pdf"

export interface InvoiceCompany {
  logo?: string | null
  name: string
  address?: string | null
  branchName?: string | null
  bhfId?: string | null
  phone?: string | null
  email?: string | null
  tin?: string | null
  vrn?: string | null
  mrc?: string | null
  website?: string | null
  currency?: string | null
  /** Whether the branch/org is actually configured with RRA/EBM device credentials. */
  ebmLinked?: boolean
}

export interface InvoiceCustomer {
  name: string
  tin?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  vatNo?: string | null
}

export interface InvoiceLineItem {
  id: string
  line: number
  code?: string | null
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discountPct: number
  discountAmt: number
  taxCode?: string | null
  vatPct: number
  taxAmount: number
  subtotal: number
  net: number
  total: number
}

export interface InvoiceTotals {
  subtotal: number
  discount: number
  taxable: number
  vat: number
  tax: number
  shipping: number
  paid: number
  balance: number
  grandTotal: number
}

/**
 * Raw sale-level charges (as stored on the Sale row). The derived `totals` are
 * computed from these + the line items via {@link calculateInvoiceTotals} so the
 * displayed numbers can never drift from the lines being rendered.
 */
export interface InvoiceCharges {
  vatAmount: number
  taxableAmount: number
  discountAmount: number
  cashAmount: number
  insuranceAmount: number
  debtAmount: number
  totalAmount: number
  shipping: number
}

export interface InvoicePayment {
  method?: string | null
  methodLabel?: string | null
  reference?: string | null
  bank?: string | null
  cashAmount?: number
  insuranceAmount?: number
  debtAmount?: number
}

export interface SdcInformation {
  sdcId?: string | null
  mrcNo?: string | null
  receiptNumber?: string | null
  receiptSignature?: string | null
  internalData?: string | null
  sdcDateTime?: string | null
  date?: string | null
  time?: string | null
  ebmInvoiceNumber?: string | null
  rcptLabel?: string | null
  poweredBy?: string | null
  /** §21: CIS software version, printed on every receipt. */
  softwareVersion?: string | null
}

export interface InvoiceCertification {
  isCertified: boolean
  certificateImage?: string | null
  certificateText?: string | null
}

export interface InvoiceVerification {
  qrCodeImage?: string | null
  qrPayload?: string | null
  verificationUrl?: string | null
}

export interface InvoiceBranding {
  primaryColor?: string | null
  rraLogo?: string | null
  poweredBy?: string | null
}

export interface InvoiceInvoice {
  id: string
  saleNumber: string
  invoiceNumber: string
  receiptNumber: string
  invoiceDate: string
  time: string
  paymentMethod: string
  cashier: string
  status: string
  rcptLabel?: string | null
  rcptLabelText?: string | null
  isProforma: boolean
  isCopy: boolean
  currency: string
}

export interface InvoiceFooterNote {
  message?: string | null
  note?: string | null
}

export interface EbmInvoice {
  company: InvoiceCompany
  customer: InvoiceCustomer
  invoice: InvoiceInvoice
  items: InvoiceLineItem[]
  totals: InvoiceTotals
  charges: InvoiceCharges
  payment: InvoicePayment
  sdcInformation: SdcInformation
  certification: InvoiceCertification
  verification: InvoiceVerification
  branding: InvoiceBranding
  footer?: InvoiceFooterNote
  renderedHtml?: string | null
}

/**
 * Single shared source of truth for all money arithmetic used by the invoice
 * preview and every export. Totals are derived from the fetched line items and
 * sale-level charges rather than trusting a separately-sent total, so they can
 * never drift from what is actually rendered.
 */
export function calculateInvoiceTotals(
  items: InvoiceLineItem[],
  charges: InvoiceCharges,
): InvoiceTotals {
  const toNumber = (v: unknown): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const gross = items.reduce((sum, i) => sum + toNumber(i.quantity) * toNumber(i.unitPrice), 0)
  const itemDiscount = items.reduce((sum, i) => sum + toNumber(i.discountAmt), 0)
  const lineTax = items.reduce((sum, i) => sum + toNumber(i.taxAmount), 0)

  const vatAmount = toNumber(charges?.vatAmount)
  const taxableAmount = toNumber(charges?.taxableAmount)
  const discountAmount = toNumber(charges?.discountAmount)
  const cashAmount = toNumber(charges?.cashAmount)
  const insuranceAmount = toNumber(charges?.insuranceAmount)
  const debtAmount = toNumber(charges?.debtAmount)
  const totalAmount = toNumber(charges?.totalAmount)
  const shipping = toNumber(charges?.shipping)

  return {
    subtotal: Math.round(gross),
    discount: Math.max(0, Math.round(itemDiscount + discountAmount)),
    taxable: Math.round(taxableAmount),
    vat: Math.round(vatAmount),
    tax: Math.round(lineTax),
    shipping: Math.round(shipping),
    paid: Math.round(cashAmount + insuranceAmount),
    balance: Math.round(debtAmount),
    grandTotal: Math.round(totalAmount),
  }
}

/** Unwrap `{ success: true, data: {...} }` envelopes returned by the backend. */
export function unwrapInvoice(payload: unknown): EbmInvoice {
  let raw = payload
  if (raw && typeof raw === "object") {
    const r = raw as { success?: boolean; data?: unknown }
    if (r.success === true && r.data != null) raw = r.data
  }
  return raw as EbmInvoice
}

/** A safe, recognisable filename for downloaded or shared sales invoices. */
export function getInvoiceFilename(
  invoice: EbmInvoice | null | undefined,
  fallback = "invoice",
  format: InvoicePdfFormat = "A4",
): string {
  const toFilenamePart = (value: unknown): string => String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const invoiceNumber = toFilenamePart(invoice?.invoice?.invoiceNumber || invoice?.invoice?.saleNumber)
  const fallbackName = toFilenamePart(fallback) || "invoice"
  const name = invoiceNumber || fallbackName
  const suffix = format === "80mm" ? "-80mm" : format === "A5" ? "-A5" : ""

  return `EBM-Invoice-${name}${suffix}.pdf`
}
