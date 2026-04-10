import { prisma } from "../lib/prisma"
import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth.middleware"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { Decimal } from "@prisma/client/runtime/library"
import { auditLogger } from "../utils/auditLogger"
import { removeStock, addStock } from "../services/inventory-ledger.service"
import {
  generateInvoiceNumber,
  submitInvoiceToEbm,
  submitRefundToEbm,
  submitVoidToEbm,
  isEbmEnabled,
} from "../services/rra-ebm.service"
import { selectBatchesForSale, updateBatchQuantity } from "../services/batch.service"
import { calculateProfit } from "../services/profit.service"
import { getAverageCost } from "../services/cost-price.service"
import { buildBranchFilter, getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import { success, error as apiError } from "../utils/apiResponse"
import { TaxService } from "../services/tax.service"

export const createSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const { customerId, items, paymentType, cashAmount, debtAmount, insuranceAmount } = req.body
    // @ts-ignore
    const userId = parseInt(req.user?.userId as string)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json(apiError("Sale must have at least one item"))
    }

    // Calculate total and validate stock availability
    let totalAmount = 0
    for (const item of items) {
      totalAmount += item.quantity * item.unitPrice
    }

    // Validate payment amounts
    // Note: MOBILE_MONEY and CREDIT_CARD are treated as cashAmount in the frontend
    const calculatedDebt = totalAmount - (cashAmount || 0) - (insuranceAmount || 0)
    if (Math.abs(calculatedDebt - (debtAmount || 0)) > 0.01) {
      return res.status(400).json(apiError("Payment amounts do not match total. Total must equal cashAmount + insuranceAmount + debtAmount"))
    }

    // Automatically determine paymentType if multiple payment methods are used
    let finalPaymentType = paymentType
    const hasCash = (cashAmount || 0) > 0
    const hasInsurance = (insuranceAmount || 0) > 0
    const hasDebt = (debtAmount || 0) > 0
    const paymentMethodCount = [hasCash, hasInsurance, hasDebt].filter(Boolean).length

    // Handle payment type determination
    // If paymentType is MOBILE_MONEY or CREDIT_CARD and there's cash amount, keep it
    if (paymentType === 'MOBILE_MONEY' || paymentType === 'CREDIT_CARD') {
      // If it's a standalone mobile money or card payment, keep the payment type
      if (hasCash && !hasInsurance && !hasDebt) {
        finalPaymentType = paymentType
      } else if (paymentMethodCount > 1) {
        // Multiple methods, use MIXED
        finalPaymentType = 'MIXED'
      }
    } else if (paymentMethodCount > 1 && paymentType !== 'MIXED') {
      // If multiple payment methods are used, ensure paymentType is MIXED
      finalPaymentType = 'MIXED'
    } else if (hasDebt && !hasCash && !hasInsurance) {
      // Only debt, no other payments
      finalPaymentType = 'DEBT'
    } else if (hasInsurance && !hasCash && !hasDebt) {
      // Only insurance, no other payments
      finalPaymentType = 'INSURANCE'
    } else if (hasCash && !hasInsurance && !hasDebt && !paymentType) {
      // Only cash, no other payments, and no payment type specified
      finalPaymentType = 'CASH'
    }

    // Generate sale number and invoice number
    const saleNumber = `SALE-${Date.now()}`
    const invoiceNumber = await generateInvoiceNumber(organizationId!)

    // Wrap everything in a transaction for atomicity
    const sale = await prisma.$transaction(async (tx) => {
      // 1. Validate stock availability before creating sale (using ledger as source of truth)
      for (const item of items) {
        const product = await tx.product.findFirst({
          where: {
            id: parseInt(item.productId),
            organizationId: organizationId!,
          },
        });

        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        // Calculate current stock from ledger (source of truth)
        // If no ledger entries exist, fall back to database quantity
        // Efficient stock calculation using database aggregation
        const stockAggregates = await tx.inventoryLedger.groupBy({
          by: ['direction'],
          where: {
            productId: parseInt(item.productId),
            organizationId: organizationId!,
            branchId: { equals: branchId as number }, // Explicitly cast branchId
          },
          _sum: {
            quantity: true,
          },
        });

        const inQty = stockAggregates.find(a => a.direction === 'IN')?._sum.quantity || 0;
        const outQty = stockAggregates.find(a => a.direction === 'OUT')?._sum.quantity || 0;
        const currentStock = inQty - outQty;

        if (currentStock < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${product.name}. Available: ${currentStock}, Requested: ${item.quantity}`
          );
        }
      }

      // Calculate tax summary
      const taxSummary = await TaxService.calculateSaleTax(organizationId!, items.map((i: any) => ({
        productId: parseInt(i.productId),
        quantity: i.quantity,
        unitPrice: i.unitPrice
      })));

      // 2. Select batches and calculate costs for each item (FIFO by default, can be configured)
      const inventoryMethod = (req.body.inventoryMethod as 'FIFO' | 'LIFO' | 'AVERAGE') || 'FIFO';
      const saleItemsData = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const productId = parseInt(item.productId);
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;
        const itemTax = taxSummary.items[i];

        let batchId: number | null = null;
        let costPrice = 0;

        try {
          // Try to select batches for this product (pass transaction client)
          const selectedBatches = await selectBatchesForSale({
            productId,
            organizationId: organizationId!,
            quantity,
            method: inventoryMethod,
            branchId: branchId,
          }, tx);

          // Use first batch (or calculate average)
          if (selectedBatches.length > 0) {
            batchId = selectedBatches[0].batchId;
            costPrice = selectedBatches[0].unitCost;

            // Update batch quantities (pass transaction client)
            for (const batch of selectedBatches) {
              await updateBatchQuantity(batch.batchId, batch.quantity, organizationId!, tx);
            }
          } else {
            // No batches - try to get average cost (don't pass tx, use global prisma)
            const avgCost = await getAverageCost(productId, organizationId!, branchId);
            costPrice = avgCost?.averageCost || 0;
          }
        } catch (error: any) {
          // If batch selection fails (e.g., no batches), use average cost or 0
          // Don't pass tx, use global prisma for read operations
          const avgCost = await getAverageCost(productId, organizationId!, branchId);
          costPrice = avgCost?.averageCost || 0;
        }

        // Calculate profit
        const profit = (unitPrice - costPrice) * quantity;

        // Build sale item data - use relation syntax for batch
        const saleItemData: any = {
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
          costPrice,
          profit,
          taxRate: itemTax.taxRate,
          taxAmount: itemTax.taxAmount,
          taxCode: itemTax.taxCode,
          product: { connect: { id: productId } },
        };

        // Only include batch relation if batchId is not null
        if (batchId !== null) {
          saleItemData.batch = { connect: { id: batchId } };
        }

        saleItemsData.push(saleItemData);
      }

      // 3. Create sale with items (including profit)
      const newSale = await tx.sale.create({
        data: {
          saleNumber,
          invoiceNumber,
          customerId: parseInt(customerId),
          userId: userId!,
          organizationId: organizationId!,
          branchId: branchId as any,
          paymentType: finalPaymentType,
          cashAmount: cashAmount || 0,
          insuranceAmount: insuranceAmount || 0,
          debtAmount: debtAmount || 0,
          totalAmount,
          vatAmount: taxSummary.vatAmount,
          taxableAmount: taxSummary.taxableAmount,
          status: 'COMPLETED', // Default to completed (can be changed to PENDING if needed)
          saleItems: {
            create: saleItemsData,
          },
        },
        include: {
          saleItems: { include: { product: true, batch: true } },
          customer: true,
        },
      } as any);

      // 4. Record stock movements in ledger (Stock OUT) - atomic with sale creation
      // Pass transaction client to avoid nested transactions
      for (const item of items) {
        const saleItem = (newSale as any).saleItems?.find((si: any) => si.productId === parseInt(item.productId));
        await removeStock({
          organizationId: organizationId!,
          productId: parseInt(item.productId),
          userId: userId!,
          quantity: item.quantity,
          movementType: 'SALE',
          branchId: branchId as any,
          reference: saleNumber,
          referenceType: 'SALE',
          note: `Sale #${saleNumber}`,
          batchId: saleItem?.batchId || null,
          tx, // Pass transaction client to avoid nested transactions
        });
      }

      // 5. Update customer balance if debt (atomic with sale)
      const remainingDebt = totalAmount - (cashAmount || 0) - (insuranceAmount || 0)
      if (remainingDebt > 0) {
        await tx.customer.update({
          where: { id: parseInt(customerId) },
          data: {
            balance: { increment: remainingDebt },
          },
        });
      }

      return newSale;
    }, {
      maxWait: 30000,   // 30 seconds
      timeout: 60000,   // 60 seconds
    });

    // 5. Submit to EBM/VSDC if enabled (outside transaction, async)
    if (isEbmEnabled()) {
      submitInvoiceToEbm({
        saleId: sale.id,
        organizationId: organizationId!,
      }).catch((error) => {
        console.error("[EBM] Failed to submit invoice (non-blocking):", error);
      });
    }

    // 6. Log activity (outside transaction for performance, but after successful sale)
    await auditLogger.sales(req, {
      type: 'SALE_COMPLETED',
      description: `Sale completed (Invoice #${sale.invoiceNumber || saleNumber})`,
      entityType: 'Sale',
      entityId: sale.id,
      metadata: {
        invoiceNumber: sale.invoiceNumber,
        totalAmount: sale.totalAmount,
        paymentType: sale.paymentType
      }
    });

    res.status(201).json(success(sale))
  } catch (error: any) {
    console.error("[Create Sale Error]:", error)

    // Return appropriate status code based on error type
    if (error.message && error.message.includes('Insufficient stock')) {
      return res.status(400).json(apiError(error.message || "Insufficient stock"))
    }

    if (error.message && error.message.includes('not found')) {
      return res.status(404).json(apiError(error.message || "Resource not found"))
    }

    res.status(500).json(apiError(error.message || "Failed to create sale"))
  }
}

