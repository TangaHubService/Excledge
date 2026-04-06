import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logManualActivity } from '../middleware/activity-log.middleware';

export const recordDebtPayment = async (req: AuthRequest, res: Response) => {
    try {
        const saleId = parseInt(req.params.saleId);
        const organizationId = parseInt(req.params.organizationId);
        const { amount, paymentMethod = 'CASH', reference, notes } = req.body;
        const userId = parseInt(req.user?.userId as string);

        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        // Start a transaction
        const result = await prisma.$transaction(async (tx) => {
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
        await logManualActivity({
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
    } catch (error: any) {
        console.error("[Record Debt Payment Error]:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to record payment"
        });
    }
};

export const getSalePayments = async (req: AuthRequest, res: Response) => {
    try {
        const saleId = Number(req.params.saleId);
        const organizationId = parseInt(req.params.organizationId);

        const payments = await prisma.debtPayment.findMany({
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
    } catch (error) {
        console.error('[Get Sale Payments Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment history'
        });
    }
};

export const getCustomerDebtPayments = async (req: AuthRequest, res: Response) => {
    try {
        const customerId = Number(req.params.customerId);
        const organizationId = parseInt(req.params.organizationId);

        const payments = await prisma.debtPayment.findMany({
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
    } catch (error) {
        console.error('[Get Customer Payments Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer payments'
        });
    }
};

export const getOutstandingDebts = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId);

        const sales = await prisma.sale.findMany({
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
    } catch (error) {
        console.error('[Get Outstanding Debts Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch outstanding debts'
        });
    }
};

export const getAllPaymentHistory = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = Number(req.params.organizationId);
        const {
            paymentMethod,
            customerName,
            recordedByName,
            startDate,
            endDate
        } = req.query as {
            paymentMethod?: string;
            customerName?: string;
            recordedByName?: string;
            startDate?: string;
            endDate?: string;
        };

        const where: Prisma.DebtPaymentWhereInput = {
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

        const payments = await prisma.debtPayment.findMany({
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
    } catch (error) {
        console.error('[Get All Payment History Error]:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch all payment history'
        });
    }
};
