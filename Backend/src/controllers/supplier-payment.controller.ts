import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import { logManualActivity } from '../middleware/activity-log.middleware';
import { ActivityType } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Record a supplier payment
 */
export const recordSupplierPayment = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const userId = req.user?.userId!;
        const {
            purchaseOrderId,
            amount,
            paymentMethod,
            paymentDate,
            reference,
            notes
        } = req.body;

        // Validation
        if (!purchaseOrderId || !amount || !paymentMethod || !paymentDate) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: purchaseOrderId, amount, paymentMethod, paymentDate'
            });
        }

        // Verify purchase order exists and belongs to organization
        const purchaseOrder = await prisma.purchaseOrder.findFirst({
            where: {
                id: Number(purchaseOrderId),
                organizationId: Number(organizationId)
            }
        });

        if (!purchaseOrder) {
            return res.status(404).json({
                success: false,
                message: 'Purchase order not found'
            });
        }

        // Get total payments made so far
        const existingPayments = await prisma.supplierPayment.aggregate({
            where: {
                purchaseOrderId: parseInt(purchaseOrderId)
            },
            _sum: {
                amount: true
            }
        });

        const totalPaid = existingPayments._sum.amount?.toNumber() || 0;
        const newTotal = totalPaid + parseFloat(amount);

        // Check if payment exceeds purchase order total
        if (newTotal > purchaseOrder.totalAmount.toNumber()) {
            return res.status(400).json({
                success: false,
                message: `Payment exceeds purchase order total. Remaining: ${purchaseOrder.totalAmount.toNumber() - totalPaid}`
            });
        }

        // Create supplier payment
        const payment = await prisma.supplierPayment.create({
            data: {
                purchaseOrderId: Number(purchaseOrderId),
                organizationId: Number(organizationId),
                amount: parseFloat(amount),
                paymentMethod,
                paymentDate: new Date(paymentDate),
                reference,
                notes,
                recordedById: Number(userId)
            },
            include: {
                purchaseOrder: {
                    select: {
                        orderNumber: true,
                        totalAmount: true
                    }
                }
            }
        });

        // Log activity
        await logManualActivity({
            userId: Number(userId),
            organizationId: Number(organizationId),
            module: 'PURCHASE_ORDERS',
            type: ActivityType.PAYMENT_RECEIVED,
            description: `Recorded supplier payment: ${amount} for PO ${purchaseOrder.orderNumber}`,
            entityType: 'SupplierPayment',
            entityId: payment.id.toString(),
            metadata: {
                purchaseOrderId,
                amount,
                paymentMethod,
                totalPaid: newTotal,
                remaining: purchaseOrder.totalAmount.toNumber() - newTotal
            }
        });

        res.status(201).json({
            success: true,
            message: 'Supplier payment recorded successfully',
            payment,
            summary: {
                totalPaid: newTotal,
                remaining: purchaseOrder.totalAmount.toNumber() - newTotal,
                fullyPaid: newTotal >= purchaseOrder.totalAmount.toNumber()
            }
        });
    } catch (error: any) {
        console.error('Error recording supplier payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record supplier payment',
            error: error.message
        });
    }
};

/**
 * Get all supplier payments
 */
export const getSupplierPayments = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const { startDate, endDate, purchaseOrderId, paymentMethod, limit = '50', page = '1' } = req.query;

        const where: any = { organizationId };

        // Date filter
        if (startDate && endDate) {
            where.paymentDate = {
                gte: new Date(startDate as string),
                lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999))
            };
        }

        // Purchase order filter
        if (purchaseOrderId) {
            where.purchaseOrderId = parseInt(purchaseOrderId as string);
        }

        // Payment method filter
        if (paymentMethod && paymentMethod !== 'ALL') {
            where.paymentMethod = paymentMethod;
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const take = parseInt(limit as string);

        const [payments, totalCount] = await Promise.all([
            prisma.supplierPayment.findMany({
                where,
                include: {
                    purchaseOrder: {
                        select: {
                            orderNumber: true,
                            totalAmount: true,
                            supplier: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    },
                    recordedBy: {
                        select: {
                            name: true,
                            email: true
                        }
                    }
                },
                orderBy: { paymentDate: 'desc' },
                skip,
                take
            }),
            prisma.supplierPayment.count({ where })
        ]);

        // Calculate summary
        const summary = await prisma.supplierPayment.aggregate({
            where,
            _sum: { amount: true },
            _count: true
        });

        res.json({
            success: true,
            payments,
            summary: {
                totalPayments: summary._sum.amount?.toNumber() || 0,
                count: summary._count
            },
            pagination: {
                totalItems: totalCount,
                totalPages: Math.ceil(totalCount / take),
                currentPage: parseInt(page as string),
                limit: take
            }
        });
    } catch (error: any) {
        console.error('Error fetching supplier payments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch supplier payments',
            error: error.message
        });
    }
};

/**
 * Get supplier payment by ID
 */
export const getSupplierPaymentById = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const paymentId = parseInt(req.params.paymentId);

        const payment = await prisma.supplierPayment.findFirst({
            where: {
                id: Number(paymentId),
                organizationId: Number(organizationId)
            },
            include: {
                purchaseOrder: {
                    select: {
                        orderNumber: true,
                        totalAmount: true,
                        supplier: {
                            select: {
                                name: true,
                                email: true,
                                phone: true
                            }
                        }
                    }
                },
                recordedBy: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Supplier payment not found'
            });
        }

        // Get all payments for this purchase order
        const allPayments = await prisma.supplierPayment.aggregate({
            where: {
                purchaseOrderId: payment.purchaseOrderId
            },
            _sum: {
                amount: true
            }
        });

        const totalPaid = allPayments._sum.amount?.toNumber() || 0;

        res.json({
            success: true,
            payment,
            summary: {
                totalPaid,
                remaining: payment.purchaseOrder.totalAmount.toNumber() - totalPaid,
                fullyPaid: totalPaid >= payment.purchaseOrder.totalAmount.toNumber()
            }
        });
    } catch (error: any) {
        console.error('Error fetching supplier payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch supplier payment',
            error: error.message
        });
    }
};

/**
 * Delete a supplier payment
 */
export const deleteSupplierPayment = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const paymentId = parseInt(req.params.paymentId);
        const userId = req.user?.userId!;

        // Verify payment belongs to organization
        const existingPayment = await prisma.supplierPayment.findFirst({
            where: {
                id: Number(paymentId),
                organizationId: Number(organizationId)
            },
            include: {
                purchaseOrder: {
                    select: {
                        orderNumber: true
                    }
                }
            }
        });

        if (!existingPayment) {
            return res.status(404).json({
                success: false,
                message: 'Supplier payment not found'
            });
        }

        // Delete payment
        await prisma.supplierPayment.delete({
            where: { id: Number(paymentId) }
        });

        // Log activity
        await logManualActivity({
            userId: Number(userId),
            organizationId: Number(organizationId),
            module: 'PURCHASE_ORDERS',
            type: ActivityType.OTHER,
            description: `Deleted supplier payment for PO ${existingPayment.purchaseOrder.orderNumber}`,
            entityType: 'SupplierPayment',
            entityId: paymentId.toString(),
            metadata: { deletedPayment: existingPayment }
        });

        res.json({
            success: true,
            message: 'Supplier payment deleted successfully'
        });
    } catch (error: any) {
        console.error('Error deleting supplier payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete supplier payment',
            error: error.message
        });
    }
};
