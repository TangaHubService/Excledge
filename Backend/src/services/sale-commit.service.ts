import { prisma } from "../lib/prisma"
import { EbmOperation } from "@prisma/client"
import { auditLogger } from "../utils/auditLogger"
import { removeStock } from "./inventory-ledger.service"
import {
  generateInvoiceNumber,
  consumeOrgPurchaseCode,
  isEbmEnabled,
  allocateLocalReceiptSequence,
} from "./rra-ebm.service"
import { processEbmOutboxBatch } from "./ebm-outbox.service"
import { selectBatchesForSale, updateBatchQuantity } from "./batch.service"
import { getAverageCost } from "./cost-price.service"
import { TaxService } from "./tax.service"
import { getOrganizationSettings } from "./organization-settings.service"

/**
 * Shared "commit a sale" pipeline used by both the POS checkout
 * (`createSale`) and proforma conversion (`convertProforma`). It owns the
 * server-side gatekeeping, the atomic sale transaction (stock, batches, invoice
 * numbering, outbox) and the bounded inline fiscalization wait.
 *
 * Behaviour is identical to the original inline `createSale` body — the only
 * addition is `proformaSourceId`, stamped on the created sale when the sale is
 * the NS result of converting a proforma.
 */

export type CommitSaleItemInput = {
  productId?: number | string | null
  quantity: number
  unitPrice: number
  itemType?: "PRODUCT" | "SERVICE"
  serviceName?: string | null
  serviceDescription?: string | null
  measurementUnit?: string | null
  exemptionReference?: string | null
}

export type CommitSalePayment = {
  paymentMethod: string
  amount: number
  reference?: string | null
  metadata?: Record<string, unknown> | null
}

export interface CommitSaleParams {
  organizationId: number
  branchId: number
  userId: number
  customerId: number
  items: CommitSaleItemInput[]
  paymentType?: string
  cashAmount?: number
  debtAmount?: number
  insuranceAmount?: number
  payments?: CommitSalePayment[]
  shiftId?: number | string | null
  isProforma?: boolean
  /** Set when this NS sale is the conversion result of a proforma. */
  proformaSourceId?: number
  inventoryMethod?: "FIFO" | "LIFO" | "AVERAGE"
  /** Express request — used only for audit-log request context. */
  req: any
}

export interface CommitSaleResult {
  sale: any
  completeSale: any
  fiscalization: { status: "success" | "pending" | "failed"; sdcRcptNo: number | null; isCertified: boolean }
}

/** A client/business-rule failure that maps to a specific HTTP status. */
export class CommitSaleError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.name = "CommitSaleError"
    this.statusCode = statusCode
  }
}

