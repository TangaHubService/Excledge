import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth.middleware"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { buildBranchFilter } from "../middleware/branchAuth.middleware"
import { prisma } from "../lib/prisma"

// ── Date range helpers ────────────────────────────────────────────────────
interface DateRange {
  startDate: Date
  endDate: Date
}

function parseDateRange(query: Record<string, any>): DateRange {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setHours(23, 59, 59, 999)
  let startDate: Date

  const preset = query.preset as string | undefined
  const qStart = query.startDate as string | undefined
  const qEnd = query.endDate as string | undefined

  if (qStart && qEnd) {
    startDate = new Date(qStart)
    startDate.setHours(0, 0, 0, 0)
    const ed = new Date(qEnd)
    ed.setHours(23, 59, 59, 999)
    return { startDate, endDate: ed }
  }

  switch (preset) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'weekly': {
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Monday start
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
      break
    }
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    default:
      // Fallback: last 30 days
      startDate = new Date(now)
      startDate.setDate(startDate.getDate() - 30)
      startDate.setHours(0, 0, 0, 0)
  }

  return { startDate, endDate }
}

// ── Per-branch dashboard stats ────────────────────────────────────────────
export const getBranchDashboardStats = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { startDate, endDate } = parseDateRange(req.query)
    const branchFilter = buildBranchFilter(req)
    const branchId = typeof branchFilter.branchId === 'number' ? branchFilter.branchId : null

    // ── Fetch active branches ──────────────────────────────────────
    const branches = await prisma.branch.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        ...(branchId ? { id: branchId } : {}),
      },
      select: { id: true, name: true, code: true, location: true },
      orderBy: { name: 'asc' },
    })

    // ── Aggregate per-branch in a single pass ──────────────────────
    const branchIds = branches.map(b => b.id)

    // 1. Sales aggregation per branch
    const salesRows = branchIds.length > 0
      ? await prisma.sale.groupBy({
          by: ['branchId'],
          where: {
            organizationId,
            branchId: { in: branchIds },
            createdAt: { gte: startDate, lte: endDate },
            status: { not: 'CANCELLED' },
          },
          _sum: { totalAmount: true, cashAmount: true, debtAmount: true, insuranceAmount: true },
          _count: { id: true },
        })
      : []
    const salesAgg = new Map(salesRows.map(r => [r.branchId, r]))

    // 2. Low stock per branch (via inventory_ledger balance)
    const ledgerBalances = branchIds.length > 0
      ? (await prisma.$queryRaw<Array<{ branchId: number; productId: number; bal: bigint }>>`
          SELECT il."branchId", il."productId",
            COALESCE(SUM(CASE WHEN il.direction = 'IN' THEN il.quantity ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN il.direction = 'OUT' THEN il.quantity ELSE 0 END), 0) AS bal
          FROM inventory_ledger il
          WHERE il."organizationId" = ${organizationId}
            AND il."branchId" = ANY(${branchIds})
          GROUP BY il."branchId", il."productId"
        `)
      : []

    // Build per-product stock map per branch
    const stockByBranch = new Map<number, Map<number, number>>()
    for (const row of ledgerBalances) {
      if (!stockByBranch.has(row.branchId)) stockByBranch.set(row.branchId, new Map())
      stockByBranch.get(row.branchId)!.set(row.productId, Number(row.bal))
    }

    const products = await prisma.product.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: { id: true, name: true, minStock: true },
    })

    // 3. Expiring batches per branch
    const expiringBatches = branchIds.length > 0
      ? await prisma.batch.groupBy({
          by: ['branchId'],
          where: {
            organizationId,
            branchId: { in: branchIds },
            isActive: true,
            expiryDate: { not: null, lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), gte: new Date() },
          },
          _count: { id: true },
        }).then(rows => new Map(rows.map(r => [r.branchId, r._count.id])))
      : new Map()

    // 4. Expenses per branch
    const expenseRows = branchIds.length > 0
      ? await prisma.expense.groupBy({
          by: ['branchId'],
          where: {
            organizationId,
            branchId: { in: branchIds },
            expenseDate: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        })
      : []
    const expenseAgg = new Map(expenseRows.map(r => [r.branchId, r]))

    // ── Build response ──────────────────────────────────────────────
    const branchStats = branches.map(branch => {
      const saleRow = salesAgg.get(branch.id)
      const expenseRow = expenseAgg.get(branch.id)
      const branchStock = stockByBranch.get(branch.id) ?? new Map()

      const lowStockCount = products.filter(p => {
        const q = branchStock.get(p.id) ?? 0
        return p.minStock > 0 && q <= p.minStock
      }).length

      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        location: branch.location,
        metrics: {
          totalSales: Number(saleRow?._sum.totalAmount ?? 0),
          transactionCount: saleRow?._count.id ?? 0,
          cashAmount: Number(saleRow?._sum.cashAmount ?? 0),
          debtAmount: Number(saleRow?._sum.debtAmount ?? 0),
          insuranceAmount: Number(saleRow?._sum.insuranceAmount ?? 0),
          totalExpenses: Number(expenseRow?._sum.amount ?? 0),
          lowStockCount,
          expiringSoonCount: expiringBatches.get(branch.id) ?? 0,
        },
      }
    })

    res.json({
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        preset: req.query.preset ?? 'custom',
      },
      branches: branchStats,
      totalBranches: branches.length,
    })
  } catch (error: any) {
    console.error('[Branch Dashboard Stats Error]:', error)
    res.status(500).json({ error: 'Failed to fetch branch dashboard stats' })
  }
}

