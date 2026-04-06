import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth.middleware"
import { prisma } from "../lib/prisma"

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
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

    const products = await prisma.product.findMany({
      where: {
        organizationId,
        quantity: {
          lte: prisma.product.fields.minStock,
        },
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        minStock: true,
      },
      take: 3,
    })

    const lowStock = products
      .map((prod) => ({
        ...prod,
        remaining: prod.quantity - prod.minStock,
      }))
      .sort((a, b) => a.remaining - b.remaining)

    const expiringProducts = await prisma.product.findMany({
      where: {
        organizationId,
        expiryDate: {
          not: null,
          gt: new Date(),
        },
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

    const totalProducts = await prisma.product.count({
      where: { organizationId },
    })

    const totalStock = await prisma.product.aggregate({
      where: { organizationId },
      _sum: { quantity: true },
    })
    const allproducts = await prisma.product.findMany({
      where: { organizationId },
      select: { unitPrice: true, quantity: true },
    });

    const totalInventoryValue = allproducts.reduce(
      (acc, product: any) => acc + (product.unitPrice * product.quantity),
      0
    );



    const totalByCategory = await prisma.product.groupBy({
      by: ["category"],
      where: { organizationId },
      _sum: { quantity: true },
      _count: { id: true },
      orderBy: {
        _sum: { quantity: "desc" },
      },
    })

    const salesStats = await prisma.sale.aggregate({
      where: {
        organizationId,
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
      totalStock: totalStock._sum.quantity || 0,
      totalCategory: totalByCategory.length,
      totalInventoryValue: totalInventoryValue,
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

export const getSalesTrend = async (req: AuthRequest, res: Response) => {
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

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = Number(req.params.organizationId)
    const notifications: {
      type: string
      title: string
      message: string
      time: Date
    }[] = []

    const expired = await prisma.product.findMany({
      where: {
        organizationId: Number(organizationId),
        expiryDate: {
          not: null,
          lt: new Date(),
        },
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
        expiryDate: {
          not: null,
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
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

    const lowStock = await prisma.product.findMany({
      where: {
        organizationId: Number(organizationId),
        quantity: { lte: prisma.product.fields.minStock },
      },
      take: 5,
    })

    lowStock.forEach((prod) => {
      notifications.push({
        type: "warning",
        title: "Low Stock Alert",
        message: `${prod.name} is running low (${prod.quantity} units remaining)`,
        time: new Date(),
      })
    })

    res.json(notifications)
  } catch (error) {
    console.error("[Notifications Error]:", error)
    res.status(500).json({ error: "Failed to get notifications" })
  }
}

export const topSellingProducts = async (req: AuthRequest, res: Response) => {
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
        },
      },
    });

    if (!salesData.length) {
      return res.status(404).json({ message: "No sales data found." });
    }
    const productIds = salesData.map((s) => s.productId);
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

export const getDetailedInventory = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = Number(req.params.organizationId);
    const { search, category, status } = req.query;

    const where: any = { organizationId };

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
      const averageStock = (product.minStock + product.quantity) / 2;
      const turnoverRate = averageStock > 0 ? soldLastMonth / averageStock : 0;
      const currentStock = product.quantity;
      const status = currentStock <= product.minStock ? 'critical' :
        currentStock <= product.minStock * 1.5 ? 'low' :
          currentStock >= product.quantity * 0.9 ? 'high' : 'normal';

      return {
        id: product.id,
        product: product.name,
        category: product.category || 'Uncategorized',
        currentStock: currentStock,
        minStock: product.minStock,
        maxStock: product.quantity,
        unitPrice: product.unitPrice.toNumber(),
        soldLastMonth: soldLastMonth,
        turnoverRate: turnoverRate,
        status: status
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

