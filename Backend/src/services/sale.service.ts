import { prisma } from "../lib/prisma"
import type { PrismaClient, Sale, Customer, User, Branch } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { auditLogger } from "../utils/auditLogger"
import { removeStock, addStock } from "./inventory-ledger.service"
import {
  assertVsdcBranchMasterData,
  assertVsdcProductMasterData,
  generateInvoiceNumber,
  submitInvoiceToEbm,
  submitRefundToEbm,
  submitVoidToEbm,
  isEbmEnabled,
} from "./rra-ebm.service"
import { selectBatchesForSale, updateBatchQuantity } from "./batch.service"
import { calculateProfit } from "./profit.service"
import { getAverageCost } from "./cost-price.service"
import { TaxService } from "./tax.service"
import { buildBranchFilter, getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"

export interface SaleItemInput {
  productId: string
  quantity: number
  unitPrice: number
}

export interface CreateSaleInput {
  customerId: string
  items: SaleItemInput[]
  paymentType: string
  cashAmount?: number
  debtAmount?: number
  insuranceAmount?: number
  purchaseOrderCode?: string
  inventoryMethod?: 'FIFO' | 'LIFO' | 'AVERAGE'
}

export interface SaleFilterParams {
  organizationId: number
  branchId?: number
  startDate?: string
  endDate?: string
  customerId?: string
  limit?: number
  search?: string
  status?: string
  paymentType?: string
}

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000

const executeWithRetry = async (fn: () => Promise<any>, retries = 0): Promise<any> => {
  try {
    return await fn()
  } catch (error: any) {
    if (error.code === 'P2028' && retries < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retries)
      console.log(`Transaction timed out, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return executeWithRetry(fn, retries + 1)
    }
    throw error
  }
}

export const loadSaleWithContext = async (
  req: BranchAuthRequest,
  id: number,
  organizationId: number
) => {
  return prisma.sale.findFirst({
    where: {
      id,
      organizationId,
      ...buildBranchFilter(req)
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          TIN: true,
          customerType: true,
          email: true,
          address: true
        }
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          bhfId: true,
          address: true,
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      saleItems: {
        include: { product: true },
      },
      ebmTransactions: {
        orderBy: { createdAt: "desc" },
      },
    },
  })
}

export const determinePaymentType = (
  paymentType: string,
  cashAmount: number,
  insuranceAmount: number,
  debtAmount: number
): string => {
  const hasCash = cashAmount > 0
  const hasInsurance = insuranceAmount > 0
  const hasDebt = debtAmount > 0
  const paymentMethodCount = [hasCash, hasInsurance, hasDebt].filter(Boolean).length

  if (paymentType === 'MOBILE_MONEY' || paymentType === 'CREDIT_CARD') {
    if (hasCash && !hasInsurance && !hasDebt) {
      return paymentType
    } else if (paymentMethodCount > 1) {
      return 'MIXED'
    }
  } else if (paymentMethodCount > 1 && paymentType !== 'MIXED') {
    return 'MIXED'
  } else if (hasDebt && !hasCash && !hasInsurance) {
    return 'DEBT'
  } else if (hasInsurance && !hasCash && !hasDebt) {
    return 'INSURANCE'
  } else if (hasCash && !hasInsurance && !hasDebt && !paymentType) {
    return 'CASH'
  }

  return paymentType || 'CASH'
}

export const validateSaleInput = (input: CreateSaleInput): void => {
  if (!input.items || input.items.length === 0) {
    throw new Error("Sale must have at least one item")
  }

  let totalAmount = 0
  for (const item of input.items) {
    totalAmount += item.quantity * item.unitPrice
  }

  const calculatedDebt = totalAmount - (input.cashAmount || 0) - (input.insuranceAmount || 0)
  if (Math.abs(calculatedDebt - (input.debtAmount || 0)) > 0.01) {
    throw new Error("Payment amounts do not match total. Total must equal cashAmount + insuranceAmount + debtAmount")
  }
}

export const validateStockAvailability = async (
  items: SaleItemInput[],
  organizationId: number,
  branchId: number,
  tx: any
): Promise<void> => {
  for (const item of items) {
    const product = await tx.product.findFirst({
      where: {
        id: parseInt(item.productId),
        organizationId,
      },
    })

    if (!product) {
      throw new Error(`Product with ID ${item.productId} not found`)
    }

    if (isEbmEnabled()) {
      assertVsdcProductMasterData({
        id: product.id,
        name: product.name,
        itemCode: product.itemCode,
        itemClassCode: product.itemClassCode,
        packageUnitCode: product.packageUnitCode,
        quantityUnitCode: product.quantityUnitCode,
      })
    }

const stockAggregates = await tx.inventoryLedger.groupBy({
        by: ['direction'],
        where: {
          productId: parseInt(item.productId),
          organizationId,
          branchId: { equals: branchId },
        },
        _sum: {
          quantity: true,
        },
      }) as any[]

    const inQty = stockAggregates.find(a => a.direction === 'IN')?._sum.quantity || 0
    const outQty = stockAggregates.find(a => a.direction === 'OUT')?._sum.quantity || 0
    const currentStock = inQty - outQty

    if (currentStock < item.quantity) {
      throw new Error(
        `Insufficient stock for product ${product.name}. Available: ${currentStock}, Requested: ${item.quantity}`
      )
    }
  }
}

export const prepareSaleItems = async (
  items: SaleItemInput[],
  organizationId: number,
  branchId: number,
  inventoryMethod: 'FIFO' | 'LIFO' | 'AVERAGE',
  taxSummary: { items: { taxRate: number; taxAmount: number; taxCode: string | null }[] },
  tx: any
): Promise<{ data: any[]; totalAmount: number }> => {
  const saleItemsData = []
  let totalAmount = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const productId = parseInt(item.productId)
    const quantity = item.quantity
    const unitPrice = item.unitPrice
    const itemTax = taxSummary.items[i]

    totalAmount += quantity * unitPrice

    let batchId: number | null = null
    let costPrice = 0

    try {
      const selectedBatches = await selectBatchesForSale({
        productId,
        organizationId,
        quantity,
        method: inventoryMethod,
        branchId,
      }, tx)

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

    const saleItemData: any = {
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      costPrice,
      profit,
      taxRate: itemTax.taxRate,
      taxAmount: itemTax.taxAmount,
      taxCode: itemTax.taxCode,
      product: { connect: { id: productId } },
    }

    if (batchId !== null) {
      saleItemData.batch = { connect: { id: batchId } }
    }

    saleItemsData.push(saleItemData)
  }

  return { data: saleItemsData, totalAmount }
}

export const createSaleTransaction = async (
  input: CreateSaleInput,
  userId: number,
  organizationId: number,
  branchId: number,
  request: BranchAuthRequest
): Promise<Sale> => {
  const ebmEnabled = isEbmEnabled()
  const inventoryMethod = input.inventoryMethod || 'FIFO'

  let totalAmount = 0
  for (const item of input.items) {
    totalAmount += item.quantity * item.unitPrice
  }

  const finalPaymentType = determinePaymentType(
    input.paymentType,
    input.cashAmount || 0,
    input.insuranceAmount || 0,
    input.debtAmount || 0
  )

  const saleNumber = `SALE-${Date.now()}`
  const invoiceNumber = await generateInvoiceNumber(organizationId)
  const initialSaleStatus = ebmEnabled ? 'PENDING' : 'COMPLETED'

  return await prisma.$transaction(async (tx) => {
    if (ebmEnabled) {
      const branch = branchId
        ? await tx.branch.findFirst({
          where: {
            id: branchId,
            organizationId,
          },
          select: {
            id: true,
            name: true,
            code: true,
            bhfId: true,
          },
        })
        : null

      assertVsdcBranchMasterData(branch)
    }

    await validateStockAvailability(input.items, organizationId, branchId, tx)

    const taxSummary = await TaxService.calculateSaleTax(organizationId, input.items.map(i => ({
      productId: parseInt(i.productId),
      quantity: i.quantity,
      unitPrice: i.unitPrice
    })))

    const { data: saleItemsData } = await prepareSaleItems(
      input.items,
      organizationId,
      branchId,
      inventoryMethod,
      taxSummary,
      tx
    )

    const newSale = await tx.sale.create({
      data: {
        saleNumber,
        invoiceNumber,
        customerId: parseInt(input.customerId),
        userId,
        organizationId,
        branchId: branchId as any,
        paymentType: finalPaymentType,
        purchaseOrderCode:
          typeof input.purchaseOrderCode === "string" && input.purchaseOrderCode.trim().length > 0
            ? input.purchaseOrderCode.trim()
            : null,
        cashAmount: input.cashAmount || 0,
        insuranceAmount: input.insuranceAmount || 0,
        debtAmount: input.debtAmount || 0,
        totalAmount,
        vatAmount: taxSummary.vatAmount,
        taxableAmount: taxSummary.taxableAmount,
        status: initialSaleStatus,
        saleItems: {
          create: saleItemsData,
        },
      },
      include: {
        saleItems: { include: { product: true, batch: true } },
        customer: true,
      },
    } as any)

    for (const item of input.items) {
      const saleItem = (newSale as any).saleItems?.find((si: any) => si.productId === parseInt(item.productId))
      await removeStock({
        organizationId,
        productId: parseInt(item.productId),
        userId,
        quantity: item.quantity,
        movementType: 'SALE',
        branchId: branchId as any,
        reference: saleNumber,
        referenceType: 'SALE',
        note: `Sale #${saleNumber}`,
        batchId: saleItem?.batchId || null,
        tx,
      })
    }

    const remainingDebt = totalAmount - (input.cashAmount || 0) - (input.insuranceAmount || 0)
    if (remainingDebt > 0) {
      await tx.customer.update({
        where: { id: parseInt(input.customerId) },
        data: {
          balance: { increment: remainingDebt },
        },
      })
    }

    return newSale
  }, {
    maxWait: 30000,
    timeout: 60000,
  })
}

