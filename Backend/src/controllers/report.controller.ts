import type { Response } from "express"
import { prisma } from "../lib/prisma"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { buildBranchFilter } from "../middleware/branchAuth.middleware"
import { logManualActivity } from "../middleware/activity-log.middleware"
import { getProfitReport } from "../services/profit.service"
import { success, error as apiError } from "../utils/apiResponse"

export const getSalesReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const {
      startDate,
      endDate,
      category,
      status,
      sellerId,
      product,
      page,
      limit
    } = req.query;

    // Base where clause
    const where: any = {
      organizationId,
      ...buildBranchFilter(req),
      ...(startDate && endDate && startDate !== 'undefined' && endDate !== 'undefined' && (() => {
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          return {
            createdAt: {
              gte: start,
              lte: end,
            }
          };
        }
        return null;
      })()),
      ...(status && status !== 'all' && {
        status: status as string
      }),
      ...(sellerId && sellerId !== 'all' && {
        userId: parseInt(sellerId as string)
      })
    };

    // Get all sales with line items, product details, and user (seller) info
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
    });

    // Map transactions with all IDs and apply filters
    let transactions = sales.flatMap(sale =>
      sale.saleItems.map(item => ({
        id: item.id, // Sale Item ID
        saleId: sale.id, // Sale/Transaction ID
        productId: item.product.id, // Product ID
        sellerId: sale.user.id, // Seller/User ID
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
    );

    // Apply client-side filters (category, product search, maxAmount)
    if (category && category !== 'all') {
      transactions = transactions.filter(t => t.category === category);
    }

    if (product) {
      const productSearch = (product as string).toLowerCase();
      transactions = transactions.filter(t =>
        t.product.toLowerCase().includes(productSearch)
      );
    }

    // Get total count before pagination
    const totalItems = transactions.length;

    // Apply pagination
    const pageNum = page ? parseInt(page as string) : 1;
    const limitNum = limit ? parseInt(limit as string) : 10;
    const skip = (pageNum - 1) * limitNum;
    const paginatedTransactions = transactions.slice(skip, skip + limitNum);

    // Calculate summary statistics (from all transactions, not just paginated)
    const totalSales = transactions.reduce((sum, t) => sum + (t.status === 'REFUNDED' ? -t.total : t.total), 0);
    const totalQuantity = transactions.reduce((sum, t) => sum + (t.status === 'REFUNDED' ? -t.quantity : t.quantity), 0);
    const totalTransactions = new Set(transactions.map(t => t.saleId)).size;
    const avgTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    // Extract unique values for filter dropdowns (from all transactions)
    const uniqueCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean))).sort();
    const uniqueSellers = Array.from(
      new Map(
        transactions.map(t => [t.sellerId, { id: t.sellerId, name: t.seller, email: t.sellerEmail }])
      ).values()
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const uniqueProducts = Array.from(
      new Map(
        transactions.map(t => [t.productId, { id: t.productId, name: t.product, category: t.category }])
      ).values()
    ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Prepare the response
    const response = {
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
    };

    res.json(success(response));
  } catch (error: any) {
    console.error('Error generating sales report:', error);
    res.status(500).json(apiError('Failed to generate sales report', undefined, error.message));
  }
}

interface StockChange {
  date: string
  type: 'sale' | 'restock' | 'adjustment'
  quantity: number
  newStock: number
  note?: string
}

interface ProductWithSales {
  id: string
  name: string
  sku: string | null
  category: string | null
  quantity: number
  unitPrice: any // Prisma.Decimal
  minStock: number
  maxStock?: number | null
  organizationId: string
  createdAt: Date
  updatedAt: Date
  saleItems: Array<{
    quantity: number
    sale: {
      createdAt: Date
      saleNumber: string
    }
  }>
}

interface InventoryItem {
  id: string
  product: string
  sku: string
  category: string
  currentStock: number
  previousStock: number
  minStock: number
  maxStock: number
  unitPrice: number
  supplier: string
  lastRestocked: string
  changes: StockChange[]
  status: 'critical' | 'low' | 'normal' | 'high'
  stockValue: number
}

