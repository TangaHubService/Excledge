import type { Response } from "express"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import { success, error as apiError } from "../utils/apiResponse"
import { auditLogger } from "../utils/auditLogger"
import { SaleService, CreateSaleInput, SaleFilterParams } from "../services/sale.service"
import { isEbmEnabled } from "../services/rra-ebm.service"

export const createSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const input: CreateSaleInput = {
      customerId: req.body.customerId,
      items: req.body.items,
      paymentType: req.body.paymentType,
      cashAmount: req.body.cashAmount,
      debtAmount: req.body.debtAmount,
      insuranceAmount: req.body.insuranceAmount,
      purchaseOrderCode: req.body.purchaseOrderCode,
      inventoryMethod: req.body.inventoryMethod,
    }

    const userId = parseInt(req.user?.userId as string)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)

    SaleService.validateSaleInput(input)

    const sale = await SaleService.createSaleTransaction(
      input,
      userId,
      organizationId,
      branchId,
      req
    )

    if (isEbmEnabled()) {
      try {
        await auditLogger.sales(req, {
          type: 'SALE_CREATE',
          description: `Sale created and awaiting fiscalization (Invoice #${sale.invoiceNumber})`,
          entityType: 'Sale',
          entityId: sale.id,
          metadata: {
            invoiceNumber: sale.invoiceNumber,
            totalAmount: sale.totalAmount,
            paymentType: sale.paymentType,
            status: 'PENDING'
          }
        })
      } catch (auditError) {
        console.error("[Sale Create Audit Error]:", auditError)
      }

      const ebmResult = await SaleService.finalizeEbmSubmission(
        sale,
        sale.saleNumber,
        organizationId,
        req
      )

      const responseSale = await SaleService.loadSaleWithContext(req, sale.id, organizationId) ?? sale

      if (!ebmResult.success) {
        return res.status(201).json(success(
          responseSale,
          ebmResult.message
        ))
      }

      await auditLogger.sales(req, {
        type: 'SALE_COMPLETED',
        description: `Sale completed and fiscalized (Invoice #${sale.invoiceNumber})`,
        entityType: 'Sale',
        entityId: sale.id,
        metadata: {
          invoiceNumber: sale.invoiceNumber,
          totalAmount: sale.totalAmount,
          paymentType: sale.paymentType,
          ebmInvoiceNumber: ebmResult.ebmInvoiceNumber
        }
      })

      return res.status(201).json(success(
        responseSale,
        ebmResult.message
      ))
    }

    await auditLogger.sales(req, {
      type: 'SALE_COMPLETED',
      description: `Sale completed (Invoice #${sale.invoiceNumber})`,
      entityType: 'Sale',
      entityId: sale.id,
      metadata: {
        invoiceNumber: sale.invoiceNumber,
        totalAmount: sale.totalAmount,
        paymentType: sale.paymentType
      }
    })

    const responseSale = await SaleService.loadSaleWithContext(req, sale.id, organizationId) ?? sale
    res.status(201).json(success(responseSale, "Sale completed successfully"))
  } catch (err: any) {
    console.error("[Create Sale Error]:", err)

    if (err.message && err.message.includes('Insufficient stock')) {
      return res.status(400).json(apiError(err.message))
    }

    if (err.message && err.message.includes('VSDC master data:')) {
      return res.status(400).json(apiError(err.message))
    }

    if (err.message && err.message.includes('not found')) {
      return res.status(404).json(apiError(err.message))
    }

    res.status(500).json(apiError(err.message || "Failed to create sale"))
  }
}

export const getSales = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { startDate, endDate, customerId, limit, search, status, paymentType, page } = req.query

    const params: SaleFilterParams = {
      organizationId,
      branchId,
      startDate: startDate as string,
      endDate: endDate as string,
      customerId: customerId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
      search: search as string,
      status: status as string,
      paymentType: paymentType as string,
    }

    const result = await SaleService.getSales(params)
    res.json(success(result))
  } catch (err) {
    console.error("[Get Sales Error]:", err)
    res.status(500).json(apiError("Failed to get sales"))
  }
}