export const finalizeEbmSubmission = async (
  sale: Sale,
  saleNumber: string,
  organizationId: number,
  request: BranchAuthRequest
): Promise<{ success: boolean; message: string; ebmInvoiceNumber?: string | null }> => {
  const ebmResult = await submitInvoiceToEbm({
    saleId: sale.id,
    organizationId,
  })

  const responseSale = await loadSaleWithContext(request, sale.id, organizationId) ?? sale

  if (!ebmResult.success) {
    return {
      success: false,
      message: ebmResult.error
        ? `Sale created, but fiscal submission failed. Sale remains pending: ${ebmResult.error}`
        : "Sale created, but fiscal submission is still pending.",
      ebmInvoiceNumber: null
    }
  }

  return {
    success: true,
    message: "Sale completed and fiscalized successfully",
    ebmInvoiceNumber: ebmResult.ebmInvoiceNumber ?? null
  }
}

export const getSales = async (params: SaleFilterParams) => {
  const { organizationId, branchId, startDate, endDate, customerId, limit, search, status, paymentType } = params

  const where: any = {
    organizationId,
  }

  if (branchId) {
    where.branchId = branchId
  }

  if (startDate || endDate) {
    where.createdAt = {}
    if (startDate) {
      where.createdAt.gte = new Date(startDate)
    }
    if (endDate) {
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }

  if (customerId) {
    where.customerId = parseInt(customerId)
  }

  if (status) {
    where.status = status
  }

  if (paymentType) {
    where.paymentType = paymentType
  }

  if (search) {
    where.OR = [
      { saleNumber: { contains: search, mode: "insensitive" } },
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      {
        customer: {
          name: { contains: search, mode: "insensitive" }
        }
      }
    ]
  }

  return prisma.sale.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          TIN: true,
          customerType: true,
          email: true,
          address: true,
        }
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          bhfId: true,
          address: true,
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      saleItems: {
        include: { product: true },
      },
      ebmTransactions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: Math.min(Number(limit) || 50, 500),
  }) as Promise<Sale[]>
}

