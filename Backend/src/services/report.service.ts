import { prisma } from "../lib/prisma"
import { buildBranchFilter } from "../middleware/branchAuth.middleware"
import { getProfitReport as getProfitReportData } from "./profit.service"

export interface SalesReportParams {
  organizationId: number
  branchId?: number
  startDate?: string
  endDate?: string
  category?: string
  status?: string
  sellerId?: string
  product?: string
  page?: number
  limit?: number
}

export interface InventoryReportParams {
  organizationId: number
  branchId?: number
  category?: string
  status?: string
  search?: string
}

export interface StockHistoryParams {
  organizationId: number
  branchId?: number
  productId?: number
  userId?: number
  type?: string
  batchNumber?: string
  startDate?: string
  endDate?: string
  limit?: number
  page?: number
}

interface StockChange {
  date: string
  type: 'sale' | 'restock' | 'adjustment'
  quantity: number
  newStock: number
  note?: string
}

export const getSalesReport = async (params: SalesReportParams) => {
  const {
    organizationId,
    branchId,
    startDate,
    endDate,
    category,
    status,
    sellerId,
    product,
    page = 1,
    limit = 10
  } = params

  const where: any = {
    organizationId,
    ...(branchId ? { branchId } : {}),
  }

  if (startDate && endDate && startDate !== 'undefined' && endDate !== 'undefined') {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999)
      where.createdAt = {
        gte: start,
        lte: end,
      }
    }
  }

  if (status && status !== 'all') {
    where.status = status
  }

  if (sellerId && sellerId !== 'all') {
    where.userId = parseInt(sellerId as string)
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      saleItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  let transactions = sales.flatMap(sale =>
    sale.saleItems.map(item => ({
      id: item.id,
      saleId: sale.id,
      productId: item.product.id,
      sellerId: sale.user.id,
      date: sale.createdAt.toISOString().split('T')[0],
      product: item.product.name,
      category: item.product.category || 'Uncategorized',
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      total: (item.quantity * item.unitPrice.toNumber()),
      status: sale.status,
      seller: sale.user.name,
      sellerEmail: sale.user.email,
    }))
  )

  if (category && category !== 'all') {
    transactions = transactions.filter(t => t.category === category)
  }

  if (product) {
    const productSearch = product.toLowerCase()
    transactions = transactions.filter(t =>
      t.product.toLowerCase().includes(productSearch)
    )
  }

  const totalItems = transactions.length

  const pageNum = page || 1
  const limitNum = limit || 10
  const skip = (pageNum - 1) * limitNum
  const paginatedTransactions = transactions.slice(skip, skip + limitNum)

  const totalSales = transactions.reduce((sum, t) => sum + (t.status === 'REFUNDED' ? -t.total : t.total), 0)
  const totalQuantity = transactions.reduce((sum, t) => sum + (t.status === 'REFUNDED' ? -t.quantity : t.quantity), 0)
  const totalTransactions = new Set(transactions.map(t => t.saleId)).size
  const avgTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0

  const uniqueCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean))).sort()
  const uniqueSellers = Array.from(
    new Map(
      transactions.map(t => [t.sellerId, { id: t.sellerId, name: t.seller, email: t.sellerEmail }])
    ).values()
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const uniqueProducts = Array.from(
    new Map(
      transactions.map(t => [t.productId, { id: t.productId, name: t.product, category: t.category }])
    ).values()
  ).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return {
    summary: {
      totalSales,
      totalQuantity,
      totalTransactions,
      avgTransaction
    },
    transactions: paginatedTransactions,
    totalItems,
    filters: {
      categories: uniqueCategories,
      sellers: uniqueSellers,
      products: uniqueProducts
    }
  }
}

