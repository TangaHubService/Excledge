"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPaymentHistory = exports.getOutstandingDebts = exports.getCustomerDebtPayments = exports.getSalePayments = exports.recordDebtPayment = void 0;
const prisma_1 = require("../lib/prisma");
const activity_log_middleware_1 = require("../middleware/activity-log.middleware");
const recordDebtPayment = async (req, res) => {
    try {
        const saleId = parseInt(req.params.saleId);
        const organizationId = parseInt(req.params.organizationId);
        const { amount, paymentMethod = 'CASH', reference, notes } = req.body;
        const userId = parseInt(req.user?.userId);
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }
        // Start a transaction
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Get the sale with current debt
            const sale = await tx.sale.findFirst({
                where: {
                    id: saleId,
                    organizationId,
                    OR: [
                        { debtAmount: { gt: 0 } },
                        { status: 'COMPLETED' }
                    ]
                },
                include: {
                    customer: true,
                    saleItems: true
                }
            });
            if (!sale) {
                throw new Error("Sale not found or no debt to pay");
            }
            const paymentAmount = Number(amount);
            const currentDebt = Number(sale.debtAmount);
            if (isNaN(paymentAmount) || paymentAmount <= 0) {
                throw new Error("Invalid payment amount");
            }
            if (isNaN(currentDebt) || currentDebt <= 0) {
                throw new Error("No debt to pay");
            }
            const remainingDebt = currentDebt - paymentAmount;
            if (remainingDebt < 0) {
                throw new Error("Amount exceeds debt");
            }
            // 2. Create debt payment record
            const payment = await tx.debtPayment.create({
                data: {
                    saleId,
                    customerId: sale.customerId,
                    organizationId,
                    amount: paymentAmount,
                    paymentMethod,
                    reference,
                    notes,
                    recordedById: userId
                }
            });
            // 3. Update sale's debt amount
            await tx.sale.update({
                where: { id: saleId },
                data: {
                    debtAmount: remainingDebt,
                    cashAmount: { increment: paymentAmount }
                },
            });
            // 4. Update customer's balance
            await tx.customer.update({
                where: { id: sale.customerId },
                data: {
                    balance: { decrement: paymentAmount },
                },
            });
            return { payment, newDebtAmount: remainingDebt };
        });
        // Log the activity
        await (0, activity_log_middleware_1.logManualActivity)({
            userId,
            organizationId,
            module: 'SALES',
            type: 'SALE_UPDATE',
            description: 'Debt payment recorded',
            entityType: 'Sale',
            entityId: String(saleId),
            metadata: {
                amount: amount.toString(),
                paymentMethod,
                reference,
                organization: organizationId,
                agent: req.headers['user-agent'],
                ip: req.ip,
                time: new Date(),
            }
        });
        res.json({
            success: true,
            message: "Payment recorded successfully",
            data: {
                payment: result.payment,
                remainingDebt: result.newDebtAmount
            }
        });
    }
    catch (error) {
        console.error("[Record Debt Payment Error]:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to record payment"
        });
    }
};
exports.recordDebtPayment = recordDebtPayment;
const getSalePayments = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        const organizationId = parseInt(req.params.organizationId);
        const payments = await prisma_1.prisma.debtPayment.findMany({
            where: {
                saleId: Number(saleId),
                organizationId
            },
            orderBy: { paymentDate: 'desc' },
            include: {
                recordedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });
        res.json({ success: true, data: payments });
    }
    catch (error) {
        console.error('[Get Sale Payments Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment history'
        });
    }
};
exports.getSalePayments = getSalePayments;
const getCustomerDebtPayments = async (req, res) => {
    try {
        const customerId = Number(req.params.customerId);
        const organizationId = parseInt(req.params.organizationId);
        const payments = await prisma_1.prisma.debtPayment.findMany({
            where: {
                customerId: Number(customerId),
                organizationId
            },
            orderBy: { paymentDate: 'desc' },
            include: {
                recordedBy: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                sale: {
                    select: {
                        id: true,
                        saleNumber: true
                    }
                }
            }
        });
        res.json({ success: true, data: payments });
    }
    catch (error) {
        console.error('[Get Customer Payments Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer payments'
        });
    }
};
exports.getCustomerDebtPayments = getCustomerDebtPayments;
const getOutstandingDebts = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const sales = await prisma_1.prisma.sale.findMany({
            where: {
                organizationId,
                debtAmount: { gt: 0 }
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: sales });
    }
    catch (error) {
        console.error('[Get Outstanding Debts Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch outstanding debts'
        });
    }
};
exports.getOutstandingDebts = getOutstandingDebts;
const getAllPaymentHistory = async (req, res) => {
    try {
        const organizationId = Number(req.params.organizationId);
        const { paymentMethod, customerName, recordedByName, startDate, endDate } = req.query;
        const where = {
            organizationId,
            ...(paymentMethod && { paymentMethod }),
            ...(customerName && { customer: { name: { contains: customerName, mode: 'insensitive' } } }),
            ...(recordedByName && { recordedBy: { name: { contains: recordedByName, mode: 'insensitive' } } }),
            ...(startDate && endDate && {
                paymentDate: {
                    gte: new Date(startDate).toISOString(),
                    lte: new Date(endDate + 'T23:59:59.999Z').toISOString()
                }
            }),
        };
        const payments = await prisma_1.prisma.debtPayment.findMany({
            where,
            orderBy: { paymentDate: 'desc' },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    }
                },
                recordedBy: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                sale: {
                    select: {
                        id: true,
                        saleNumber: true
                    }
                }
            }
        });
        res.json({ success: true, data: payments });
    }
    catch (error) {
        console.error('[Get All Payment History Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch all payment history'
        });
    }
};
exports.getAllPaymentHistory = getAllPaymentHistory;