export const getSaleById = async (
  id: number,
  organizationId: number,
  branchId?: number
) => {
  const where: any = {
    id,
    organizationId,
  }

  if (branchId) {
    where.branchId = branchId
  }

  return prisma.sale.findFirst({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          TIN: true,
          customerType: true,
          email: true,
          address: true,
        }
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          bhfId: true,
          address: true,
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          role: true
        }
      },
      saleItems: {
        include: { product: true },
      },
      ebmTransactions: {
        orderBy: { createdAt: "desc" },
      },
    },
  })
}

export const recordSaleReprint = async (
  id: number,
  organizationId: number,
  branchId?: number
) => {
  const existingSale = await prisma.sale.findFirst({
    where: {
      id,
      organizationId,
      ...(branchId ? { branchId } : {}),
    },
    select: {
      id: true,
      saleNumber: true,
      reprintCount: true,
    }
  })

  if (!existingSale) {
    throw new Error("Sale not found")
  }

  const updatedSale = await prisma.sale.update({
    where: { id },
    data: {
      reprintCount: { increment: 1 },
    },
  })

  return updatedSale
}

export const processDebtPayment = async (
  saleId: number,
  organizationId: number,
  amount: number,
  branchId?: number
) => {
  const where: any = {
    id: saleId,
    organizationId,
  }

  if (branchId) {
    where.branchId = branchId
  }

  const sale = await prisma.sale.findFirst({
    where,
    include: {
      customer: true,
      saleItems: true
    }
  })

  if (!sale) {
    throw new Error("Sale not found")
  }

  if (sale.status === 'REFUNDED' || sale.status === 'CANCELLED') {
    throw new Error(`Cannot process payment for ${sale.status.toLowerCase()} sale`)
  }

  if (sale.status === 'PENDING') {
    throw new Error("Cannot process payment for a pending sale until fiscalization completes")
  }

  const remainingDebt = (sale.debtAmount as Decimal).toNumber() - amount
  if (remainingDebt < 0) {
    throw new Error("Amount exceeds debt")
  }

  await prisma.sale.update({
    where: { id: saleId },
    data: {
      debtAmount: remainingDebt,
      cashAmount: { increment: amount },
    },
  })

  await prisma.customer.update({
    where: { id: sale.customerId },
    data: {
      balance: { decrement: amount },
    },
  })

  return {
    sale,
    remainingDebt
  }
}