export const getInventoryReport = async (params: InventoryReportParams) => {
  const { organizationId, branchId, category, status, search } = params

  const where: any = { organizationId, ...(branchId ? { branchId } : {}) }

  if (category && category !== 'all') {
    where.category = category
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ]
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      saleItems: {
        select: {
          quantity: true,
          sale: {
            select: {
              createdAt: true,
              saleNumber: true,
            },
          },
        },
        orderBy: {
          sale: {
            createdAt: 'desc',
          },
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  })

  const restocks = await prisma.$queryRaw`
    SELECT id, "productId", quantity, "createdAt"
    FROM "restocks"
    WHERE "organizationId" = ${organizationId}
    ORDER BY "createdAt" DESC
  `.catch(() => []) as Array<{
    id: string
    productId: string
    quantity: number
    createdAt: Date
  }>

  const inventoryData = await Promise.all(
    products.map(async (product: any) => {
      const maxStock = product.maxStock || product.minStock * 5

      const salesChanges = product.saleItems.map((item: any) => ({
        date: item.sale.createdAt.toISOString().split('T')[0],
        type: 'sale' as const,
        quantity: -item.quantity,
        newStock: 0,
        note: `Sale #${item.sale.saleNumber}`,
      }))

      const restockChanges = restocks
        .filter((r) => r.productId === product.id)
        .map((restock) => ({
          date: restock.createdAt.toISOString().split('T')[0],
          type: 'restock' as const,
          quantity: Number(restock.quantity),
          newStock: 0,
          note: 'Stock replenishment',
        }))

      const allChanges = [...salesChanges, ...restockChanges].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )

      let runningStock = product.quantity
      for (const change of allChanges) {
        change.newStock = runningStock
        runningStock -= change.quantity
      }

      const statusValue = product.quantity <= 0 ? 'critical' :
        product.quantity <= product.minStock ? 'low' :
          product.quantity >= maxStock ? 'high' : 'normal'

      return {
        id: product.id,
        product: product.name,
        sku: product.sku || '',
        category: product.category || 'Uncategorized',
        currentStock: product.quantity,
        previousStock: runningStock,
        minStock: product.minStock,
        maxStock,
        unitPrice: product.unitPrice.toNumber(),
        supplier: 'N/A',
        lastRestocked: allChanges[0]?.date || product.createdAt.toISOString().split('T')[0],
        changes: allChanges,
        status: statusValue,
        stockValue: product.quantity * product.unitPrice.toNumber(),
      }
    })
  )

  const summary = {
    totalProducts: products.length,
    totalStockValue: inventoryData.reduce((sum, item) => sum + item.stockValue, 0),
    criticalCount: inventoryData.filter(item => item.status === 'critical').length,
    lowCount: inventoryData.filter(item => item.status === 'low').length,
    normalCount: inventoryData.filter(item => item.status === 'normal').length,
    highCount: inventoryData.filter(item => item.status === 'high').length,
  }

  const categorySummary = Array.from(
    new Map(
      inventoryData.map(item => [item.category, { category: item.category, count: 0, value: 0 }])
    ).values()
  ).map(cat => ({
    category: cat.category,
    count: inventoryData.filter(item => item.category === cat.category).length,
    value: inventoryData
      .filter(item => item.category === cat.category)
      .reduce((sum, item) => sum + item.stockValue, 0)
  }))

  return {
    summary,
    data: inventoryData,
    categorySummary,
  }
}