export const getSales = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { startDate, endDate, customerId, limit, search, status, paymentType } = req.query

    const where: any = {
      organizationId,
      ...buildBranchFilter(req)
    }

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string)
      }
      if (endDate) {
        const end = new Date(endDate as string)
        end.setHours(23, 59, 59, 999)
        where.createdAt.lte = end
      }
    }

    if (customerId) {
      where.customerId = parseInt(customerId as string)
    }

    if (status) {
      where.status = status as string
    }

    if (paymentType) {
      where.paymentType = paymentType as string
    }

    if (search) {
      where.OR = [
        { saleNumber: { contains: search as string, mode: "insensitive" } },
        { invoiceNumber: { contains: search as string, mode: "insensitive" } },
        {
          customer: {
            name: { contains: search as string, mode: "insensitive" }
          }
        }
      ]
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            TIN: true,
            customerType: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        saleItems: {
          include: { product: true },
        },
        ebmTransactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: Math.min(Number(limit) || 50, 500),
    }) as any[];

    res.json(success(sales))
  } catch (error) {
    console.error("[Get Sales Error]:", error)
    res.status(500).json(apiError("Failed to get sales"))
  }
}

export const getSaleById = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const sale = await prisma.sale.findFirst({
      where: {
        id,
        organizationId,
        ...buildBranchFilter(req)
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            TIN: true,
            customerType: true,
            email: true,
            address: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        saleItems: {
          include: { product: true },
        },
        ebmTransactions: {
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!sale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    res.json(success(sale))
  } catch (error) {
    console.error("[Get Sale Error]:", error)
    res.status(500).json(apiError("Failed to get sale"))
  }
}

export const payDebt = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { amount } = req.body
    const sale = await prisma.sale.findFirst({
      where: {
        id,
        organizationId,
        ...buildBranchFilter(req)
      },
      include: {
        customer: true,
        saleItems: true
      }
    })
    if (!sale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    if (sale.status === 'REFUNDED' || sale.status === 'CANCELLED') {
      return res.status(400).json(apiError(`Cannot process payment for ${sale.status.toLowerCase()} sale`))
    }

    const remainingDebt = (sale.debtAmount as Decimal).toNumber() - amount
    if (remainingDebt < 0) {
      return res.status(400).json(apiError("Amount exceeds debt"))
    }

    await prisma.sale.update({
      where: { id },
      data: {
        debtAmount: remainingDebt,
        cashAmount: { increment: amount },
      },
    })

    await prisma.customer.update({
      where: { id: sale.customerId },
      data: {
        balance: { decrement: amount },
      },
    })

    await auditLogger.sales(req, {
      type: 'PAYMENT_RECEIVED',
      description: `Payment of ${amount} received for debt on Sale #${sale.saleNumber}`,
      entityType: 'Sale',
      entityId: id,
      metadata: {
        amount,
        previousDebt: sale.debtAmount,
        newDebt: remainingDebt,
      }
    });


    res.json(success({ message: "Debt paid successfully" }))
  } catch (error) {
    console.error("[Pay Debt Error]:", error)
    res.status(500).json(apiError("Failed to pay debt"))
  }
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

const executeWithRetry = async (fn: () => Promise<any>, retries = 0): Promise<any> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error.code === 'P2028' && retries < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retries);
      console.log(`Transaction timed out, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return executeWithRetry(fn, retries + 1);
    }
    throw error;
  }
};

export const refundSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const result = await executeWithRetry(async () => {
      return await prisma.$transaction(async (prisma) => {
        const id = parseInt(req.params.id);
        const organizationId = parseInt(req.params.organizationId);
        const { reason, items: refundItems } = req.body;
        const userId = req.user?.userId;

        // Get the sale with items
        const sale = await prisma.sale.findFirst({
          where: {
            id,
            organizationId,
            ...buildBranchFilter(req)
          } as any,
          include: {
            saleItems: {
              include: {
                product: true,
                batch: true
              }
            },
            customer: true
          } as any
        });

        if (!sale) {
          throw { status: 404, message: "Sale not found" };
        }

        if (sale.status === 'REFUNDED') {
          throw { status: 400, message: "Sale already refunded" };
        }

        if (sale.status === 'CANCELLED') {
          throw { status: 400, message: "Cannot refund a cancelled sale" };
        }

        // Ensure sale has items
        if (!sale.saleItems || sale.saleItems.length === 0) {
          throw { status: 400, message: "Sale has no items to refund" };
        }

        // Strict Rule: Partial refunds are not allowed
        if (refundItems && refundItems.length > 0 && refundItems.length < sale.saleItems.length) {
          throw { status: 400, message: "Partial refunds are not allowed. Only full refunds are permitted." };
        }

        // Get all sale items for full refund
        const itemsToRefund = ((sale as any).saleItems || []).map((item: any) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
          totalPrice: item.totalPrice.toNumber()
        }));

        // Calculate total refund amount
        const totalRefundAmount = itemsToRefund.reduce((sum: number, item: any) => sum + item.totalPrice, 0);

        // Update original sale status
        await prisma.sale.update({
          where: { id },
          data: {
            status: 'REFUNDED',
            refundedAt: new Date(),
            refundedById: parseInt(userId as string),
            refundReason: reason
          }
        });

        // Create a new REFUND sale record with negative amounts
        const refundSaleNumber = `REFUND-${sale.saleNumber}-${Date.now()}`;

        const refundSale = await prisma.sale.create({
          data: {
            saleNumber: refundSaleNumber,
            customerId: sale.customerId,
            userId: parseInt(userId as string),
            organizationId: organizationId!,
            branchId: (sale as any).branchId,
            paymentType: sale.paymentType,
            cashAmount: -totalRefundAmount, // Negative amount
            insuranceAmount: 0,
            debtAmount: 0,
            totalAmount: -totalRefundAmount, // Negative total
            status: 'REFUNDED',
            refundReason: reason,
            originalSaleId: id, // Link to original sale
            saleItems: {
              create: itemsToRefund.map((item: any) => ({
                productId: item.productId,
                quantity: -item.quantity, // Negative quantity
                unitPrice: item.unitPrice,
                totalPrice: -item.totalPrice, // Negative total
              }))
            }
          } as any,
          include: {
            saleItems: { include: { product: true } },
            customer: true
          }
        });

        // Update product quantities (restore inventory) and record movements in ledger (Stock IN)
        for (const item of itemsToRefund) {
          await addStock({
            organizationId: organizationId!,
            productId: item.productId,
            userId: parseInt(userId as string),
            quantity: item.quantity,
            movementType: 'RETURN_CUSTOMER',
            branchId: (sale as any).branchId,
            reference: refundSaleNumber,
            referenceType: 'SALE_REFUND',
            note: `Refund for Sale #${sale.saleNumber} (Full)`,
            tx: prisma, // Pass transaction client to avoid nested transactions
          });
        }

        // Update customer balance
        await prisma.customer.update({
          where: { id: sale.customerId },
          data: {
            balance: { decrement: totalRefundAmount }
          }
        });

        // Log the activity
        await auditLogger.sales(req, {
          type: 'SALE_REFUNDED',
          description: `Full refund issued for Sale #${sale.saleNumber}${reason ? `: ${reason}` : ''}`,
          entityType: 'Sale',
          entityId: id,
          metadata: {
            refundSaleId: refundSale.id,
            refundAmount: totalRefundAmount,
            reason,
          }
        });

        return {
          success: true,
          message: 'Refund transaction created successfully',
          refundAmount: totalRefundAmount,
          refundSale: refundSale,
          refundedItems: itemsToRefund
        };
      }, {
        maxWait: 30000,   // 30 seconds
        timeout: 60000,   // 60 seconds
      });
    });

    if (isEbmEnabled() && result.refundSale?.id && result.success) {
      submitRefundToEbm({
        organizationId: parseInt(req.params.organizationId),
        originalSaleId: parseInt(req.params.id),
        refundSaleId: result.refundSale.id,
        reason: req.body?.reason,
      }).catch((err) => console.error("[EBM] Refund submit failed (non-blocking):", err));
    }

    res.status(200).json(success(result));
  } catch (error: any) {
    console.error("[Refund Error]:", error);
    const status = error.status || 500;
    const message = error.message || "Failed to process refund";
    res.status(status).json(apiError(message, error.code));
  }
};