export const refundSale = async (
  saleId: number,
  organizationId: number,
  userId: number,
  reason: string,
  reasonCode: string,
  branchId?: number,
  request?: BranchAuthRequest
) => {
  const where: any = {
    id: saleId,
    organizationId,
  }

  if (branchId) {
    where.branchId = branchId
  }

  const sale = await prisma.sale.findFirst({
    where,
    include: {
      saleItems: {
        include: {
          product: true,
          batch: true
        }
      },
      customer: true
    } as any
  })

  if (!sale) {
    throw new Error("Sale not found")
  }

  if (sale.status === 'REFUNDED') {
    throw new Error("Sale already refunded")
  }

  if (sale.status === 'CANCELLED') {
    throw new Error("Cannot refund a cancelled sale")
  }

  if (sale.status === 'PENDING') {
    throw new Error("Cannot refund a pending sale. Cancel it instead.")
  }

  if (!sale.saleItems || sale.saleItems.length === 0) {
    throw new Error("Sale has no items to refund")
  }

  const itemsToRefund = ((sale as any).saleItems || []).map((item: any) => ({
    saleItemId: item.id,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toNumber(),
    totalPrice: item.totalPrice.toNumber(),
    taxRate: item.taxRate?.toNumber?.() || 0,
    taxAmount: item.taxAmount?.toNumber?.() || 0,
    taxCode: item.taxCode ?? null,
    costPrice: item.costPrice?.toNumber?.() || 0,
    profit: item.profit?.toNumber?.() || 0,
  }))

  const totalRefundAmount = itemsToRefund.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
  const refundProcessedAt = new Date()
  const refundSaleNumber = `REFUND-${sale.saleNumber}-${refundProcessedAt.getTime()}`

  const ebmEnabled = isEbmEnabled()
  const refundInvoiceNumber = ebmEnabled ? await generateInvoiceNumber(organizationId) : null

  let refundEbmSubmission: Awaited<ReturnType<typeof submitRefundToEbm>> | null = null

  if (ebmEnabled && refundInvoiceNumber) {
    refundEbmSubmission = await submitRefundToEbm({
      organizationId,
      originalSaleId: saleId,
      refundInvoiceNumber,
      refundedAt: refundProcessedAt,
      reason,
      reasonCode,
    })

    if (!refundEbmSubmission.success) {
      throw {
        status: refundEbmSubmission.code === 'NOT_FISCALIZED'
          ? 409
          : refundEbmSubmission.code === 'VALIDATION'
            ? 400
            : 502,
        message: refundEbmSubmission.error || "Failed to fiscalize refund"
      }
    }
  }

  return executeWithRetry(async () => {
    return await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'REFUNDED',
          refundedAt: refundProcessedAt,
          refundedById: userId,
          refundReason: reason
        }
      })

      const refundRecord = await tx.sale.create({
        data: {
          saleNumber: refundSaleNumber,
          customerId: sale.customerId,
          userId,
          organizationId,
          branchId: (sale as any).branchId,
          paymentType: sale.paymentType,
          cashAmount: -totalRefundAmount,
          insuranceAmount: 0,
          debtAmount: 0,
          totalAmount: -totalRefundAmount,
          vatAmount: -((sale as any).vatAmount?.toNumber?.() || 0),
          taxableAmount: -((sale as any).taxableAmount?.toNumber?.() || 0),
          status: 'REFUNDED',
          refundReason: reason,
          refundedAt: refundProcessedAt,
          refundedById: userId,
          originalSaleId: saleId,
          invoiceNumber: refundInvoiceNumber,
          createdAt: refundProcessedAt,
          saleItems: {
            create: itemsToRefund.map((item: any) => ({
              productId: item.productId,
              quantity: -item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: -item.totalPrice,
              taxRate: item.taxRate,
              taxAmount: -item.taxAmount,
              taxCode: item.taxCode,
              costPrice: item.costPrice,
              profit: -item.profit,
            }))
          }
        } as any,
        include: {
          saleItems: { include: { product: true } },
          customer: true
        }
      })

      if (refundEbmSubmission?.transactionId) {
        await tx.ebmTransaction.update({
          where: { id: refundEbmSubmission.transactionId },
          data: { saleId: refundRecord.id }
        })
      }

      for (const item of itemsToRefund) {
        await addStock({
          organizationId,
          productId: item.productId,
          userId,
          quantity: item.quantity,
          movementType: 'RETURN_CUSTOMER',
          branchId: (sale as any).branchId,
          reference: refundSaleNumber,
          referenceType: 'SALE_REFUND',
          note: `Refund for Sale #${sale.saleNumber} (Full)`,
          tx,
        })
      }

      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          balance: { decrement: totalRefundAmount }
        }
      })

      return {
        success: true,
        message: ebmEnabled ? 'Refund completed and fiscalized successfully' : 'Refund transaction created successfully',
        refundAmount: totalRefundAmount,
        refundSale: refundRecord,
        refundedItems: itemsToRefund
      }
    }, {
      maxWait: 30000,
      timeout: 60000,
    })
  })
}