export const getStockReport = async (
  organizationId: number,
  branchId: number | undefined,
  startDate: string,
  endDate: string,
  productId?: number,
  category?: string
) => {
  const start = new Date(startDate)
  const end = new Date(new Date(endDate).setHours(23, 59, 59, 999))

  const productWhere: any = { organizationId }
  if (productId && productId !== undefined) productWhere.id = productId
  if (category && category !== undefined) productWhere.category = category

  const products = await prisma.product.findMany({
    where: productWhere,
    select: {
      id: true,
      name: true,
      batchNumber: true,
      quantity: true,
      unitPrice: true,
    }
  })

  const reportData = await Promise.all(products.map(async (product) => {
    const periodMovements = await prisma.inventoryLedger.findMany({
      where: {
        productId: product.id,
        organizationId,
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: start, lte: end }
      },
      orderBy: { createdAt: 'asc' }
    })

    const openingBalanceResult = await prisma.inventoryLedger.findFirst({
      where: {
        productId: product.id,
        organizationId,
        ...(branchId ? { branchId } : {}),
        createdAt: { lt: start }
      },
      orderBy: { createdAt: 'desc' },
      select: { runningBalance: true }
    })

    const closingBalanceResult = await prisma.inventoryLedger.findFirst({
      where: {
        productId: product.id,
        organizationId,
        ...(branchId ? { branchId } : {}),
        createdAt: { lte: end }
      },
      orderBy: { createdAt: 'desc' },
      select: { runningBalance: true }
    })

    const openingStock = openingBalanceResult?.runningBalance || 0
    const closingStock = closingBalanceResult?.runningBalance || product.quantity

    let stockIn = 0
    let stockOut = 0

    periodMovements.forEach(m => {
      if (m.direction === 'IN') {
        stockIn += m.quantity
      } else {
        stockOut += m.quantity
      }
    })

    return {
      productId: product.id,
      productName: product.name,
      batchNumber: product.batchNumber,
      unitPrice: product.unitPrice.toNumber(),
      openingStock,
      stockIn,
      stockOut,
      closingStock,
      stockValue: closingStock * product.unitPrice.toNumber()
    }
  }))

  const summary = reportData.reduce((acc, curr) => ({
    totalOpening: acc.totalOpening + curr.openingStock,
    totalIn: acc.totalIn + curr.stockIn,
    totalOut: acc.totalOut + curr.stockOut,
    totalClosing: acc.totalClosing + curr.closingStock,
    totalValue: acc.totalValue + curr.stockValue
  }), { totalOpening: 0, totalIn: 0, totalOut: 0, totalClosing: 0, totalValue: 0 })

  return {
    summary,
    data: reportData
  }
}

export const getStockHistory = async (params: StockHistoryParams) => {
  const {
    organizationId,
    branchId,
    productId,
    userId,
    type,
    batchNumber,
    startDate,
    endDate,
    limit = 20,
    page = 1
  } = params

  const where: any = {
    organizationId,
    ...(branchId ? { branchId } : {}),
  }

  if (productId && productId !== undefined) where.productId = productId
  if (userId && userId !== undefined) where.userId = userId
  if (type && type !== undefined) where.movementType = type

  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate),
      lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
    }
  }

  if (batchNumber) {
    where.batchNumber = { contains: batchNumber, mode: 'insensitive' }
  }

  const skip = (page - 1) * limit

  const [movements, totalCount] = await Promise.all([
    prisma.inventoryLedger.findMany({
      where,
      include: {
        product: { select: { name: true, batchNumber: true } },
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.inventoryLedger.count({ where }),
  ])

  const transformedMovements = movements.map(m => ({
    id: m.id,
    productId: m.productId,
    product: m.product,
    user: m.user,
    movementType: m.movementType,
    direction: m.direction,
    quantity: m.quantity,
    runningBalance: m.runningBalance,
    previousStock: m.runningBalance - (m.direction === 'IN' ? m.quantity : -m.quantity),
    newStock: m.runningBalance,
    note: m.note,
    reference: m.reference,
    createdAt: m.createdAt,
  }))

  return {
    data: transformedMovements,
    pagination: {
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      limit,
    },
  }
}

export const getProfitReportService = async (
  organizationId: number,
  startDate: string,
  endDate: string,
  productId?: number
) => {
  return getProfitReportData(
    organizationId,
    new Date(startDate),
    new Date(endDate),
    productId
  )
}

export const ReportService = {
  getSalesReport,
  getInventoryReport,
  getStockReport,
  getStockHistory,
  getProfitReportService,
}