export const cancelSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId);
    const organizationId = parseInt(req.params.organizationId);
    const { reason } = req.body;
    const userId = req.user?.userId;

    // Get the sale with items
    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        organizationId,
        ...buildBranchFilter(req)
      },
      include: {
        saleItems: {
          include: {
            product: true
          }
        },
        customer: true,
        user: true
      }
    });

    if (!sale) {
      return res.status(404).json(apiError("Sale not found"));
    }

    if (sale.status === 'CANCELLED') {
      return res.status(400).json(apiError("Sale already cancelled"));
    }

    if (sale.status === 'REFUNDED' || sale.status === 'PARTIALLY_REFUNDED') {
      return res.status(400).json(apiError(`Cannot cancel a ${sale.status.toLowerCase()} sale`));
    }

    // Start a transaction
    await prisma.$transaction(async (prisma) => {
      // Update sale status
      await prisma.sale.update({
        where: { id: saleId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: parseInt(userId as string),
          cancellationReason: reason
        }
      });

      // Return items to inventory and record movements in ledger (Stock IN)
      for (const item of sale.saleItems) {
        await addStock({
          organizationId: organizationId!,
          productId: item.productId,
          userId: parseInt(userId as string),
          quantity: item.quantity,
          movementType: 'RETURN_CUSTOMER',
          branchId: (sale as any).branchId,
          reference: sale.saleNumber,
          referenceType: 'SALE_CANCELLATION',
          note: `Sale cancellation: ${sale.saleNumber}`,
          tx: prisma, // Pass transaction client to avoid nested transactions
        });
      }

      // Revert customer balance for debt portion only
      // During sale creation, we added the debt amount to customer balance
      // During cancellation, we need to subtract it
      const debtAmount = (sale as any).debtAmount?.toNumber?.() || 0;
      if (debtAmount > 0) {
        await prisma.customer.update({
          where: { id: sale.customerId },
          data: {
            balance: { decrement: debtAmount }
          }
        });
      }

      // Log the activity
      await auditLogger.sales(req, {
        type: 'SALE_CANCELLED',
        description: `Sale #${sale.saleNumber} cancelled${reason ? `: ${reason}` : ''}`,
        entityType: 'Sale',
        entityId: saleId,
        metadata: { cancellationReason: reason }
      });
    });

    if (isEbmEnabled()) {
      submitVoidToEbm({
        organizationId,
        saleId,
        reason,
      }).catch((err) => console.error("[EBM] Void submit failed (non-blocking):", err));
    }

    res.status(200).json(success({ message: "Sale cancelled successfully" }));
  } catch (error) {
    console.error("[Cancel Sale Error]:", error);
    res.status(500).json(apiError("Failed to cancel sale"));
  }
};