export async function commitSale(params: CommitSaleParams): Promise<CommitSaleResult> {
  const {
    organizationId,
    branchId,
    userId,
    customerId,
    items,
    paymentType,
    cashAmount,
    debtAmount,
    insuranceAmount,
    payments: splitPayments,
    shiftId,
    isProforma,
    proformaSourceId,
    req,
  } = params

  const orgSettings = await getOrganizationSettings(organizationId)

  if (!items || items.length === 0) {
    throw new CommitSaleError(400, "Sale must have at least one item")
  }

  // If a shiftId was supplied, it must be this user's own open shift — prevents
  // attributing a sale to someone else's till or an already-closed shift.
  let resolvedShiftId: number | undefined
  if (shiftId !== undefined && shiftId !== null && shiftId !== "") {
    const shift = await prisma.shift.findFirst({
      where: { id: parseInt(String(shiftId)), organizationId, userId, status: { in: ["OPEN", "REOPENED"] } },
      select: { id: true },
    })
    if (!shift) {
      throw new CommitSaleError(400, "Shift is not open or does not belong to you")
    }
    resolvedShiftId = shift.id
  } else {
    // Business rule: every transaction belongs to a shift. When the caller does
    // not supply one, attach this user's currently active shift (if any).
    const active = await prisma.shift.findFirst({
      where: { organizationId, userId, status: { in: ["OPEN", "REOPENED"] } },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    })
    resolvedShiftId = active?.id
  }

  // ── B2B purchase-code pre-check ──
  // RRA rejects (resultCd 910) any business-TIN (non-7-prefix) sale submitted
  // without a valid 6-character prcOrdCd — confirmed against the sandbox.
  // Catching this before the sale commits avoids completing a checkout (payment
  // taken, stock deducted) that can never be fiscalized. Skipped for proforma:
  // it is never fiscalized, so RRA never sees it.
  if (!isProforma && isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { TIN: true, prcOrdCd: true },
    })
    const custTin = customer?.TIN?.trim() ?? ""
    if (custTin && !custTin.startsWith("7")) {
      const poolCount = await prisma.organizationPurchaseCode.count({
        where: { organizationId, buyerTin: custTin, consumed: false },
      })
      const fallbackCode = customer?.prcOrdCd?.trim()
      const hasValidFallback = !!fallbackCode && fallbackCode.length === 6
      if (poolCount === 0 && !hasValidFallback) {
        throw new CommitSaleError(
          400,
          `This customer has a business TIN (${custTin}) but no RRA purchase order code on file. Add a 6-character purchase code for this customer before completing the sale.`,
        )
      }
    }
  }

  // Separate product items from service items
  const productItems = items.filter((i: any) => i.itemType !== "SERVICE")

  // ── Server-side mathematical gatekeeper (Module 2.2) ──
  const clientTotal = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unitPrice), 0)

  const calculatedDebt = clientTotal - (cashAmount || 0) - (insuranceAmount || 0)
  if (Math.abs(calculatedDebt - (debtAmount || 0)) > 0.01) {
    throw new CommitSaleError(
      400,
      "Payment amounts do not match total. Total must equal cashAmount + insuranceAmount + debtAmount",
    )
  }

  // Fetch all products once up-front for tax calculation
  const productIds = productItems
    .map((i: any) => parseInt(i.productId))
    .filter((id: number) => !isNaN(id))

  const products = productIds.length > 0
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, organizationId },
        select: { id: true, unitPrice: true, taxCategory: true, taxCode: true, name: true },
      })
    : []

  const productMap = new Map(products.map((p) => [p.id, p]))

  // When the org disallows manual discounts, sellers may not submit a unit price
  // below the catalog price.
  if (!orgSettings.featureFlags.allowManualDiscounts) {
    for (const item of productItems) {
      const product = productMap.get(parseInt(String(item.productId)))
      if (!product) continue
      const catalogPrice = Number(product.unitPrice)
      if (Number(item.unitPrice) < catalogPrice - 0.01) {
        throw new CommitSaleError(
          400,
          `Manual price overrides are disabled for this organization. "${product.name}" must be sold at ${catalogPrice}.`,
        )
      }
    }
  }

  // Automatically determine paymentType if multiple payment methods are used
  let finalPaymentType = paymentType
  const hasCash = (cashAmount || 0) > 0
  const hasInsurance = (insuranceAmount || 0) > 0
  const hasDebt = (debtAmount || 0) > 0
  const paymentMethodCount = [hasCash, hasInsurance, hasDebt].filter(Boolean).length

  if (paymentType === "MOBILE_MONEY" || paymentType === "CREDIT_CARD") {
    if (hasCash && !hasInsurance && !hasDebt) {
      finalPaymentType = paymentType
    } else if (paymentMethodCount > 1) {
      finalPaymentType = "MIXED"
    }
  } else if (paymentMethodCount > 1 && paymentType !== "MIXED") {
    finalPaymentType = "MIXED"
  } else if (hasDebt && !hasCash && !hasInsurance) {
    finalPaymentType = "DEBT"
  } else if (hasInsurance && !hasCash && !hasDebt) {
    finalPaymentType = "INSURANCE"
  } else if (hasCash && !hasInsurance && !hasDebt && !paymentType) {
    finalPaymentType = "CASH"
  }

  // Sale number now; invoice number is allocated inside the transaction below so
  // that a rollback also rolls back the sequence increment.
  const saleNumber = `SALE-${Date.now()}`

  // C6: determine receipt type label (NS/TS/PS)
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { trainingMode: true, vatRegistered: true, isTaxExempt: true },
  })
  const rcptLabel = isProforma ? "PS" : org?.trainingMode ? "TS" : "NS"

  const inventoryMethod = params.inventoryMethod || "FIFO"

  // ── Atomic transaction ──
  const sale = await prisma.$transaction(
    async (tx) => {
      // 1. Validate stock availability for PRODUCT items only
      for (const item of productItems) {
        const product = productMap.get(parseInt(String(item.productId)))

        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`)
        }

        const stockAggregates = await tx.inventoryLedger.groupBy({
          by: ["direction"],
          where: {
            productId: parseInt(String(item.productId)),
            organizationId: organizationId,
            branchId: { equals: branchId },
          },
          _sum: { quantity: true },
        })

        const inQty = stockAggregates.find((a) => a.direction === "IN")?._sum.quantity || 0
        const outQty = stockAggregates.find((a) => a.direction === "OUT")?._sum.quantity || 0
        const currentStock = inQty - outQty

        if (currentStock < item.quantity && !orgSettings.featureFlags.allowNegativeStock) {
          throw new Error(
            `Insufficient stock for product ${product.name}. Available: ${currentStock}, Requested: ${item.quantity}`,
          )
        }
      }

      // 2. Server-side tax computation with Decimal arithmetic.
      const allItemsForTax = items.map((i: any) => ({
        productId: i.productId ? parseInt(i.productId) : undefined,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        itemType: i.itemType || "PRODUCT",
      }))
      const taxSummary = await TaxService.calculateSaleTax(
        organizationId,
        allItemsForTax as any,
        org?.vatRegistered ?? false,
        org?.isTaxExempt ?? false,
      )

      // ── MODULE 2.2: Reconcile server-computed total vs client total ──
      const computedTotal = taxSummary.items.reduce(
        (sum, ti) => sum + Number(ti.taxableAmount) + Number(ti.taxAmount),
        0,
      )
      if (Math.abs(computedTotal - clientTotal) > 0.01) {
        throw new Error(
          `Total amount mismatch: server computed ${computedTotal.toFixed(2)}, client submitted ${clientTotal.toFixed(2)}`,
        )
      }

      // 3. Select batches and calculate costs for PRODUCT items only
      const saleItemsData: any[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const isService = item.itemType === "SERVICE"
        const quantity = item.quantity
        const unitPrice = item.unitPrice
        const itemTax = taxSummary.items[i]

        if (isService) {
          saleItemsData.push({
            quantity,
            unitPrice,
            totalPrice: quantity * unitPrice,
            costPrice: 0,
            profit: quantity * unitPrice,
            taxRate: itemTax?.taxRate || 0,
            taxAmount: itemTax?.taxAmount || 0,
            taxCode: itemTax?.taxCode || null,
            itemType: "SERVICE",
            serviceName: item.serviceName || null,
            serviceDescription: item.serviceDescription || null,
            measurementUnit: item.measurementUnit || "PCS",
            exemptionReference: item.exemptionReference || null,
          })
          continue
        }

        const productId = parseInt(String(item.productId))
        let batchId: number | null = null
        let costPrice = 0

        try {
          const selectedBatches = await selectBatchesForSale(
            {
              productId,
              organizationId: organizationId,
              quantity,
              method: inventoryMethod,
              branchId: branchId,
            },
            tx,
          )

          if (selectedBatches.length > 0) {
            batchId = selectedBatches[0].batchId
            costPrice = selectedBatches[0].unitCost

            for (const batch of selectedBatches) {
              await updateBatchQuantity(batch.batchId, batch.quantity, organizationId, tx)
            }
          } else {
            const avgCost = await getAverageCost(productId, organizationId, branchId)
            costPrice = avgCost?.averageCost || 0
          }
        } catch (error: any) {
          const avgCost = await getAverageCost(productId, organizationId, branchId)
          costPrice = avgCost?.averageCost || 0
        }

        const profit = (unitPrice - costPrice) * quantity

        saleItemsData.push({
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
          costPrice,
          profit,
          taxRate: itemTax.taxRate,
          taxAmount: itemTax.taxAmount,
          taxCode: itemTax.taxCode,
          itemType: "PRODUCT",
          measurementUnit: item.measurementUnit || "PCS",
          exemptionReference: item.exemptionReference || null,
          product: { connect: { id: productId } },
          ...(batchId !== null ? { batch: { connect: { id: batchId } } } : {}),
        })
      }

      // 4. Allocate an invoice/receipt number and create the sale together.
      //
      // PROFORMA is explicitly "not an official receipt" (CIS spec §16/17) and
      // per §6.3.6 must never be assigned a VSDC-signed number — it draws a
      // local, non-fiscal counter instead and never touches the real gapless RRA
      // sequence (vsdcInvcNo stays null).
      let invoiceNumber: string | null
      let vsdcInvcNo: number | null = null
      let localReceiptSeq: number | null = null
      let localReceiptTotalSeq: number | null = null
      if (isProforma) {
        const localSeq = await allocateLocalReceiptSequence(branchId, "PS", tx)
        localReceiptSeq = localSeq.typeSeq
        localReceiptTotalSeq = localSeq.totalSeq
        invoiceNumber = null
      } else {
        const generated = await generateInvoiceNumber(organizationId, branchId, tx)
        invoiceNumber = generated.invoiceNumber
        vsdcInvcNo = generated.vsdcInvcNo
      }

      const newSale = await tx.sale.create({
        data: {
          saleNumber,
          invoiceNumber,
          vsdcInvcNo,
          localReceiptSeq,
          localReceiptTotalSeq,
          customerId: customerId,
          userId: userId,
          organizationId: organizationId,
          branchId: branchId as any,
          paymentType: finalPaymentType,
          cashAmount: cashAmount || 0,
          insuranceAmount: insuranceAmount || 0,
          debtAmount: debtAmount || 0,
          shiftId: resolvedShiftId,
          totalAmount: computedTotal,
          vatAmount: taxSummary.vatAmount,
          taxableAmount: taxSummary.taxableAmount,
          status: "COMPLETED",
          isProforma: !!isProforma,
          rcptLabel: rcptLabel as any,
          ...(proformaSourceId != null ? { proformaSourceId } : {}),
          saleItems: { create: saleItemsData },
        },
        include: {
          saleItems: { include: { product: true, batch: true } },
          customer: true,
        },
      } as any)

      // 4a. Proforma's invoiceNumber is the sale's own id — a plain,
      // auto-incrementing number instead of a "PROF-B..." string.
      if (isProforma) {
        const plainInvoiceNumber = String((newSale as any).id)
        await tx.sale.update({
          where: { id: (newSale as any).id },
          data: { invoiceNumber: plainInvoiceNumber },
        })
        ;(newSale as any).invoiceNumber = plainInvoiceNumber
      }

      // 4b. Consume an organization-level RRA purchase code for business (B2B)
      // buyers. Skipped for proforma.
      const custTin = (newSale as any).customer?.TIN?.trim() ?? ""
      if (!isProforma && custTin && !custTin.startsWith("7")) {
        const allocated =
          (await consumeOrgPurchaseCode(organizationId, custTin, (newSale as any).id, tx)) ??
          ((newSale as any).customer?.prcOrdCd ?? null)
        if (allocated) {
          await tx.sale.update({
            where: { id: (newSale as any).id },
            data: { prcOrdCd: allocated },
          })
          ;(newSale as any).prcOrdCd = allocated
        }
      }

      // 5. Record stock movements for PRODUCT items only. Skipped for proforma.
      if (!isProforma) {
        for (const item of productItems) {
          const saleItem = (newSale as any).saleItems?.find(
            (si: any) => si.productId === parseInt(String(item.productId)),
          )
          if (!saleNumber || saleNumber.trim().length === 0) {
            throw new Error("Stock movement reference cannot be empty")
          }
          await removeStock({
            organizationId: organizationId,
            productId: parseInt(String(item.productId)),
            userId: userId,
            quantity: item.quantity,
            movementType: "SALE",
            branchId: branchId as any,
            reference: saleNumber,
            referenceType: "SALE",
            note: `Sale #${saleNumber}`,
            batchId: saleItem?.batchId || null,
            tx,
          })
        }
      }

      // 6. Update customer balance if debt (atomic with sale). Skipped for proforma.
      if (!isProforma) {
        const remainingDebt = computedTotal - (cashAmount || 0) - (insuranceAmount || 0)
        if (remainingDebt > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { balance: { increment: remainingDebt } },
          })
        }
      }

      // 7. Write transactional outbox entry (atomic with the sale). Skipped for proforma.
      if (!isProforma && isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
        const operation: EbmOperation = "SALE"
        const idempotencyKey = `ebm-${operation}-${organizationId}-${newSale.id}`
        await tx.ebmOutbox.create({
          data: {
            organizationId: organizationId,
            saleId: newSale.id,
            operation,
            idempotencyKey,
            payload: { version: 1, saleId: newSale.id, organizationId: organizationId, operation } as any,
            status: "PENDING",
            nextAttemptAt: new Date(),
          },
        })
      }

      return newSale
    },
    {
      maxWait: 30000,
      timeout: 60000,
    },
  )

  // Bounded wait for the outbox worker to attempt fiscalization before
  // returning, so the caller knows whether the receipt is safe to print.
  let fiscalization: CommitSaleResult["fiscalization"] = {
    status: "success",
    sdcRcptNo: null,
    isCertified: false,
  }

  if (!isProforma && isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
    const EBM_INLINE_WAIT_MS = 5000
    await Promise.race([
      processEbmOutboxBatch(5).catch((e) => {
        console.error("[EBM] immediate fiscalization error:", e)
      }),
      new Promise((resolve) => setTimeout(resolve, EBM_INLINE_WAIT_MS)),
    ])

    const [outboxRow, fiscalTx] = await Promise.all([
      prisma.ebmOutbox.findFirst({
        where: { saleId: sale.id, operation: "SALE" },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      }),
      prisma.ebmTransaction.findFirst({
        where: { saleId: sale.id, submissionStatus: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        select: { sdcRcptNo: true },
      }),
    ])

    if (outboxRow?.status === "SUCCEEDED") {
      fiscalization = { status: "success", sdcRcptNo: fiscalTx?.sdcRcptNo ?? null, isCertified: !!fiscalTx }
    } else if (outboxRow?.status === "DEAD_LETTER") {
      fiscalization = { status: "failed", sdcRcptNo: null, isCertified: false }
    } else {
      fiscalization = { status: "pending", sdcRcptNo: null, isCertified: false }
    }
  }

  // Record split payments if provided
  if (splitPayments && Array.isArray(splitPayments) && splitPayments.length > 0) {
    const validPaymentMethods = [
      "CASH", "BANK", "CARD", "PAYPACK", "MTN_MOMO", "AIRTEL_MONEY", "WALLET", "GIFT_CARD", "STORE_CREDIT",
    ]

    for (const pmt of splitPayments) {
      if (!validPaymentMethods.includes(pmt.paymentMethod)) continue
      const amount = Number(pmt.amount) || 0
      if (amount <= 0) continue

      await prisma.salePayment.create({
        data: {
          saleId: sale.id,
          organizationId,
          amount,
          paymentMethod: pmt.paymentMethod as any,
          reference: pmt.reference || null,
          status: "COMPLETED",
          processedAt: new Date(),
          metadata: (pmt.metadata as any) || null,
        },
      })
    }
  }

  // Log activity (after successful sale)
  await auditLogger.sales(req, {
    type: "SALE_COMPLETED",
    description: `Sale completed (Invoice #${sale.invoiceNumber || saleNumber})`,
    entityType: "Sale",
    entityId: sale.id,
    metadata: {
      invoiceNumber: sale.invoiceNumber,
      totalAmount: sale.totalAmount,
      paymentType: sale.paymentType,
      splitPayments: splitPayments?.length || 0,
      ...(proformaSourceId != null ? { convertedFromProformaId: proformaSourceId } : {}),
    },
  })

  const completeSale = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: {
      saleItems: { include: { product: true, batch: true } },
      customer: true,
      salePayments: true,
    },
  })

  return { sale, completeSale, fiscalization }
}