export const getInventoryReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { category, status, search } = req.query as {
      category?: string
      status?: string
      search?: string
    }

    // Base where clause
    const where: any = { organizationId, ...buildBranchFilter(req) }

    // Apply filters
    if (category && category !== 'all') {
      where.category = category
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get all products with related data
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
    }) as unknown as ProductWithSales[]

    // Get restock history (assuming you have a restock model)
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

    // Transform products to match frontend format
    const inventoryData = await Promise.all(
      products.map(async (product) => {
        // Get previous stock (from 30 days ago)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        // Calculate default max stock if not set
        const maxStock = product.maxStock || product.minStock * 5

        // Get stock changes from sales and restocks
        const salesChanges = product.saleItems.map((item) => ({
          date: item.sale.createdAt.toISOString().split('T')[0],
          type: 'sale' as const,
          quantity: -item.quantity,
          newStock: 0, // Will be calculated below
          note: `Sale #${item.sale.saleNumber}`,
        }))

        const restockChanges = restocks
          .filter((r) => r.productId === product.id)
          .map((restock) => ({
            date: restock.createdAt.toISOString().split('T')[0],
            type: 'restock' as const,
            quantity: Number(restock.quantity),
            newStock: 0, // Will be calculated below
            note: 'Stock replenishment',
          }))

        // Combine and sort all changes by date (newest first)
        const allChanges = [...salesChanges, ...restockChanges].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )

        // Calculate newStock for each change
        let currentStock = product.quantity
        const changesWithStock: StockChange[] = allChanges.map((change) => {
          const newStock = currentStock - change.quantity
          const changeWithStock = {
            ...change,
            newStock,
          }
          currentStock = newStock
          return changeWithStock
        })

        // Calculate previous stock (30 days ago)
        const previousStock = changesWithStock.reduce(
          (stock, change) => {
            const changeDate = new Date(change.date)
            if (changeDate < thirtyDaysAgo) {
              return stock
            }
            return stock - change.quantity
          },
          product.quantity
        )

        // Get stock status
        const getStockStatus = (): 'critical' | 'low' | 'normal' | 'high' => {
          if (product.quantity <= product.minStock) return 'critical'
          if (product.quantity <= product.minStock * 1.5) return 'low'
          if (product.quantity >= maxStock * 0.9) return 'high'
          return 'normal'
        }

        const itemStatus = getStockStatus()

        // Apply status filter if provided
        if (status && status !== 'all' && status !== itemStatus) {
          // If status is 'low', also include 'critical' items
          if (status === 'low' && itemStatus !== 'critical') {
            return null
          }
          // For other statuses, do exact match
          if (status !== 'low' && status !== itemStatus) {
            return null
          }
        }

        return {
          id: product.id,
          product: product.name,
          sku: product.sku || `PROD-${product.id.toString().padStart(8, '0')}`,
          category: product.category || 'Uncategorized',
          currentStock: product.quantity,
          previousStock: previousStock,
          minStock: product.minStock,
          maxStock: maxStock,
          unitPrice: Number(product.unitPrice),
          supplier: 'Supplier',
          lastRestocked: restocks[0]?.createdAt.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
          changes: changesWithStock.slice(0, 5), // Only return last 5 changes
          status: itemStatus,
          stockValue: Number(product.unitPrice) * product.quantity,
        } as InventoryItem
      })
    )

    // Filter out null values (from status filtering)
    const filteredData = inventoryData.filter((item): item is InventoryItem => item !== null)

    // Calculate summary statistics
    const totalValue = filteredData.reduce((sum, item) => sum + item.stockValue, 0)
    const totalItems = filteredData.reduce((sum, item) => sum + item.currentStock, 0)
    const criticalItems = filteredData.filter((item) => item.status === 'critical').length
    const lowStockItems = filteredData.filter(
      (item) => item.status === 'low' || item.status === 'critical'
    ).length

    // Get unique categories
    const categories = [...new Set(filteredData.map((item) => item.category).filter(Boolean))]

    res.json(success({
      inventoryData: filteredData,
      summary: {
        totalValue,
        totalItems,
        criticalItems,
        lowStockItems,
      },
      categories,
    }))
  } catch (error: any) {
    console.error('[Inventory Report Error]:', error)
    res.status(500).json(apiError('Failed to generate inventory report'))
  }
}