/** Ledger net quantity per product for org, optionally scoped to one branch */
async function ledgerBalanceByProduct(
  organizationId: number,
  branchId: number | null
): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const rows =
    branchId != null
      ? await prisma.$queryRaw<Array<{ productId: number; bal: bigint }>>`
          SELECT "productId",
            COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN direction = 'OUT' THEN quantity ELSE 0 END), 0) AS bal
          FROM inventory_ledger
          WHERE "organizationId" = ${organizationId}
            AND "branchId" = ${branchId}
          GROUP BY "productId"
        `
      : await prisma.$queryRaw<Array<{ productId: number; bal: bigint }>>`
          SELECT "productId",
            COALESCE(SUM(CASE WHEN direction = 'IN' THEN quantity ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN direction = 'OUT' THEN quantity ELSE 0 END), 0) AS bal
          FROM inventory_ledger
          WHERE "organizationId" = ${organizationId}
          GROUP BY "productId"
        `
  for (const r of rows) {
    map.set(r.productId, Number(r.bal))
  }
  return map
}

function effectiveQuantity(
  productId: number,
  cachedQuantity: number,
  ledgerMap: Map<number, number>
): number {
  if (!ledgerMap.has(productId)) return cachedQuantity
  return ledgerMap.get(productId) ?? 0
}

