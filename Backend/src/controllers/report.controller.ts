import type { Response } from "express"
import { prisma } from "../lib/prisma"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import { success, error as apiError } from "../utils/apiResponse"
import { ReportService, SalesReportParams, InventoryReportParams, StockHistoryParams } from "../services/report.service"

export const getSalesReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { startDate, endDate, category, status, sellerId, product, page, limit } = req.query

    const params: SalesReportParams = {
      organizationId,
      branchId,
      startDate: startDate as string,
      endDate: endDate as string,
      category: category as string,
      status: status as string,
      sellerId: sellerId as string,
      product: product as string,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    }

    const result = await ReportService.getSalesReport(params)
    res.json(success(result))
  } catch (err: any) {
    console.error('Error generating sales report:', err)
    res.status(500).json(apiError('Failed to generate sales report'))
  }
}

export const getInventoryReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { category, status, search } = req.query

    const params: InventoryReportParams = {
      organizationId,
      branchId,
      category: category as string,
      status: status as string,
      search: search as string,
    }

    const result = await ReportService.getInventoryReport(params)
    res.json(success(result))
  } catch (err: any) {
    console.error('Error generating inventory report:', err)
    res.status(500).json(apiError('Failed to generate inventory report'))
  }
}

export const getStockReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { startDate, endDate, productId, category } = req.query

    const result = await ReportService.getStockReport(
      organizationId,
      branchId,
      startDate as string,
      endDate as string,
      productId ? parseInt(productId as string) : undefined,
      category as string
    )

    res.json(success(result))
  } catch (err: any) {
    console.error('Error generating stock report:', err)
    res.status(500).json(apiError('Failed to generate stock report'))
  }
}

export const getStockHistory = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { productId, batchNumber, startDate, endDate, userId, type, limit = "20", page = "1" } = req.query

    const params: StockHistoryParams = {
      organizationId,
      branchId,
      productId: productId ? parseInt(productId as string) : undefined,
      batchNumber: batchNumber as string,
      startDate: startDate as string,
      endDate: endDate as string,
      userId: userId ? parseInt(userId as string) : undefined,
      type: type as string,
      limit: limit ? parseInt(limit as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
    }

    const result = await ReportService.getStockHistory(params)
    res.json(success(result))
  } catch (err: any) {
    console.error('Error fetching stock history:', err)
    res.status(500).json(apiError('Failed to fetch stock history'))
  }
}

export const getProfitReportController = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { startDate, endDate, productId } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json(apiError('Start date and end date are required'))
    }

    const result = await ReportService.getProfitReportService(
      organizationId,
      startDate as string,
      endDate as string,
      productId ? parseInt(productId as string) : undefined
    )

    res.json(success(result))
  } catch (err: any) {
    console.error('Error generating profit report:', err)
    res.status(500).json(apiError('Failed to generate profit report'))
  }
}

export const getDebtorsReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { startDate, endDate } = req.query

    const where: any = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      debtAmount: { gt: 0 },
      status: { notIn: ['CANCELLED', 'PENDING', 'REFUNDED'] }
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999))
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: {
          select: { id: true, name: true, phone: true, balance: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const debtors = sales.map(sale => ({
      id: sale.id,
      customerId: sale.customerId,
      customerName: sale.customer.name,
      customerPhone: sale.customer.phone || 'N/A',
      invoiceNumber: sale.invoiceNumber,
      saleNumber: sale.saleNumber,
      totalAmount: sale.totalAmount.toNumber(),
      debtAmount: sale.debtAmount.toNumber(),
      paidAmount: sale.cashAmount.toNumber() + sale.insuranceAmount.toNumber(),
      createdAt: sale.createdAt
    }))

    const summary = {
      totalDebt: debtors.reduce((sum, d) => sum + d.debtAmount, 0),
      totalDebtors: new Set(debtors.map(d => d.customerId)).size
    }

    res.json(success({ summary, debtors }))
  } catch (err: any) {
    console.error('Error generating debtors report:', err)
    res.status(500).json(apiError('Failed to generate debtors report'))
  }
}

export const getDebtPaymentsReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { startDate, endDate } = req.query

    const where: any = { organizationId }

    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate as string),
        lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999))
      }
    }

    const debtPayments = await prisma.debtPayment.findMany({
      where,
      include: {
        customer: {
          select: { name: true, phone: true, balance: true }
        },
        recordedBy: {
          select: { name: true }
        }
      },
      orderBy: { paymentDate: 'desc' }
    })

    const payments = debtPayments.map(payment => ({
      id: payment.id,
      customerName: payment.customer.name,
      customerPhone: payment.customer.phone || 'N/A',
      amountPaid: payment.amount.toNumber(),
      paymentDate: payment.paymentDate.toISOString().split('T')[0],
      paymentMethod: payment.paymentMethod,
      reference: payment.reference || 'N/A',
      notes: payment.notes || '',
      recordedBy: payment.recordedBy.name
    }))

    const summary = {
      totalPaid: payments.reduce((sum, p) => sum + p.amountPaid, 0),
      paymentsCount: payments.length
    }

    res.json(success({ summary, payments }))
  } catch (err: any) {
    console.error('Error generating debt payments report:', err)
    res.status(500).json(apiError('Failed to generate debt payments report'))
  }
}

export const getCashFlowReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { startDate, endDate } = req.query

    const start = startDate ? new Date(startDate as string) : new Date(0)
    const end = endDate ? new Date(new Date(endDate as string).setHours(23, 59, 59, 999)) : new Date()

    const salesWhere: any = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      createdAt: { gte: start, lte: end },
      status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] }
    }

    const sales = await prisma.sale.findMany({ where: salesWhere })
    const totalIncome = sales.reduce((sum, s) => sum + s.cashAmount.toNumber(), 0)

    const expenseWhere: any = {
      organizationId,
      ...(branchId ? { branchId } : {}),
      expenseDate: { gte: start, lte: end }
    }

    const expenses = await prisma.expense.findMany({ where: expenseWhere })
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount.toNumber(), 0)

    const netCashFlow = totalIncome - totalExpenses

    res.json(success({
      summary: {
        totalIncome,
        totalExpenses,
        netCashFlow,
        openingBalance: 0,
        closingBalance: netCashFlow
      },
      transactions: []
    }))
  } catch (err: any) {
    console.error('Error generating cash flow report:', err)
    res.status(500).json(apiError('Failed to generate cash flow report'))
  }
}

export const exportReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const { reportType } = req.params
    const organizationId = parseInt(req.params.organizationId)

    res.json(success({ message: `Export for ${reportType} not implemented yet` }))
  } catch (err: any) {
    console.error('Error exporting report:', err)
    res.status(500).json(apiError('Failed to export report'))
  }
}