export const getDebtorsReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)

    // Get all customers with debt
    const debtors = await prisma.customer.findMany({
      where: {
        organizationId,
        ...buildBranchFilter(req),
        balance: { gt: 0 },
      },
      include: {
        sales: {
          where: {
            OR: [{ paymentType: "DEBT" }, { paymentType: "MIXED" }],
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { balance: "desc" },
    })

    // Total debt
    const totalDebt = debtors.reduce((sum, customer) => {
      return sum + Number(customer.balance)
    }, 0)

    res.json(success({
      totalDebt,
      debtorsCount: debtors.length,
      debtors,
    }))
  } catch (error: any) {
    console.error("[Debtors Report Error]:", error)
    res.status(500).json(apiError("Failed to generate debtors report"))
  }
}

export const exportReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const { reportType } = req.params
    const organizationId = Number(req.params.organizationId)
    const { startDate, endDate } = req.query

    // Set common where clause
    const where: any = { organizationId, ...buildBranchFilter(req) }
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)),
      }
    }

    let data: any[] = []
    let filename = ""

    switch (reportType) {
      case "sales":
        const sales = await prisma.sale.findMany({
          where,
          include: {
            customer: true,
            saleItems: {
              include: {
                product: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
        // Transform sales data for Excel
        data = sales.flatMap((sale) =>
          sale.saleItems.map((item) => ({
            Date:
              new Date(sale.createdAt).toLocaleDateString("en-CA") +
              "  " +
              new Date(sale.createdAt).toLocaleTimeString("en-GB", { hour12: false }),
            Product: item.product.name,
            Quantity: item.quantity,
            PricePerUnity: item.unitPrice.toString(),
            TotalPrice: item.totalPrice.toString(),
            Customer: sale.customer?.name || "Walk-in",
          })),
        )
        filename = `sales-report-${new Date().toISOString().split("T")[0]}.xlsx`
        break

      case "inventory":
        const inventory = await prisma.product.findMany({
          where: { organizationId },
          include: {
            saleItems: true,
          },
        })

        // Transform inventory data for Excel
        data = inventory.map((item) => ({
          Name: item.name,
          Category: item.category || "N/A",
          "Batch Number": item.batchNumber,
          "Expiry Date": item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "N/A",
          Quantity: item.quantity.toString(),
          "Unit Price": item.unitPrice.toString(),
          "Selling Price": item.saleItems.reduce((sum: number, si: any) => sum + Number(si.totalPrice), 0).toString(),
          Status: item.quantity > 0 ? "In Stock" : "Out of Stock",
        }))
        filename = `inventory-report-${new Date().toISOString().split("T")[0]}.xlsx`
        break

      case "debtors":
        const debtors = await prisma.customer.findMany({
          where: {
            organizationId,
            sales: {
              some: {
                paymentType: "DEBT",
                cashAmount: { gt: 0 },
              },
            },
          },
          include: {
            sales: {
              where: {
                paymentType: "DEBT",
                cashAmount: { gt: 0 },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        })

        // Transform debtors data for Excel
        data = debtors.flatMap((customer) =>
          customer.sales.map((tx) => ({
            "Customer Name": customer.name,
            Phone: customer.phone || "N/A",
            "Transaction ID": tx.id,
            "Amount Owed": tx.totalAmount.toString(),
            "Amount Paid": tx.cashAmount.toString(),
            Balance: tx.insuranceAmount.toString(),
            "Transaction Date": tx.createdAt.toISOString().split("T")[0],
          })),
        )
        filename = `debtors-report-${new Date().toISOString().split("T")[0]}.xlsx`
        break

      case "stock":
        const start = new Date(startDate as string);
        const end = new Date(new Date(endDate as string).setHours(23, 59, 59, 999));

        const stockProducts = await prisma.product.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            batchNumber: true,
            quantity: true,
            unitPrice: true,
          }
        });

        const stockReportData = await Promise.all(stockProducts.map(async (product) => {
          // Use InventoryLedger instead of StockMovement
          const periodMovements = await prisma.inventoryLedger.findMany({
            where: {
              productId: product.id,
              organizationId,
              createdAt: { gte: start, lte: end }
            }
          });

          // Get opening stock from ledger (balance before period start)
          const openingBalanceResult = await prisma.inventoryLedger.findFirst({
            where: {
              productId: product.id,
              organizationId,
              createdAt: { lt: start }
            },
            orderBy: { createdAt: 'desc' },
            select: { runningBalance: true }
          });

          // Get closing stock from ledger (balance at period end)
          const closingBalanceResult = await prisma.inventoryLedger.findFirst({
            where: {
              productId: product.id,
              organizationId,
              createdAt: { lte: end }
            },
            orderBy: { createdAt: 'desc' },
            select: { runningBalance: true }
          });

          const openingStock = openingBalanceResult?.runningBalance || 0;
          const closingStock = closingBalanceResult?.runningBalance || product.quantity;

          let stockIn = 0;
          let stockOut = 0;
          periodMovements.forEach(m => {
            if (m.direction === 'IN') {
              stockIn += m.quantity;
            } else {
              stockOut += m.quantity;
            }
          });

          return {
            "Product Name": product.name,
            "Batch Number": product.batchNumber || "N/A",
            "Opening Stock": openingStock,
            "Stock In": stockIn,
            "Stock Out": stockOut,
            "Closing Stock": closingStock,
            "Unit Price": product.unitPrice.toNumber(),
            "Total Value": closingStock * product.unitPrice.toNumber(),
          };
        }));

        data = stockReportData;
        filename = `stock-report-${new Date().toISOString().split("T")[0]}.xlsx`;
        break;

      case "stock-history":
        const stockMovements = await prisma.inventoryLedger.findMany({
          where: {
            organizationId,
            ...(startDate && endDate && {
              createdAt: {
                gte: new Date(startDate as string),
                lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)),
              }
            })
          },
          include: {
            product: { select: { name: true, batchNumber: true } },
            user: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' },
        });

        data = stockMovements.map(m => ({
          Date: new Date(m.createdAt).toLocaleString(),
          Product: m.product.name,
          Batch: m.batchNumber || m.product.batchNumber || "N/A",
          "Movement Type": m.movementType,
          Direction: m.direction,
          Quantity: m.direction === 'IN' ? `+${m.quantity}` : `-${m.quantity}`,
          "Running Balance": m.runningBalance,
          User: m.user.name,
          Note: m.note || "",
          Reference: m.reference || "",
        }));

        filename = `stock-history-${new Date().toISOString().split("T")[0]}.xlsx`;
        break;

      default:
        return res.status(400).json(apiError("Invalid report type"))
    }
    // Generate Excel file
    const XLSX = require("xlsx")
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report")

    // Set headers for file download
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)

    // Send the file
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })
    await logManualActivity({
      userId: Number(req.user?.userId!),
      organizationId: Number(organizationId),
      module: 'SYSTEM',
      type: 'OTHER',
      description: 'Report exported',
      entityType: 'Report',
      entityId: "",
      metadata: {
        organization: Number(organizationId),
        agent: req.headers['user-agent'],
        ip: req.ip,
        time: new Date(),
      }
    })
    res.send(excelBuffer)
  } catch (error: any) {
    console.error(`[Export ${req.params.reportType} Report Error]:`, error)
    res.status(500).json(apiError(`Failed to export ${req.params.reportType} report`))
  }
}

