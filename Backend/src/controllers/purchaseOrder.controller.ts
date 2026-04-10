import type { Response } from "express"
import { prisma } from "../lib/prisma"
import { emailService } from "../services/email.service"
import { auditLogger } from "../utils/auditLogger"
import { addStock } from "../services/inventory-ledger.service"
import NotificationService from "../services/notification.service"
import type { AuthRequest } from "../middleware/auth.middleware"

const notificationService = new NotificationService(prisma)

// Get all purchase orders for an organization
export const getPurchaseOrders = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId)

        const orders = await prisma.purchaseOrder.findMany({
            where: { organizationId, isActive: true },
            include: {
                supplier: true,
                user: { select: { name: true, email: true } },
                items: true,
            },
            orderBy: { createdAt: "desc" },
        })

        res.json(orders)
    } catch (error) {
        console.error("Error fetching purchase orders:", error)
        res.status(500).json({ message: "Failed to fetch purchase orders" })
    }
}

// Get single purchase order
export const getPurchaseOrder = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId)
        const id = parseInt(req.params.id)

        const order = await prisma.purchaseOrder.findFirst({
            where: { id, organizationId },
            include: {
                supplier: true,
                user: { select: { name: true, email: true } },
                items: true,
            },
        })

        if (!order) {
            return res.status(404).json({ message: "Purchase order not found" })
        }

        res.json(order)
    } catch (error) {
        console.error("Error fetching purchase order:", error)
        res.status(500).json({ message: "Failed to fetch purchase order" })
    }
}

// Create purchase order
export const createPurchaseOrder = async (req: AuthRequest, res: Response) => {
    try {
        const organizationId = parseInt(req.params.organizationId)
        const userId = (req as any).user.userId
        const { supplierId, items, notes, expectedDate } = req.body

        // Calculate total amount
        const totalAmount = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0)

        // Generate order number
        const orderCount = await prisma.purchaseOrder.count({
            where: { organizationId },
        })
        const orderNumber = `PO-${Date.now()}-${orderCount + 1}`

        const order = await prisma.purchaseOrder.create({
            data: {
                orderNumber,
                supplierId,
                organizationId,
                userId,
                totalAmount,
                notes,
                expectedDate: expectedDate ? new Date(expectedDate) : null,
                items: {
                    create: items.map((item: any) => ({
                        productId: item.productId, // Now included
                        productName: item.productName,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.quantity * item.unitPrice,
                    })),
                },
            },
            include: {
                supplier: true,
                items: true,
                organization: true,
            },
        })

        try {
            await emailService.sendPurchaseOrderToSupplier(
                order.supplier.email,
                order.supplier.name,
                order.organization.name,
                order.orderNumber,
                order.items,
                Number(order.totalAmount),
                order.notes || undefined,
                order.expectedDate || undefined,
            )
        } catch (emailError) {
            console.error("Failed to send email to supplier:", emailError)
        }

        await auditLogger.purchaseOrders(req, {
            type: 'PURCHASE_ORDER_CREATE',
            description: `Purchase Order ${order.orderNumber} created for supplier ${order.supplier.name}`,
            entityType: 'PurchaseOrder',
            entityId: order.id,
            metadata: {
                orderNumber: order.orderNumber,
                totalAmount: order.totalAmount,
                supplierId: order.supplierId,
            }
        })

        res.status(201).json(order)
    } catch (error) {
        console.error("Error creating purchase order:", error)
        res.status(500).json({ message: "Failed to create purchase order" })
    }
}

