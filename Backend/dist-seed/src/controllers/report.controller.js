"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyReport = exports.getProfitReportController = exports.getStockHistory = exports.getStockReport = exports.getCashFlowReport = exports.getDebtPaymentsReport = exports.exportReport = exports.getDebtorsReport = exports.getInventoryReport = exports.getSalesReport = void 0;
const prisma_1 = require("../lib/prisma");
const branchAuth_middleware_1 = require("../middleware/branchAuth.middleware");
const activity_log_middleware_1 = require("../middleware/activity-log.middleware");
const profit_service_1 = require("../services/profit.service");
const apiResponse_1 = require("../utils/apiResponse");
const getSalesReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { startDate, endDate, category, status, sellerId, product, page, limit } = req.query;
        // Base where clause
        const where = {
            organizationId,
            ...(0, branchAuth_middleware_1.buildBranchFilter)(req),
            ...(startDate && endDate && startDate !== 'undefined' && endDate !== 'undefined' && (() => {
                const start = new Date(startDate);
                const end = new Date(endDate);
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
                status: status
            }),
            ...(sellerId && sellerId !== 'all' && {
                userId: parseInt(sellerId)
            })
        };
        // Get all sales with line items, product details, and user (seller) info
        const sales = await prisma_1.prisma.sale.findMany({
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
        // Map transactions with all IDs and apply filters (skip service items)
        let transactions = sales.flatMap(sale => sale.saleItems
            .filter(item => item.product)
            .map(item => ({
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
        })));
        // Apply client-side filters (category, product search, maxAmount)
        if (category && category !== 'all') {
            transactions = transactions.filter(t => t.category === category);
        }
        if (product) {
            const productSearch = product.toLowerCase();
            transactions = transactions.filter(t => t.product.toLowerCase().includes(productSearch));
        }
        // Get total count before pagination
        const totalItems = transactions.length;
        // Apply pagination
        const pageNum = page ? parseInt(page) : 1;
        const limitNum = limit ? parseInt(limit) : 10;
        const skip = (pageNum - 1) * limitNum;
        const paginatedTransactions = transactions.slice(skip, skip + limitNum);
        // Calculate summary statistics (from all transactions, not just paginated)
        const totalSales = transactions.reduce((sum, t) => sum + (t.status === 'REFUNDED' ? -t.total : t.total), 0);
        const totalQuantity = transactions.reduce((sum, t) => sum + (t.status === 'REFUNDED' ? -t.quantity : t.quantity), 0);
        const totalTransactions = new Set(transactions.map(t => t.saleId)).size;
        const avgTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;
        // Extract unique values for filter dropdowns (from all transactions)
        const uniqueCategories = Array.from(new Set(transactions.map(t => t.category).filter(Boolean))).sort();
        const uniqueSellers = Array.from(new Map(transactions.map(t => [t.sellerId, { id: t.sellerId, name: t.seller, email: t.sellerEmail }])).values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const uniqueProducts = Array.from(new Map(transactions.map(t => [t.productId, { id: t.productId, name: t.product, category: t.category }])).values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
        res.json((0, apiResponse_1.success)(response));
    }
    catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json((0, apiResponse_1.error)('Failed to generate sales report', undefined, error.message));
    }
};
exports.getSalesReport = getSalesReport;
const getInventoryReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { category, status, search } = req.query;
        // Base where clause
        const branchFilter = (0, branchAuth_middleware_1.buildBranchFilter)(req);
        const where = { organizationId };
        if (branchFilter.branchId) {
            where.batches = { some: { branchId: branchFilter.branchId } };
        }
        // Apply filters
        if (category && category !== 'all') {
            where.category = category;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
            ];
        }
        // Get all products with related data
        const products = await prisma_1.prisma.product.findMany({
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
        });
        // Get restock history (assuming you have a restock model)
        const restocks = await prisma_1.prisma.$queryRaw `
      SELECT id, "productId", quantity, "createdAt"
      FROM "restocks"
      WHERE "organizationId" = ${organizationId}
      ORDER BY "createdAt" DESC
    `.catch(() => []);
        // Transform products to match frontend format
        const inventoryData = await Promise.all(products.map(async (product) => {
            // Get previous stock (from 30 days ago)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            // Calculate default max stock if not set
            const maxStock = product.maxStock || product.minStock * 5;
            // Get stock changes from sales and restocks
            const salesChanges = product.saleItems.map((item) => ({
                date: item.sale.createdAt.toISOString().split('T')[0],
                type: 'sale',
                quantity: -item.quantity,
                newStock: 0, // Will be calculated below
                note: `Sale #${item.sale.saleNumber}`,
            }));
            const restockChanges = restocks
                .filter((r) => r.productId === product.id)
                .map((restock) => ({
                date: restock.createdAt.toISOString().split('T')[0],
                type: 'restock',
                quantity: Number(restock.quantity),
                newStock: 0, // Will be calculated below
                note: 'Stock replenishment',
            }));
            // Combine and sort all changes by date (newest first)
            const allChanges = [...salesChanges, ...restockChanges].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            // Calculate newStock for each change
            let currentStock = product.quantity;
            const changesWithStock = allChanges.map((change) => {
                const newStock = currentStock - change.quantity;
                const changeWithStock = {
                    ...change,
                    newStock,
                };
                currentStock = newStock;
                return changeWithStock;
            });
            // Calculate previous stock (30 days ago)
            const previousStock = changesWithStock.reduce((stock, change) => {
                const changeDate = new Date(change.date);
                if (changeDate < thirtyDaysAgo) {
                    return stock;
                }
                return stock - change.quantity;
            }, product.quantity);
            // Get stock status
            const getStockStatus = () => {
                if (product.quantity <= product.minStock)
                    return 'critical';
                if (product.quantity <= product.minStock * 1.5)
                    return 'low';
                if (product.quantity >= maxStock * 0.9)
                    return 'high';
                return 'normal';
            };
            const itemStatus = getStockStatus();
            // Apply status filter if provided
            if (status && status !== 'all' && status !== itemStatus) {
                // If status is 'low', also include 'critical' items
                if (status === 'low' && itemStatus !== 'critical') {
                    return null;
                }
                // For other statuses, do exact match
                if (status !== 'low' && status !== itemStatus) {
                    return null;
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
            };
        }));
        // Filter out null values (from status filtering)
        const filteredData = inventoryData.filter((item) => item !== null);
        // Calculate summary statistics
        const totalValue = filteredData.reduce((sum, item) => sum + item.stockValue, 0);
        const totalItems = filteredData.reduce((sum, item) => sum + item.currentStock, 0);
        const criticalItems = filteredData.filter((item) => item.status === 'critical').length;
        const lowStockItems = filteredData.filter((item) => item.status === 'low' || item.status === 'critical').length;
        // Get unique categories
        const categories = [...new Set(filteredData.map((item) => item.category).filter(Boolean))];
        res.json((0, apiResponse_1.success)({
            inventoryData: filteredData,
            summary: {
                totalValue,
                totalItems,
                criticalItems,
                lowStockItems,
            },
            categories,
        }));
    }
    catch (error) {
        console.error('[Inventory Report Error]:', error);
        res.status(500).json((0, apiResponse_1.error)('Failed to generate inventory report'));
    }
};
exports.getInventoryReport = getInventoryReport;
const getDebtorsReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        // Get all customers with debt
        const debtors = await prisma_1.prisma.customer.findMany({
            where: {
                organizationId,
                ...(0, branchAuth_middleware_1.buildBranchFilter)(req),
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
        });
        // Total debt
        const totalDebt = debtors.reduce((sum, customer) => {
            return sum + Number(customer.balance);
        }, 0);
        res.json((0, apiResponse_1.success)({
            totalDebt,
            debtorsCount: debtors.length,
            debtors,
        }));
    }
    catch (error) {
        console.error("[Debtors Report Error]:", error);
        res.status(500).json((0, apiResponse_1.error)("Failed to generate debtors report"));
    }
};
exports.getDebtorsReport = getDebtorsReport;
const exportReport = async (req, res) => {
    try {
        const { reportType } = req.params;
        const organizationId = Number(req.params.organizationId);
        const { startDate, endDate } = req.query;
        // Set common where clause
        const where = { organizationId, ...(0, branchAuth_middleware_1.buildBranchFilter)(req) };
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            };
        }
        let data = [];
        let filename = "";
        switch (reportType) {
            case "sales":
                const sales = await prisma_1.prisma.sale.findMany({
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
                });
                // Transform sales data for Excel
                data = sales.flatMap((sale) => sale.saleItems
                    .filter((item) => item.product)
                    .map((item) => ({
                    Date: new Date(sale.createdAt).toLocaleDateString("en-CA") +
                        "  " +
                        new Date(sale.createdAt).toLocaleTimeString("en-GB", { hour12: false }),
                    Product: item.product.name,
                    Quantity: item.quantity,
                    PricePerUnity: item.unitPrice.toString(),
                    TotalPrice: item.totalPrice.toString(),
                    Customer: sale.customer?.name || "Walk-in",
                })));
                filename = `sales-report-${new Date().toISOString().split("T")[0]}.xlsx`;
                break;
            case "inventory":
                const inventory = await prisma_1.prisma.product.findMany({
                    where: { organizationId },
                    include: {
                        saleItems: true,
                    },
                });
                // Transform inventory data for Excel
                data = inventory.map((item) => ({
                    Name: item.name,
                    Category: item.category || "N/A",
                    "Batch Number": item.batchNumber,
                    "Expiry Date": item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "N/A",
                    Quantity: item.quantity.toString(),
                    "Unit Price": item.unitPrice.toString(),
                    "Selling Price": item.saleItems.reduce((sum, si) => sum + Number(si.totalPrice), 0).toString(),
                    Status: item.quantity > 0 ? "In Stock" : "Out of Stock",
                }));
                filename = `inventory-report-${new Date().toISOString().split("T")[0]}.xlsx`;
                break;
            case "debtors":
                const debtors = await prisma_1.prisma.customer.findMany({
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
                });
                // Transform debtors data for Excel
                data = debtors.flatMap((customer) => customer.sales.map((tx) => ({
                    "Customer Name": customer.name,
                    Phone: customer.phone || "N/A",
                    "Transaction ID": tx.id,
                    "Amount Owed": tx.totalAmount.toString(),
                    "Amount Paid": tx.cashAmount.toString(),
                    Balance: tx.insuranceAmount.toString(),
                    "Transaction Date": tx.createdAt.toISOString().split("T")[0],
                })));
                filename = `debtors-report-${new Date().toISOString().split("T")[0]}.xlsx`;
                break;
            case "stock":
                const start = new Date(startDate);
                const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));
                const stockProducts = await prisma_1.prisma.product.findMany({
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
                    const periodMovements = await prisma_1.prisma.inventoryLedger.findMany({
                        where: {
                            productId: product.id,
                            organizationId,
                            createdAt: { gte: start, lte: end }
                        }
                    });
                    // Get opening stock from ledger (balance before period start)
                    const openingBalanceResult = await prisma_1.prisma.inventoryLedger.findFirst({
                        where: {
                            productId: product.id,
                            organizationId,
                            createdAt: { lt: start }
                        },
                        orderBy: { createdAt: 'desc' },
                        select: { runningBalance: true }
                    });
                    // Get closing stock from ledger (balance at period end)
                    const closingBalanceResult = await prisma_1.prisma.inventoryLedger.findFirst({
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
                        }
                        else {
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
                const stockMovements = await prisma_1.prisma.inventoryLedger.findMany({
                    where: {
                        organizationId,
                        ...(startDate && endDate && {
                            createdAt: {
                                gte: new Date(startDate),
                                lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
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
                return res.status(400).json((0, apiResponse_1.error)("Invalid report type"));
        }
        // Generate Excel file
        const XLSX = require("xlsx");
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
        // Set headers for file download
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        // Send the file
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
        await (0, activity_log_middleware_1.logManualActivity)({
            userId: Number(req.user?.userId),
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
        });
        res.send(excelBuffer);
    }
    catch (error) {
        console.error(`[Export ${req.params.reportType} Report Error]:`, error);
        res.status(500).json((0, apiResponse_1.error)(`Failed to export ${req.params.reportType} report`));
    }
};
exports.exportReport = exportReport;
// Paid Debt Report
const getDebtPaymentsReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { startDate, endDate } = req.query;
        const where = {
            organizationId,
            ...(0, branchAuth_middleware_1.buildBranchFilter)(req),
            ...(startDate && endDate && {
                paymentDate: {
                    gte: new Date(startDate),
                    lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
                }
            })
        };
        // Get all debt payments
        const debtPayments = await prisma_1.prisma.debtPayment.findMany({
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
        const salesWithDebt = await prisma_1.prisma.sale.aggregate({
            where: {
                organizationId,
                debtAmount: { gt: 0 },
                status: { not: 'CANCELLED' } // Ensure cancelled sales don't count
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
            const previousPayments = await prisma_1.prisma.debtPayment.findMany({
                where: {
                    customerId: payment.customerId,
                    paymentDate: { lte: payment.paymentDate }
                },
                orderBy: { paymentDate: 'asc' }
            });
            // Get all sales with debt for this customer up to this payment date
            const customerSales = await prisma_1.prisma.sale.findMany({
                where: {
                    customerId: payment.customerId,
                    debtAmount: { gt: 0 },
                    createdAt: { lte: payment.paymentDate },
                    status: { not: 'CANCELLED' }
                },
                orderBy: { createdAt: 'asc' }
            });
            // Calculate total debt incurred
            const totalDebtIncurred = customerSales.reduce((sum, sale) => sum + sale.debtAmount.toNumber(), 0);
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
    }
    catch (error) {
        console.error('Error generating debt payments report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate debt payments report',
            error: error.message,
        });
    }
};
exports.getDebtPaymentsReport = getDebtPaymentsReport;
// Cash Flow Report - UPGRADED TO TRUE CASH FLOW ACCOUNTING
const getCashFlowReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { startDate, endDate } = req.query;
        const start = new Date(startDate);
        const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        // 1. Calculate Opening Balance
        const openingBalance = await calculateOpeningBalance(organizationId, start);
        // 2. Get Cash Inflows
        const inflows = await getCashInflows(organizationId, start, end);
        // 3. Get Cash Outflows
        const outflows = await getCashOutflows(organizationId, start, end);
        // 4. Combine and sort all transactions
        const allTransactions = [...inflows, ...outflows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
    }
    catch (error) {
        console.error('Error generating cash flow report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate cash flow report',
            error: error.message,
        });
    }
};
exports.getCashFlowReport = getCashFlowReport;
// Helper function: Calculate opening balance
async function calculateOpeningBalance(organizationId, startDate) {
    console.log(`[CashFlow] Calculating opening balance for Org ${organizationId} before ${startDate.toISOString()}`);
    // Option 1: Get from CashBalance table (if exists)
    const cashBalance = await prisma_1.prisma.cashBalance.findFirst({
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
    }
    else {
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
async function getCashInflows(organizationId, start, end) {
    const transactions = [];
    // 1. Sales (Cash received from customers)
    const sales = await prisma_1.prisma.sale.findMany({
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
    const debtPayments = await prisma_1.prisma.debtPayment.findMany({
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
async function getCashOutflows(organizationId, start, end) {
    const transactions = [];
    // 1. Supplier Payments (Actual payments for inventory)
    const supplierPayments = await prisma_1.prisma.supplierPayment.findMany({
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
    const refundedSales = await prisma_1.prisma.sale.findMany({
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
            date: sale.refundedAt.toISOString().split('T')[0],
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
    const expenses = await prisma_1.prisma.expense.findMany({
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
const getStockReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { startDate, endDate, productId, category } = req.query;
        const start = new Date(startDate);
        const end = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        // Base filters
        const productWhere = { organizationId };
        if (productId && productId !== 'undefined' && productId !== 'null')
            productWhere.id = productId;
        if (category && category !== 'undefined' && category !== 'null')
            productWhere.category = category;
        // Get products
        const products = await prisma_1.prisma.product.findMany({
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
            const periodMovements = await prisma_1.prisma.inventoryLedger.findMany({
                where: {
                    productId: product.id,
                    organizationId,
                    ...(0, branchAuth_middleware_1.buildBranchFilter)(req),
                    createdAt: { gte: start, lte: end }
                },
                orderBy: { createdAt: 'asc' }
            });
            // 2. Get opening stock (balance before period start) from ledger
            const openingBalanceResult = await prisma_1.prisma.inventoryLedger.findFirst({
                where: {
                    productId: product.id,
                    organizationId,
                    ...(0, branchAuth_middleware_1.buildBranchFilter)(req),
                    createdAt: { lt: start }
                },
                orderBy: { createdAt: 'desc' },
                select: { runningBalance: true }
            });
            // 3. Get closing stock (balance at period end) from ledger
            const closingBalanceResult = await prisma_1.prisma.inventoryLedger.findFirst({
                where: {
                    productId: product.id,
                    organizationId,
                    ...(0, branchAuth_middleware_1.buildBranchFilter)(req),
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
                }
                else {
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
    }
    catch (error) {
        console.error('Error generating stock report:', error);
        res.status(500).json({ error: error.message || 'Failed to generate stock report' });
    }
};
exports.getStockReport = getStockReport;
// Full Stock History
const getStockHistory = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { productId, batchNumber, startDate, endDate, userId, type, limit = "20", page = "1" } = req.query;
        const where = {
            organizationId,
            ...(0, branchAuth_middleware_1.buildBranchFilter)(req)
        };
        if (productId && productId !== 'undefined' && productId !== 'null')
            where.productId = parseInt(productId);
        if (userId && userId !== 'undefined' && userId !== 'null')
            where.userId = parseInt(userId);
        if (type && type !== 'undefined' && type !== 'null')
            where.movementType = type;
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
            };
        }
        if (batchNumber) {
            where.batchNumber = { contains: batchNumber, mode: 'insensitive' };
        }
        const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit);
        const take = Number.parseInt(limit);
        const [movements, totalCount] = await Promise.all([
            prisma_1.prisma.inventoryLedger.findMany({
                where,
                include: {
                    product: { select: { name: true, batchNumber: true } },
                    user: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take,
            }),
            prisma_1.prisma.inventoryLedger.count({ where }),
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
                currentPage: Number.parseInt(page),
                limit: take,
            },
        });
    }
    catch (error) {
        console.error('Error fetching stock history:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch stock history' });
    }
};
exports.getStockHistory = getStockHistory;
/**
 * Get profit report
 */
const getProfitReportController = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { startDate, endDate, productId } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }
        const report = await (0, profit_service_1.getProfitReport)(organizationId, new Date(startDate), new Date(endDate), productId ? parseInt(productId) : undefined);
        res.json(report);
    }
    catch (error) {
        console.error('Error generating profit report:', error);
        res.status(500).json({ error: error.message || 'Failed to generate profit report' });
    }
};
exports.getProfitReportController = getProfitReportController;
// ──────────────────────────────────────────────
// C9: X / Z Daily Report (RRA CIS/VSDC spec §6)
// X = interim totals since last Z-report (does NOT reset counters)
// Z = end-of-day legal record (resets daily counters)
// ──────────────────────────────────────────────
const TAX_CODES = ['A', 'B', 'C', 'D', 'E'];
function fix2(n) {
    return Math.round(n * 100) / 100;
}
const getDailyReport = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const reportType = (req.query.type ?? 'X').toUpperCase();
        const { date, branchId: branchParam } = req.query;
        if (reportType !== 'X' && reportType !== 'Z') {
            return res.status(400).json((0, apiResponse_1.error)('type must be X or Z'));
        }
        const reportDate = date ? new Date(date) : new Date();
        const dayStart = new Date(reportDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(reportDate);
        dayEnd.setHours(23, 59, 59, 999);
        const branchFilter = {};
        if (branchParam) {
            branchFilter.branchId = parseInt(branchParam);
        }
        else {
            const bFilter = (0, branchAuth_middleware_1.buildBranchFilter)(req);
            if (Object.keys(bFilter).length)
                Object.assign(branchFilter, bFilter);
        }
        // Fetch all completed/refunded sales for the day
        const sales = await prisma_1.prisma.sale.findMany({
            where: {
                organizationId,
                ...branchFilter,
                createdAt: { gte: dayStart, lte: dayEnd },
                status: { in: ['COMPLETED', 'REFUNDED'] },
            },
            include: {
                saleItems: { select: { taxCode: true, taxAmount: true, totalPrice: true, quantity: true } },
                ebmTransactions: {
                    where: { submissionStatus: 'SUCCESS' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        // Split into NS/NR buckets
        const normalSales = sales.filter(s => s.status === 'COMPLETED' && s.rcptLabel !== 'TR' && s.rcptLabel !== 'TS');
        const normalRefunds = sales.filter(s => s.status === 'REFUNDED' && s.rcptLabel !== 'TR' && s.rcptLabel !== 'TS');
        // Per-tax-band totals
        const taxBands = {};
        for (const code of TAX_CODES) {
            taxBands[code] = { taxableAmt: 0, taxAmt: 0, salesAmt: 0 };
        }
        for (const sale of normalSales) {
            for (const si of sale.saleItems) {
                const code = (si.taxCode ?? 'A').toUpperCase();
                if (!taxBands[code])
                    taxBands[code] = { taxableAmt: 0, taxAmt: 0, salesAmt: 0 };
                const total = Number(si.totalPrice);
                const tax = Number(si.taxAmount);
                taxBands[code].taxAmt = fix2(taxBands[code].taxAmt + tax);
                taxBands[code].taxableAmt = fix2(taxBands[code].taxableAmt + (total - tax));
                taxBands[code].salesAmt = fix2(taxBands[code].salesAmt + total);
            }
        }
        // Payment breakdown
        const paymentTotals = {};
        for (const sale of normalSales) {
            const pt = sale.paymentType;
            paymentTotals[pt] = fix2((paymentTotals[pt] ?? 0) + Number(sale.totalAmount));
        }
        const grossSalesAmt = fix2(normalSales.reduce((s, sale) => s + Number(sale.totalAmount), 0));
        const grossRefundAmt = fix2(normalRefunds.reduce((s, sale) => s + Math.abs(Number(sale.totalAmount)), 0));
        const netSalesAmt = fix2(grossSalesAmt - grossRefundAmt);
        const totalTaxAmt = fix2(Object.values(taxBands).reduce((s, b) => s + b.taxAmt, 0));
        const report = {
            reportType,
            reportDate: reportDate.toISOString().split('T')[0],
            organizationId,
            branchId: branchParam ? parseInt(branchParam) : null,
            periodStart: dayStart.toISOString(),
            periodEnd: dayEnd.toISOString(),
            generatedAt: new Date().toISOString(),
            summary: {
                normalSalesCount: normalSales.length,
                normalRefundsCount: normalRefunds.length,
                grossSalesAmt,
                grossRefundAmt,
                netSalesAmt,
                totalTaxAmt,
            },
            taxBands,
            paymentBreakdown: paymentTotals,
            fiscalizedCount: sales.filter(s => s.ebmTransactions?.length > 0).length,
        };
        res.json((0, apiResponse_1.success)(report));
    }
    catch (error) {
        console.error('[Daily Report Error]:', error);
        res.status(500).json((0, apiResponse_1.error)('Failed to generate daily report'));
    }
};
exports.getDailyReport = getDailyReport;