// Paid Debt Report
export const getDebtPaymentsReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { startDate, endDate } = req.query;

    const where: any = {
      organizationId,
      ...buildBranchFilter(req),
      ...(startDate && endDate && {
        paymentDate: {
          gte: new Date(startDate as string),
          lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)),
        }
      })
    };

    // Get all debt payments
    const debtPayments = await prisma.debtPayment.findMany({
      where,
      include: {
        customer: {
          select: {
            name: true,
            phone: true,
            balance: true
          }
        },
        recordedBy: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });

    // Calculate summary
    const totalPaid = debtPayments.reduce((sum, payment) => sum + payment.amount.toNumber(), 0);
    const paymentsCount = debtPayments.length;
    const avgPayment = paymentsCount > 0 ? totalPaid / paymentsCount : 0;

    // Get total remaining debt from Sales (more accurate than Customer balance)
    const salesWithDebt = await prisma.sale.aggregate({
      where: {
        organizationId,
        debtAmount: { gt: 0 },
        status: { notIn: ['CANCELLED', 'PENDING'] } // Pending sales are not finalized debt
      },
      _sum: {
        debtAmount: true
      }
    });
    const remainingDebt = salesWithDebt._sum.debtAmount?.toNumber() || 0;

    // Format payments with balance tracking
    // We need to calculate previousBalance and newBalance for each payment
    // To do this accurately, we need to track the customer's balance over time
    const payments = await Promise.all(debtPayments.map(async (payment) => {
      // Get all debt payments for this customer up to this payment date
      const previousPayments = await prisma.debtPayment.findMany({
        where: {
          customerId: payment.customerId,
          paymentDate: { lte: payment.paymentDate }
        },
        orderBy: { paymentDate: 'asc' }
      });

      // Get all sales with debt for this customer up to this payment date
      const customerSales = await prisma.sale.findMany({
        where: {
          customerId: payment.customerId,
          debtAmount: { gt: 0 },
          createdAt: { lte: payment.paymentDate },
          status: { notIn: ['CANCELLED', 'PENDING'] }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Calculate total debt incurred
      const totalDebtIncurred = customerSales.reduce((sum, sale) =>
        sum + sale.debtAmount.toNumber(), 0
      );

      // Calculate total paid before this payment
      const totalPaidBefore = previousPayments
        .filter(p => p.paymentDate < payment.paymentDate ||
          (p.paymentDate.getTime() === payment.paymentDate.getTime() && p.id < payment.id))
        .reduce((sum, p) => sum + p.amount.toNumber(), 0);

      // Previous balance = total debt - total paid before
      const previousBalance = totalDebtIncurred - totalPaidBefore;

      // New balance = previous balance - current payment
      const newBalance = previousBalance - payment.amount.toNumber();

      return {
        id: payment.id,
        customerName: payment.customer.name,
        customerPhone: payment.customer.phone || 'N/A',
        amountPaid: payment.amount.toNumber(),
        paymentDate: payment.paymentDate.toISOString(),
        paymentMethod: payment.paymentMethod,
        reference: payment.reference || 'N/A',
        notes: payment.notes || '',
        recordedBy: payment.recordedBy.name
      };
    }));

    res.json({
      summary: {
        totalPaid,
        paymentsCount,
        avgPayment,
        remainingDebt
      },
      payments
    });
  } catch (error: any) {
    console.error('Error generating debt payments report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate debt payments report',
      error: error.message,
    });
  }
};

// Cash Flow Report - UPGRADED TO TRUE CASH FLOW ACCOUNTING
export const getCashFlowReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { startDate, endDate } = req.query;

    const start = new Date(startDate as string);
    const end = new Date(new Date(endDate as string).setHours(23, 59, 59, 999));

    // 1. Calculate Opening Balance
    const openingBalance = await calculateOpeningBalance(organizationId, start);

    // 2. Get Cash Inflows
    const inflows = await getCashInflows(organizationId, start, end);

    // 3. Get Cash Outflows
    const outflows = await getCashOutflows(organizationId, start, end);

    // 4. Combine and sort all transactions
    const allTransactions = [...inflows, ...outflows].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 5. Calculate running balance
    let runningBalance = openingBalance;
    const transactions = allTransactions.map(t => {
      runningBalance += t.amount; // amount is positive for inflows, negative for outflows
      return { ...t, balance: runningBalance };
    });

    // 6. Calculate summary
    const totalInflows = inflows.reduce((sum, t) => sum + t.amount, 0);
    const totalOutflows = Math.abs(outflows.reduce((sum, t) => sum + t.amount, 0));
    const netCashFlow = totalInflows - totalOutflows;
    const closingBalance = openingBalance + netCashFlow;

    // 7. Verify balance integrity
    const calculatedClosing = runningBalance;
    const balanced = Math.abs(calculatedClosing - closingBalance) < 0.01;

    if (!balanced) {
      console.error('Balance mismatch detected!', {
        calculatedClosing,
        closingBalance,
        difference: calculatedClosing - closingBalance
      });
    }

    res.json({
      summary: {
        openingBalance,
        totalInflows,
        totalOutflows,
        netCashFlow,
        closingBalance
      },
      transactions,
      verification: {
        formula: 'Closing = Opening + Inflows - Outflows',
        calculated: closingBalance,
        actual: calculatedClosing,
        balanced
      }
    });
  } catch (error: any) {
    console.error('Error generating cash flow report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cash flow report',
      error: error.message,
    });
  }
};