export const cancelSale = async (
  saleId: number,
  organizationId: number,
  userId: number,
  reason: string,
  branchId?: number,
  request?: BranchAuthRequest
) => {
  const where: any = {
    id: saleId,
    organizationId,
  }

  if (branchId) {
    where.branchId = branchId
  }

  const sale = await prisma.sale.findFirst({
    where,
    include: {
      saleItems: {
        include: {
          product: true
        }
      },
      customer: true,
      user: true
    }
  })

  if (!sale) {
    throw new Error("Sale not found")
  }

  if (sale.status === 'CANCELLED') {
    throw new Error("Sale already cancelled")
  }

  if (sale.status === 'REFUNDED' || sale.status === 'PARTIALLY_REFUNDED') {
    throw new Error(`Cannot cancel a ${sale.status.toLowerCase()} sale`)
  }

  const ebmEnabled = isEbmEnabled()
  const shouldFiscalCancel = ebmEnabled && sale.status !== 'PENDING'
  const cancelledAt = new Date()

  let voidEbmSubmission: Awaited<ReturnType<typeof submitVoidToEbm>> | null = null

  if (shouldFiscalCancel) {
    const cancelInvoiceNumber = await generateInvoiceNumber(organizationId)
    voidEbmSubmission = await submitVoidToEbm({
      organizationId,
      saleId,
      cancelInvoiceNumber,
      cancelledAt,
      reason,
    })

    if (!voidEbmSubmission.success) {
      throw {
        status: voidEbmSubmission.code === 'NOT_FISCALIZED'
          ? 409
          : voidEbmSubmission.code === 'VALIDATION'
            ? 400
            : 502,
        message: voidEbmSubmission.error || "Failed to fiscalize cancellation"
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: 'CANCELLED',
        cancelledAt,
        cancelledById: userId,
        cancellationReason: reason
      }
    })

    for (const item of sale.saleItems) {
      await addStock({
        organizationId,
        productId: item.productId,
        userId,
        quantity: item.quantity,
        movementType: 'RETURN_CUSTOMER',
        branchId: (sale as any).branchId,
        reference: sale.saleNumber,
        referenceType: 'SALE_CANCELLATION',
        note: `Sale cancellation: ${sale.saleNumber}`,
        tx,
      })
    }

    const debtAmount = (sale as any).debtAmount?.toNumber?.() || 0
    if (debtAmount > 0) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          balance: { decrement: debtAmount }
        }
      })
    }
  })

  return {
    success: true,
    message: shouldFiscalCancel
      ? "Sale cancelled and fiscalized successfully"
      : "Sale cancelled successfully",
    sale
  }
}

export const SaleService = {
  loadSaleWithContext,
  determinePaymentType,
  validateSaleInput,
  validateStockAvailability,
  prepareSaleItems,
  createSaleTransaction,
  finalizeEbmSubmission,
  getSales,
  getSaleById,
  recordSaleReprint,
  processDebtPayment,
  refundSale,
  cancelSale,
}