export const getSaleById = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)

    const sale = await SaleService.getSaleById(id, organizationId, branchId)

    if (!sale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    res.json(success(sale))
  } catch (err) {
    console.error("[Get Sale Error]:", err)
    res.status(500).json(apiError("Failed to get sale"))
  }
}

export const recordSaleReprint = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)

    const existingSale = await SaleService.getSaleById(id, organizationId, branchId)

    if (!existingSale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    const updatedSale = await SaleService.recordSaleReprint(id, organizationId, branchId)

    try {
      await auditLogger.sales(req, {
        type: 'SALE_UPDATE',
        description: `Receipt copy generated for Sale #${updatedSale.saleNumber}`,
        entityType: 'Sale',
        entityId: updatedSale.id,
        metadata: {
          previousReprintCount: existingSale.reprintCount,
          reprintCount: updatedSale.reprintCount,
        }
      })
    } catch (auditError) {
      console.error("[Sale Reprint Audit Error]:", auditError)
    }

    const responseSale = await SaleService.loadSaleWithContext(req, id, organizationId)
    res.json(success(responseSale, "Sale receipt copy recorded"))
  } catch (err) {
    console.error("[Sale Reprint Error]:", err)
    res.status(500).json(apiError("Failed to record sale receipt copy"))
  }
}

export const payDebt = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { amount } = req.body

    const result = await SaleService.processDebtPayment(id, organizationId, amount, branchId)

    await auditLogger.sales(req, {
      type: 'PAYMENT_RECEIVED',
      description: `Payment of ${amount} received for debt on Sale #${result.sale.saleNumber}`,
      entityType: 'Sale',
      entityId: id,
      metadata: {
        amount,
        previousDebt: result.sale.debtAmount,
        newDebt: result.remainingDebt,
      }
    })

    res.json(success({ message: "Debt paid successfully" }))
  } catch (err: any) {
    console.error("[Pay Debt Error]:", err)
    res.status(500).json(apiError(err.message || "Failed to pay debt"))
  }
}

export const refundSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { reason, reasonCode } = req.body
    const userId = parseInt(req.user?.userId as string)

    const result = await SaleService.refundSale(
      id,
      organizationId,
      userId,
      reason,
      reasonCode,
      branchId,
      req
    )

    try {
      await auditLogger.sales(req, {
        type: 'SALE_REFUNDED',
        description: `Full refund issued for Sale #${id}${reason ? `: ${reason}` : ''}`,
        entityType: 'Sale',
        entityId: id,
        metadata: {
          refundSaleId: result.refundSale.id,
          refundAmount: result.refundAmount,
          reason,
          reasonCode: reasonCode ?? null,
        }
      })
    } catch (auditError) {
      console.error("[Refund Audit Error]:", auditError)
    }

    res.status(200).json(success(result, result.message))
  } catch (err: any) {
    console.error("[Refund Error]:", err)
    const status = err.status || 500
    const message = err.message || "Failed to process refund"
    res.status(status).json(apiError(message))
  }
}

export const cancelSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { reason } = req.body
    const userId = parseInt(req.user?.userId as string)

    const result = await SaleService.cancelSale(
      saleId,
      organizationId,
      userId,
      reason,
      branchId,
      req
    )

    try {
      await auditLogger.sales(req, {
        type: 'SALE_CANCELLED',
        description: `Sale #${saleId} cancelled${reason ? `: ${reason}` : ''}`,
        entityType: 'Sale',
        entityId: saleId,
        metadata: { cancellationReason: reason }
      })
    } catch (auditError) {
      console.error("[Cancel Sale Audit Error]:", auditError)
    }

    res.status(200).json(success({ message: result.message }, result.message))
  } catch (err: any) {
    console.error("[Cancel Sale Error]:", err)
    res.status(500).json(apiError(err.message || "Failed to cancel sale"))
  }
}