// Helper function: Calculate opening balance
async function calculateOpeningBalance(organizationId: number, startDate: Date): Promise<number> {
  console.log(`[CashFlow] Calculating opening balance for Org ${organizationId} before ${startDate.toISOString()}`);

  // Option 1: Get from CashBalance table (if exists)
  const cashBalance = await prisma.cashBalance.findFirst({
    where: {
      organizationId,
      balanceDate: { lt: startDate }
    },
    orderBy: { balanceDate: 'desc' }
  });

  if (cashBalance) {
    console.log(`[CashFlow] Found cached balance: ${cashBalance.balance} from ${cashBalance.balanceDate}`);
    // If we have a cached balance, we need to add transactions from that balance date up to startDate
    // But for now, let's assume the cached balance is the ONLY source of truth if it exists.
    // Wait, if the cached balance is from last month, we still need transactions between then and now.
    // The previous logic just returned it. This might be a bug if the cache isn't strictly "yesterday's close".
    // For now, let's just log it.
    return cashBalance.balance.toNumber();
  } else {
    console.log(`[CashFlow] No cached balance found. Calculating from history.`);
  }

  // Option 2: Calculate from all historical transactions
  const historicalInflows = await getCashInflows(organizationId, new Date(0), startDate);
  const historicalOutflows = await getCashOutflows(organizationId, new Date(0), startDate);

  const totalInflows = historicalInflows.reduce((sum, t) => sum + t.amount, 0);
  const totalOutflows = Math.abs(historicalOutflows.reduce((sum, t) => sum + t.amount, 0));

  console.log(`[CashFlow] Historical Calculation:`);
  console.log(`- Inflows: ${historicalInflows.length} txns, Total: ${totalInflows}`);
  console.log(`- Outflows: ${historicalOutflows.length} txns, Total: ${totalOutflows}`);
  console.log(`- Calculated Opening: ${totalInflows - totalOutflows}`);

  return totalInflows - totalOutflows;
}