export const getDashboardStats = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { days: qDays } = req.query;

    let startDate: Date | undefined;
    let endDate: Date = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (qDays !== 'all') {
      const days = Number.parseInt(qDays as string) || 7;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
    }

    const branchFilter = buildBranchFilter(req)
    const branchId =
      typeof branchFilter.branchId === "number" ? branchFilter.branchId : null

    const ledgerMap = await ledgerBalanceByProduct(organizationId, branchId)

    const allProducts = await prisma.product.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        quantity: true,
        minStock: true,
        unitPrice: true,
        category: true,
      },
    })

    const lowStock = allProducts
      .map((prod) => {
        const q = effectiveQuantity(prod.id, prod.quantity, ledgerMap)
        return {
          id: prod.id,
          name: prod.name,
          quantity: q,
          minStock: prod.minStock,
          remaining: q - prod.minStock,
        }
      })
      .filter((p) => p.minStock > 0 && p.quantity <= p.minStock)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 3)

    const expiringProducts = await prisma.product.findMany({
      where: {
        organizationId,
        deletedAt: null,
        expiryDate: {
          not: null,
          gt: new Date(),
        },
        ...(branchId != null
          ? {
              batches: {
                some: { branchId, isActive: true },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        expiryDate: true,
      },
      take: 3,
      orderBy: {
        expiryDate: "asc",
      },
    })

    const productsWithRemainingDays = expiringProducts.map((prod) => {
      const today = new Date()
      const expiry = new Date(prod.expiryDate!)
      const diffTime = expiry.getTime() - today.getTime()
      const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return {
        ...prod,
        remainingDays,
      }
    })

    const totalProducts = allProducts.length

    let totalStock = 0
    let totalInventoryValue = 0
    const categoryTotals = new Map<string, number>()

    for (const p of allProducts) {
      const q = effectiveQuantity(p.id, p.quantity, ledgerMap)
      totalStock += q
      totalInventoryValue += q * p.unitPrice.toNumber()
      const cat = p.category || "Uncategorized"
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + q)
    }

    const salesStats = await prisma.sale.aggregate({
      where: {
        organizationId,
        ...buildBranchFilter(req),
        ...(startDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
        status: { not: 'CANCELLED' }
      },
      _sum: {
        totalAmount: true
      }
    });

    const result = {
      totalProducts,
      totalStock,
      totalCategory: categoryTotals.size,
      totalInventoryValue,
      totalRevenue: Number(salesStats._sum.totalAmount || 0)
    }

    res.json({
      stockAlerts: lowStock,
      expiringProducts: productsWithRemainingDays,
      ...result,
    })
  } catch (error) {
    console.error("[Dashboard Stats Error]:", error)
    res.status(500).json({ error: "Failed to get dashboard stats" })
  }
}

export const getSalesTrend = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { startDate: qStartDate, endDate: qEndDate, days: qDays } = req.query;

    let startDate: Date | undefined;
    let endDate: Date = new Date();

    if (qStartDate && qEndDate) {
      startDate = new Date(qStartDate as string);
      endDate = new Date(qEndDate as string);
      // Ensure endDate includes the full day if it's just a date string
      endDate.setHours(23, 59, 59, 999);
    } else if (qDays === 'all') {
      startDate = undefined;
    } else {
      const days = Number.parseInt(qDays as string) || 7;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
    }

    const salesData = await prisma.sale.findMany({
      where: {
        organizationId,
        ...buildBranchFilter(req),
        ...(startDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          }
        }),
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
    })

    const salesByDate = salesData.reduce<Record<string, number>>((acc, sale) => {
      const date = sale.createdAt.toISOString().split("T")[0]
      if (!acc[date]) acc[date] = 0
      acc[date] += Number(sale.totalAmount)
      return acc
    }, {})

    // Fill in missing dates with 0 to ensure a continuous chart
    const result: Array<{ date: string; totalAmount: number }> = [];

    // Determine the start point for the continuous chart
    let chartStartDate = startDate;
    if (!chartStartDate) {
      if (salesData.length > 0) {
        const dates = salesData.map(s => s.createdAt.getTime());
        chartStartDate = new Date(Math.min(...dates));
      } else {
        chartStartDate = new Date(endDate);
      }
    }

    const current = new Date(chartStartDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      result.push({
        date: dateStr,
        totalAmount: salesByDate[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    res.json(result)
  } catch (error) {
    console.error("[Sales Trend Error]:", error)
    res.status(500).json({ error: "Failed to get sales trend" })
  }
}

export const getNotifications = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = Number(req.params.organizationId)
    const branchFilter = buildBranchFilter(req)
    const branchId =
      typeof branchFilter.branchId === "number" ? branchFilter.branchId : null
    const ledgerMap = await ledgerBalanceByProduct(organizationId, branchId)

    const notifications: {
      type: string
      title: string
      message: string
      time: Date
    }[] = []

    const expired = await prisma.product.findMany({
      where: {
        organizationId: Number(organizationId),
        deletedAt: null,
        expiryDate: {
          not: null,
          lt: new Date(),
        },
        ...(branchId != null
          ? { batches: { some: { branchId, isActive: true } } }
          : {}),
      },
      take: 5,
    })

    expired.forEach((prod) => {
      notifications.push({
        type: "danger",
        title: "Product Expired",
        message: `${prod.name} (Batch: ${prod.batchNumber}) has expired`,
        time: prod.expiryDate!,
      })
    })

    const expiringSoon = await prisma.product.findMany({
      where: {
        organizationId: Number(organizationId),
        deletedAt: null,
        expiryDate: {
          not: null,
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        ...(branchId != null
          ? { batches: { some: { branchId, isActive: true } } }
          : {}),
      },
      take: 5,
    })

    expiringSoon.forEach((prod) => {
      notifications.push({
        type: "warning",
        title: "Product Expiring Soon",
        message: `${prod.name} expires in less than 7 days`,
        time: prod.expiryDate!,
      })
    })

    const products = await prisma.product.findMany({
      where: { organizationId: Number(organizationId), deletedAt: null, isActive: true },
      select: { id: true, name: true, quantity: true, minStock: true },
    })

    const lowStock = products
      .map((p) => ({
        ...p,
        q: effectiveQuantity(p.id, p.quantity, ledgerMap),
      }))
      .filter((p) => p.minStock > 0 && p.q <= p.minStock)
      .slice(0, 5)

    lowStock.forEach((prod) => {
      notifications.push({
        type: "warning",
        title: "Low Stock Alert",
        message: `${prod.name} is running low (${prod.q} units remaining)`,
        time: new Date(),
      })
    })

    res.json(notifications)
  } catch (error) {
    console.error("[Notifications Error]:", error)
    res.status(500).json({ error: "Failed to get notifications" })
  }
}

export const topSellingProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const salesData = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: {
        quantity: true,
        totalPrice: true,
      },
      orderBy: {
        _sum: { quantity: "desc" },
      },
      take: 10,
      where: {
        sale: {
          organizationId,
          ...buildBranchFilter(req),
        },
      },
    });

    if (!salesData.length) {
      return res.status(404).json({ message: "No sales data found." });
    }
    const productIds = salesData.map((s) => s.productId).filter((id): id is number => id !== null);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const result = salesData.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return {
        id: item.productId,
        name: product?.name || "Unknown Product",
        sold: item._sum.quantity || 0,
        revenue: Number(item._sum.totalPrice || 0),
      };
    });
    res.status(200).json({
      message: "Top selling products retrieved successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching top selling products:", error);
    res.status(500).json({
      message: "Failed to fetch top selling products",
      error: error.message,
    });
  }
};