// Update purchase order status
export const updatePurchaseOrderStatus = async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { status, branchId, receivedItems } = req.body

    // Define valid status values
    const validStatuses = [
        'PENDING',
        'APPROVED',
        'REJECTED',
        'PROCESSING',
        'COMPLETED',
        'CANCELLED'
    ]

    // Validate status
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            message: 'Invalid status',
            validStatuses
        })
    }

    try {
        // Check if purchase order exists
        const order = await prisma.purchaseOrder.findFirst({
            where: { id, organizationId },
            include: {
                supplier: true,
                user: true,
                organization: true,
            },
        })

        if (!order) {
            return res.status(404).json({ message: "Purchase order not found" })
        }

        const userId = (req as any).user.userId;
        const effectiveBranchId = branchId ? parseInt(String(branchId)) : null;

        if (status === 'COMPLETED' && !effectiveBranchId) {
            return res.status(400).json({ message: "branchId is required to complete a purchase order" })
        }

        const updatedOrder = await prisma.$transaction(async (tx) => {
            const po = await tx.purchaseOrder.update({
                where: { id: order.id },
                data: {
                    status,
                    receivedAt: status === "COMPLETED" ? new Date() : order.receivedAt,
                },
                include: {
                    supplier: true,
                    items: true,
                },
            })

            // Add items to stock if completed - now branch + batch aware
            if (status === 'COMPLETED' && effectiveBranchId) {
                const branch = await tx.branch.findFirst({
                    where: { id: effectiveBranchId, organizationId: order.organizationId, status: "ACTIVE" }
                })
                if (!branch) {
                    throw new Error("Invalid or inactive branch for receiving")
                }

                for (const item of po.items) {
                    if (!item.productId) continue

                    const receivedMeta = Array.isArray(receivedItems)
                        ? receivedItems.find((ri: any) => parseInt(String(ri.productId)) === item.productId)
                        : null

                    const recvQty = receivedMeta?.quantity ? parseInt(String(receivedMeta.quantity)) : item.quantity
                    const recvUnitCost = receivedMeta?.unitCost ? Number(receivedMeta.unitCost) : Number(item.unitPrice)
                    const recvBatchNumber = receivedMeta?.batchNumber || `PO-${po.id}-P${item.productId}-${Date.now()}`
                    const recvExpiryDate = receivedMeta?.expiryDate ? new Date(receivedMeta.expiryDate) : null

                    await tx.batch.upsert({
                        where: {
                            productId_batchNumber_branchId: {
                                productId: item.productId,
                                batchNumber: recvBatchNumber,
                                branchId: effectiveBranchId,
                            }
                        },
                        update: {
                            quantity: { increment: recvQty },
                            unitCost: recvUnitCost,
                            expiryDate: recvExpiryDate,
                            isActive: true,
                        },
                        create: {
                            productId: item.productId,
                            organizationId: order.organizationId,
                            branchId: effectiveBranchId,
                            batchNumber: recvBatchNumber,
                            quantity: recvQty,
                            unitCost: recvUnitCost,
                            expiryDate: recvExpiryDate,
                            isActive: true,
                        }
                    })

                    await addStock({
                        organizationId: order.organizationId,
                        productId: item.productId,
                        userId,
                        quantity: recvQty,
                        movementType: 'PURCHASE',
                        branchId: effectiveBranchId,
                        unitCost: recvUnitCost,
                        batchNumber: recvBatchNumber,
                        expiryDate: recvExpiryDate || undefined,
                        reference: order.orderNumber,
                        referenceType: 'PURCHASE_ORDER',
                        note: `Purchase Order #${order.orderNumber} received at branch ${effectiveBranchId}`,
                        tx,
                    });
                }
            }

            return po
        })

        try {
            await emailService.sendPurchaseOrderStatusUpdate(
                order.user.email,
                order.organization.name,
                order.orderNumber,
                status,
                order.supplier.name,
            )
        } catch (emailError) {
            console.error("Failed to send status update email:", emailError)
        }

        // Map status to specific ActivityType if possible
        let activityType: any = 'PURCHASE_ORDER_UPDATE';
        if (status === 'APPROVED') activityType = 'PURCHASE_ORDER_APPROVED';
        if (status === 'REJECTED') activityType = 'PURCHASE_ORDER_REJECTED';
        if (status === 'COMPLETED') activityType = 'PURCHASE_ORDER_COMPLETED';
        if (status === 'CANCELLED') activityType = 'PURCHASE_ORDER_CANCELLED';

        await auditLogger.purchaseOrders(req, {
            type: activityType,
            description: `Purchase Order ${order.orderNumber} status updated to ${status}`,
            entityType: 'PurchaseOrder',
            entityId: order.id,
            metadata: {
                status,
                orderNumber: order.orderNumber,
            }
        })
        // Create in-app notification for status change
        await notificationService.createNotification({
            organizationId: order.organizationId,
            title: 'Purchase Order Status Updated',
            message: `Purchase Order ${order.orderNumber} is now ${status}`,
            type: 'PURCHASE_ORDER',
            data: { orderId: order.id, status },
            recipientId: order.userId,
        });

        res.json(updatedOrder)
    } catch (error) {
        console.error("Error updating purchase order:", error)
        res.status(500).json({ message: "Failed to update purchase order" })
    }
}

// Delete purchase order
export const deletePurchaseOrder = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params
        const organizationId = parseInt(req.params.organizationId)

        const order = await prisma.purchaseOrder.findFirst({
            where: { id: parseInt(id), organizationId },
        })

        if (!order) {
            return res.status(404).json({ message: "Purchase order not found" })
        }

        await prisma.purchaseOrder.update({
            where: { id: order.id },
            data: { isActive: false }
        })

        await auditLogger.purchaseOrders(req, {
            type: 'PURCHASE_ORDER_ARCHIVED',
            description: `Purchase Order ${order.orderNumber} archived successfully`,
            entityType: 'PurchaseOrder',
            entityId: id,
            metadata: {
                orderNumber: order.orderNumber,
            }
        })
        res.json({ message: "Purchase order deleted successfully" })
    } catch (error) {
        console.error("Error deleting purchase order:", error)
        res.status(500).json({ message: "Failed to delete purchase order" })
    }
}