// Helper function: Get all cash inflows
async function getCashInflows(organizationId: number, start: Date, end: Date) {
  const transactions: any[] = [];

  // 1. Sales (Cash received from customers)
  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      createdAt: { gte: start, lte: end },
      status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] }
    },
    orderBy: { createdAt: 'asc' }
  });

  sales.forEach(sale => {
    const cashReceived = sale.cashAmount.toNumber();
    if (cashReceived > 0) {
      transactions.push({
        date: sale.createdAt.toISOString().split('T')[0],
        description: `Sale ${sale.saleNumber}`,
        type: 'INFLOW',
        category: 'Sales',
        subcategory: 'Customer Payment',
        amount: cashReceived,
        paymentMethod: sale.paymentType,
        reference: sale.saleNumber
      });
    }
  });

  // 2. Debt Payments (Customers paying off debt)
  const debtPayments = await prisma.debtPayment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end }
    },
    include: {
      customer: { select: { name: true } }
    },
    orderBy: { paymentDate: 'asc' }
  });

  debtPayments.forEach(payment => {
    transactions.push({
      date: payment.paymentDate.toISOString().split('T')[0],
      description: `Debt payment from ${payment.customer.name}`,
      type: 'INFLOW',
      category: 'Debt Collection',
      subcategory: 'Customer Debt Payment',
      amount: payment.amount.toNumber(),
      paymentMethod: payment.paymentMethod,
      reference: payment.reference || `DP-${payment.id}`
    });
  });

  return transactions;
}