export const getDetailedInventory = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = Number(req.params.organizationId);
    const { search, category, status } = req.query;

    const branchFilter = buildBranchFilter(req)
    const branchId =
      typeof branchFilter.branchId === "number" ? branchFilter.branchId : null
    const ledgerMap = await ledgerBalanceByProduct(organizationId, branchId)

    const where: any = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (category) {
      where.category = category;
    }
    const products = await prisma.product.findMany({
      where,
      include: {
        saleItems: {
          where: {
            sale: {
              organizationId,
              ...buildBranchFilter(req),
              createdAt: {
                gte: new Date(new Date().setDate(new Date().getDate() - 30)) // Last 30 days
              }
            }
          },
          select: {
            quantity: true,
            unitPrice: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const inventoryData = products.map(product => {
      const soldLastMonth = product.saleItems.reduce((sum, sale) => sum + sale.quantity, 0);
      const currentStock = effectiveQuantity(product.id, product.quantity, ledgerMap);
      const averageStock = (product.minStock + currentStock) / 2;
      const turnoverRate = averageStock > 0 ? soldLastMonth / averageStock : 0;
      const rowStatus = currentStock <= product.minStock ? 'critical' :
        currentStock <= product.minStock * 1.5 ? 'low' :
          currentStock > product.minStock * 3 ? 'high' : 'normal';

      return {
        id: product.id,
        product: product.name,
        category: product.category || 'Uncategorized',
        currentStock: currentStock,
        minStock: product.minStock,
        maxStock: currentStock,
        unitPrice: product.unitPrice.toNumber(),
        soldLastMonth: soldLastMonth,
        turnoverRate: turnoverRate,
        status: rowStatus
      };
    });

    const filteredData = status
      ? inventoryData.filter(item => item.status === status)
      : inventoryData;

    res.json(filteredData);
  } catch (error: any) {
    console.error('Error fetching detailed inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch detailed inventory',
      error: error.message,
    });
  }
};

