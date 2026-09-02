import { describe, expect, it, vi } from "vitest"
import PDFDocument from "pdfkit"
import { generateEbmInvoicePdf } from "../src/services/invoice-pdf.service"
import { generateEbmReceiptPdf80mm } from "../src/services/invoice-receipt-pdf.service"
import type { RenderInvoicePayload } from "../src/services/invoice-render.service"

/**
 * A proforma / training slip is never signed by VSDC, so `sdcInformation`
 * carries no signature, internal data or SDC receipt counter. The printed slip
 * must still show the transaction date/time and the (local) receipt number
 * under SDC INFORMATION — regression guard for those lines silently dropping.
 */
function proformaFixture(): RenderInvoicePayload {
  return {
    company: { logo: null, name: "Configured Taxpayer", address: "Kigali", phone: "+250700000000", tin: "100000000", currency: "RWF", ebmLinked: true },
    customer: { name: "Walk-in", tin: null, address: "Kigali" },
    invoice: {
      id: "55", saleNumber: "SALE-55", invoiceNumber: "55", receiptNumber: "7/4 PS",
      invoiceDate: "2026-09-02T09:38:42.000Z", time: "11:38:42",
      paymentMethod: "Cash", cashier: "Cashier", status: "COMPLETED",
      rcptLabel: "PS", isProforma: true, isCopy: false, currency: "RWF",
    },
    items: [{ line: 1, code: "RW1NTXU0000001", description: "Test item", quantity: 1, unit: "PCS", unitPrice: 1180, discountPct: 0, discountAmt: 0, taxCode: "B", vatPct: 18, taxAmount: 180, subtotal: 1180, net: 1180, total: 1180 }],
    totals: { subtotal: 1180, discount: 0, taxable: 1000, vat: 180, tax: 180, shipping: 0, paid: 1180, balance: 0, grandTotal: 1180 },
    charges: { vatAmount: 180, taxableAmount: 1000, discountAmount: 0, cashAmount: 1180, insuranceAmount: 0, debtAmount: 0, totalAmount: 1180, shipping: 0 },
    payment: { method: "CASH", methodLabel: "Cash", cashAmount: 1180, insuranceAmount: 0, debtAmount: 0 },
    sdcInformation: {
      sdcId: "SDC012000250", mrcNo: "MRC012000250",
      // The signature-bearing fields are deliberately absent for a proforma.
      receiptNumber: "7/4 PS", receiptSignature: null, internalData: null,
      sdcDateTime: "2026-09-02T09:38:42.000Z", date: "2026-09-02T09:38:42.000Z", time: "11:38:42",
      ebmInvoiceNumber: "55", rcptLabel: "PS", poweredBy: "x", softwareVersion: "v1.0.0",
    },
    certification: { isCertified: false },
    verification: { qrCodeImage: null, qrPayload: null, verificationUrl: null },
    branding: {},
  }
}

/** Collect every string drawn into the PDF, regardless of stream compression. */
function captureText(run: () => Promise<Buffer>): Promise<string[]> {
  const drawn: string[] = []
  const spy = vi.spyOn(PDFDocument.prototype, "text").mockImplementation(function (this: any, text: unknown, ...rest: unknown[]) {
    drawn.push(String(text))
    return this
  })
  return run().finally(() => spy.mockRestore()).then(() => drawn)
}

describe("proforma / training slip fiscal block", () => {
  it("A4: prints Date, Time, SDC ID and RECEIPT NUMBER even without a VSDC signature", async () => {
    const drawn = await captureText(() => generateEbmInvoicePdf(proformaFixture(), "A4"))
    const blob = drawn.join("\n")
    expect(blob).toMatch(/Date: 02-09-2026 Time: 11:38:42/)
    expect(blob).toMatch(/SDC ID: SDC012000250/)
    expect(blob).toMatch(/RECEIPT NUMBER: 7\/4 PS/)
  })

  it("A4: RECEIPT NUMBER falls back to the invoice receipt number when sdc.receiptNumber is missing", async () => {
    const fixture = proformaFixture()
    fixture.sdcInformation.receiptNumber = null
    fixture.sdcInformation.sdcDateTime = null
    fixture.sdcInformation.date = null
    const drawn = await captureText(() => generateEbmInvoicePdf(fixture, "A4"))
    const blob = drawn.join("\n")
    expect(blob).toMatch(/RECEIPT NUMBER: 7\/4 PS/)
    expect(blob).toMatch(/Date: 02-09-2026/)
  })

  it("80mm: prints Date, SDC ID and RECEIPT NUMBER for a proforma", async () => {
    const drawn = await captureText(() => generateEbmReceiptPdf80mm(proformaFixture()))
    const blob = drawn.join("\n")
    expect(blob).toMatch(/SDC ID: SDC012000250/)
    expect(blob).toMatch(/RECEIPT NUMBER: 7\/4 PS/)
    expect(blob).toMatch(/Date: 02-09-2026/)
  })

  it("a training slip renders the same SDC INFORMATION block as a proforma", async () => {
    const training = proformaFixture()
    training.invoice.isProforma = false
    training.invoice.rcptLabel = "TS"
    training.invoice.receiptNumber = "12/9 TS"
    training.sdcInformation.rcptLabel = "TS"
    training.sdcInformation.receiptNumber = "12/9 TS"

    for (const run of [
      () => generateEbmInvoicePdf(training, "A4"),
      () => generateEbmReceiptPdf80mm(training),
    ]) {
      const blob = (await captureText(run)).join("\n")
      // Same non-fiscal footer as proforma: repeats SDC ID, no "Payment Mode"
      // line and no bare software-version line.
      expect(blob).toMatch(/SDC ID: SDC012000250/)
      expect(blob).toMatch(/RECEIPT NUMBER: 12\/9 TS/)
      expect(blob).not.toMatch(/Payment Mode:/)
      expect(blob).not.toMatch(/Software version/)
    }
  })
})