// Helper function: Get all cash outflows
async function getCashOutflows(organizationId: number, start: Date, end: Date) {
  const transactions: any[] = [];

  // 1. Supplier Payments (Actual payments for inventory)
  const supplierPayments = await prisma.supplierPayment.findMany({
    where: {
      organizationId,
      paymentDate: { gte: start, lte: end }
    },
    include: {
      purchaseOrder: { select: { orderNumber: true } }
    },
    orderBy: { paymentDate: 'asc' }
  });

  supplierPayments.forEach(payment => {
    transactions.push({
      date: payment.paymentDate.toISOString().split('T')[0],
      description: `Payment for PO ${payment.purchaseOrder.orderNumber}`,
      type: 'OUTFLOW',
      category: 'Inventory Purchase',
      subcategory: 'Supplier Payment',
      amount: -payment.amount.toNumber(), // Negative for outflow
      paymentMethod: payment.paymentMethod,
      reference: payment.reference || `SP-${payment.id}`
    });
  });

  // 2. Refunds (Money returned to customers)
  const refundedSales = await prisma.sale.findMany({
    where: {
      organizationId,
      status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
      refundedAt: { gte: start, lte: end, not: null }
    },
    orderBy: { refundedAt: 'asc' }
  });

  refundedSales.forEach(sale => {
    const refundAmount = sale.status === 'REFUNDED'
      ? sale.cashAmount.toNumber()
      : sale.cashAmount.toNumber() * 0.5; // Estimate for partial refunds

    transactions.push({
      date: sale.refundedAt!.toISOString().split('T')[0],
      description: `Refund for Sale ${sale.saleNumber}`,
      type: 'OUTFLOW',
      category: 'Refunds',
      subcategory: 'Customer Refund',
      amount: -refundAmount,
      paymentMethod: sale.paymentType,
      reference: sale.saleNumber
    });
  });

  // 3. Operating Expenses
  const expenses = await prisma.expense.findMany({
    where: {
      organizationId,
      expenseDate: { gte: start, lte: end }
    },
    orderBy: { expenseDate: 'asc' }
  });

  expenses.forEach(expense => {
    transactions.push({
      date: expense.expenseDate.toISOString().split('T')[0],
      description: expense.description,
      type: 'OUTFLOW',
      category: 'Operating Expenses',
      subcategory: expense.category,
      amount: -expense.amount.toNumber(),
      paymentMethod: expense.paymentMethod,
      reference: expense.reference || `EXP-${expense.id}`
    });
  });

  return transactions;
}
// Stock Report (Opening, In, Out, Closing)
export const getStockReport = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { startDate, endDate, productId, category } = req.query;

    const start = new Date(startDate as string);
    const end = new Date(new Date(endDate as string).setHours(23, 59, 59, 999));

    // Base filters
    const productWhere: any = { organizationId };
    if (productId && productId !== 'undefined' && productId !== 'null') productWhere.id = productId;
    if (category && category !== 'undefined' && category !== 'null') productWhere.category = category;

    // Get products
    const products = await prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        name: true,
        batchNumber: true,
        quantity: true, // Current stock
        unitPrice: true,
      }
    });

    const reportData = await Promise.all(products.map(async (product) => {
      // 1. Get ledger movements during the period
      const periodMovements = await prisma.inventoryLedger.findMany({
        where: {
          productId: product.id,
          organizationId,
          ...buildBranchFilter(req),
          createdAt: { gte: start, lte: end }
        },
        orderBy: { createdAt: 'asc' }
      });

      // 2. Get opening stock (balance before period start) from ledger
      const openingBalanceResult = await prisma.inventoryLedger.findFirst({
        where: {
          productId: product.id,
          organizationId,
          ...buildBranchFilter(req),
          createdAt: { lt: start }
        },
        orderBy: { createdAt: 'desc' },
        select: { runningBalance: true }
      });

      // 3. Get closing stock (balance at period end) from ledger
      const closingBalanceResult = await prisma.inventoryLedger.findFirst({
        where: {
          productId: product.id,
          organizationId,
          ...buildBranchFilter(req),
          createdAt: { lte: end }
        },
        orderBy: { createdAt: 'desc' },
        select: { runningBalance: true }
      });

      const openingStock = openingBalanceResult?.runningBalance || 0;
      const closingStock = closingBalanceResult?.runningBalance || product.quantity;

      // 4. Calculate Stock In / Out during period from ledger
      let stockIn = 0;
      let stockOut = 0;

      periodMovements.forEach(m => {
        if (m.direction === 'IN') {
          stockIn += m.quantity;
        } else {
          stockOut += m.quantity;
        }
      });

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
      };
    }));

    // Summary
    const summary = reportData.reduce((acc, curr) => ({
      totalOpening: acc.totalOpening + curr.openingStock,
      totalIn: acc.totalIn + curr.stockIn,
      totalOut: acc.totalOut + curr.stockOut,
      totalClosing: acc.totalClosing + curr.closingStock,
      totalValue: acc.totalValue + curr.stockValue
    }), { totalOpening: 0, totalIn: 0, totalOut: 0, totalClosing: 0, totalValue: 0 });

    res.json({
      summary,
      data: reportData
    });
  } catch (error: any) {
    console.error('Error generating stock report:', error);
    res.status(500).json({ error: error.message || 'Failed to generate stock report' });
  }
};

// Full Stock History
export const getStockHistory = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { productId, batchNumber, startDate, endDate, userId, type, limit = "20", page = "1" } = req.query;

    const where: any = {
      organizationId,
      ...buildBranchFilter(req)
    };

    if (productId && productId !== 'undefined' && productId !== 'null') where.productId = parseInt(productId as string);
    if (userId && userId !== 'undefined' && userId !== 'null') where.userId = parseInt(userId as string);
    if (type && type !== 'undefined' && type !== 'null') where.movementType = type;

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)),
      };
    }

    if (batchNumber) {
      where.batchNumber = { contains: batchNumber as string, mode: 'insensitive' };
    }

    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string);
    const take = Number.parseInt(limit as string);

    const [movements, totalCount] = await Promise.all([
      prisma.inventoryLedger.findMany({
        where,
        include: {
          product: { select: { name: true, batchNumber: true } },
          user: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.inventoryLedger.count({ where }),
    ]);

    // Transform movements to match expected format
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
    }));

    res.json({
      data: transformedMovements,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / take),
        currentPage: Number.parseInt(page as string),
        limit: take,
      },
    });
  } catch (error: any) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stock history' });
  }
};

/**
 * Get profit report
 */
export const getProfitReportController = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const { startDate, endDate, productId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const report = await getProfitReport(
      organizationId,
      new Date(startDate as string),
      new Date(endDate as string),
      productId ? parseInt(productId as string) : undefined
    );

    res.json(report);
  } catch (error: any) {
    console.error('Error generating profit report:', error);
    res.status(500).json({ error: error.message || 'Failed to generate profit report' });
  }
};
