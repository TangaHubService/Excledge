import { prisma } from "../lib/prisma"
import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth.middleware"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { Decimal } from "@prisma/client/runtime/library"
import { auditLogger } from "../utils/auditLogger"
import { removeStock, addStock } from "../services/inventory-ledger.service"
import {
  assertVsdcBranchMasterData,
  assertVsdcProductMasterData,
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

const loadSaleWithContext = async (
  req: BranchAuthRequest,
  id: number,
  organizationId: number
) => {
  return prisma.sale.findFirst({
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
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
          bhfId: true,
          address: true,
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
}

export const createSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const {
      customerId,
      items,
      paymentType,
      cashAmount,
      debtAmount,
      insuranceAmount,
      purchaseOrderCode,
    } = req.body
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
    const ebmEnabled = isEbmEnabled()
    const initialSaleStatus = ebmEnabled ? 'PENDING' : 'COMPLETED'

    // Wrap everything in a transaction for atomicity
    const sale = await prisma.$transaction(async (tx) => {
      if (ebmEnabled) {
        const branch = branchId
          ? await tx.branch.findFirst({
            where: {
              id: branchId,
              organizationId: organizationId!,
            },
            select: {
              id: true,
              name: true,
              code: true,
              bhfId: true,
            },
          })
          : null;

        assertVsdcBranchMasterData(branch);
      }

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

        if (ebmEnabled) {
          assertVsdcProductMasterData({
            id: product.id,
            name: product.name,
            itemCode: product.itemCode,
            itemClassCode: product.itemClassCode,
            packageUnitCode: product.packageUnitCode,
            quantityUnitCode: product.quantityUnitCode,
          });
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
          purchaseOrderCode:
            typeof purchaseOrderCode === "string" && purchaseOrderCode.trim().length > 0
              ? purchaseOrderCode.trim()
              : null,
          cashAmount: cashAmount || 0,
          insuranceAmount: insuranceAmount || 0,
          debtAmount: debtAmount || 0,
          totalAmount,
          vatAmount: taxSummary.vatAmount,
          taxableAmount: taxSummary.taxableAmount,
          status: initialSaleStatus,
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

    if (ebmEnabled) {
      try {
        await auditLogger.sales(req, {
          type: 'SALE_CREATE',
          description: `Sale created and awaiting fiscalization (Invoice #${sale.invoiceNumber || saleNumber})`,
          entityType: 'Sale',
          entityId: sale.id,
          metadata: {
            invoiceNumber: sale.invoiceNumber,
            totalAmount: sale.totalAmount,
            paymentType: sale.paymentType,
            status: 'PENDING'
          }
        });
      } catch (auditError) {
        console.error("[Sale Create Audit Error]:", auditError)
      }

      const ebmResult = await submitInvoiceToEbm({
        saleId: sale.id,
        organizationId: organizationId!,
      });

      const responseSale = await loadSaleWithContext(req, sale.id, organizationId) ?? sale

      if (!ebmResult.success) {
        return res.status(201).json(success(
          responseSale,
          ebmResult.error
            ? `Sale created, but fiscal submission failed. Sale remains pending: ${ebmResult.error}`
            : "Sale created, but fiscal submission is still pending."
        ))
      }

      await auditLogger.sales(req, {
        type: 'SALE_COMPLETED',
        description: `Sale completed and fiscalized (Invoice #${sale.invoiceNumber || saleNumber})`,
        entityType: 'Sale',
        entityId: sale.id,
        metadata: {
          invoiceNumber: sale.invoiceNumber,
          totalAmount: sale.totalAmount,
          paymentType: sale.paymentType,
          ebmInvoiceNumber: ebmResult.ebmInvoiceNumber ?? null
        }
      });

      return res.status(201).json(success(
        responseSale,
        "Sale completed and fiscalized successfully"
      ))
    }

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

    const responseSale = await loadSaleWithContext(req, sale.id, organizationId) ?? sale
    res.status(201).json(success(responseSale, "Sale completed successfully"))
  } catch (error: any) {
    console.error("[Create Sale Error]:", error)

    // Return appropriate status code based on error type
    if (error.message && error.message.includes('Insufficient stock')) {
      return res.status(400).json(apiError(error.message || "Insufficient stock"))
    }

    if (error.message && error.message.includes('VSDC master data:')) {
      return res.status(400).json(apiError(error.message || "Missing VSDC master data"))
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
            customerType: true,
            email: true,
            address: true,
          }
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            bhfId: true,
            address: true,
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

    const sale = await loadSaleWithContext(req, id, organizationId)

    if (!sale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    res.json(success(sale))
  } catch (error) {
    console.error("[Get Sale Error]:", error)
    res.status(500).json(apiError("Failed to get sale"))
  }
}

export const recordSaleReprint = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const existingSale = await prisma.sale.findFirst({
      where: {
        id,
        organizationId,
        ...buildBranchFilter(req)
      },
      select: {
        id: true,
        saleNumber: true,
        reprintCount: true,
      }
    })

    if (!existingSale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    await prisma.sale.update({
      where: { id },
      data: {
        reprintCount: { increment: 1 },
      },
    })

    const updatedSale = await loadSaleWithContext(req, id, organizationId)

    if (!updatedSale) {
      return res.status(404).json(apiError("Sale not found"))
    }

    try {
      await auditLogger.sales(req, {
        type: 'SALE_UPDATE',
        description: `Receipt copy generated for Sale #${updatedSale.saleNumber}`,
        entityType: 'Sale',
        entityId: updatedSale.id,
        metadata: {
          previousReprintCount: existingSale.reprintCount,
          reprintCount: updatedSale.reprintCount,
        }
      })
    } catch (auditError) {
      console.error("[Sale Reprint Audit Error]:", auditError)
    }

    res.json(success(updatedSale, "Sale receipt copy recorded"))
  } catch (error) {
    console.error("[Sale Reprint Error]:", error)
    res.status(500).json(apiError("Failed to record sale receipt copy"))
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

    if (sale.status === 'PENDING') {
      return res.status(409).json(apiError("Cannot process payment for a pending sale until fiscalization completes"))
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
  let refundEbmSubmission: Awaited<ReturnType<typeof submitRefundToEbm>> | null = null;
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const { reason, reasonCode, items: refundItems } = req.body;
    const userId = req.user?.userId;
    const ebmEnabled = isEbmEnabled();

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
      return res.status(404).json(apiError("Sale not found"));
    }

    if (sale.status === 'REFUNDED') {
      return res.status(400).json(apiError("Sale already refunded"));
    }

    if (sale.status === 'CANCELLED') {
      return res.status(400).json(apiError("Cannot refund a cancelled sale"));
    }

    if (sale.status === 'PENDING') {
      return res.status(409).json(apiError("Cannot refund a pending sale. Cancel it instead."));
    }

    if (!sale.saleItems || sale.saleItems.length === 0) {
      return res.status(400).json(apiError("Sale has no items to refund"));
    }

    if (refundItems && refundItems.length > 0 && refundItems.length < sale.saleItems.length) {
      return res.status(400).json(apiError("Partial refunds are not allowed. Only full refunds are permitted."));
    }

    const itemsToRefund = ((sale as any).saleItems || []).map((item: any) => ({
      saleItemId: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toNumber(),
      totalPrice: item.totalPrice.toNumber(),
      taxRate: item.taxRate?.toNumber?.() || 0,
      taxAmount: item.taxAmount?.toNumber?.() || 0,
      taxCode: item.taxCode ?? null,
      costPrice: item.costPrice?.toNumber?.() || 0,
      profit: item.profit?.toNumber?.() || 0,
    }));

    const totalRefundAmount = itemsToRefund.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
    const refundProcessedAt = new Date();
    const refundSaleNumber = `REFUND-${sale.saleNumber}-${refundProcessedAt.getTime()}`;
    const refundInvoiceNumber = ebmEnabled ? await generateInvoiceNumber(organizationId!) : null;

    if (ebmEnabled && refundInvoiceNumber) {
      refundEbmSubmission = await submitRefundToEbm({
        organizationId,
        originalSaleId: id,
        refundInvoiceNumber,
        refundedAt: refundProcessedAt,
        reason,
        reasonCode,
      });

      if (!refundEbmSubmission.success) {
        const status =
          refundEbmSubmission.code === 'NOT_FISCALIZED'
            ? 409
            : refundEbmSubmission.code === 'VALIDATION'
              ? 400
              : 502;
        return res.status(status).json(apiError(refundEbmSubmission.error || "Failed to fiscalize refund"));
      }
    }

    const result = await executeWithRetry(async () => {
      return await prisma.$transaction(async (prisma) => {
        await prisma.sale.update({
          where: { id },
          data: {
            status: 'REFUNDED',
            refundedAt: refundProcessedAt,
            refundedById: parseInt(userId as string),
            refundReason: reason
          }
        });

        const refundRecord = await prisma.sale.create({
          data: {
            saleNumber: refundSaleNumber,
            customerId: sale.customerId,
            userId: parseInt(userId as string),
            organizationId: organizationId!,
            branchId: (sale as any).branchId,
            paymentType: sale.paymentType,
            cashAmount: -totalRefundAmount,
            insuranceAmount: 0,
            debtAmount: 0,
            totalAmount: -totalRefundAmount,
            vatAmount: -((sale as any).vatAmount?.toNumber?.() || 0),
            taxableAmount: -((sale as any).taxableAmount?.toNumber?.() || 0),
            status: 'REFUNDED',
            refundReason: reason,
            refundedAt: refundProcessedAt,
            refundedById: parseInt(userId as string),
            originalSaleId: id,
            invoiceNumber: refundInvoiceNumber,
            createdAt: refundProcessedAt,
            saleItems: {
              create: itemsToRefund.map((item: any) => ({
                productId: item.productId,
                quantity: -item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: -item.totalPrice,
                taxRate: item.taxRate,
                taxAmount: -item.taxAmount,
                taxCode: item.taxCode,
                costPrice: item.costPrice,
                profit: -item.profit,
              }))
            }
          } as any,
          include: {
            saleItems: { include: { product: true } },
            customer: true
          }
        });

        if (refundEbmSubmission?.transactionId) {
          await prisma.ebmTransaction.update({
            where: { id: refundEbmSubmission.transactionId },
            data: { saleId: refundRecord.id }
          });
        }

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
            tx: prisma,
          });
        }

        await prisma.customer.update({
          where: { id: sale.customerId },
          data: {
            balance: { decrement: totalRefundAmount }
          }
        });

        return {
          success: true,
          message: ebmEnabled ? 'Refund completed and fiscalized successfully' : 'Refund transaction created successfully',
          refundAmount: totalRefundAmount,
          refundSale: refundRecord,
          refundedItems: itemsToRefund
        };
      }, {
        maxWait: 30000,
        timeout: 60000,
      });
    });

    try {
      await auditLogger.sales(req, {
        type: 'SALE_REFUNDED',
        description: `Full refund issued for Sale #${sale.saleNumber}${reason ? `: ${reason}` : ''}`,
        entityType: 'Sale',
        entityId: id,
        metadata: {
          refundSaleId: result.refundSale.id,
          refundAmount: totalRefundAmount,
          reason,
          reasonCode: reasonCode ?? null,
        }
      });
    } catch (auditError) {
      console.error("[Refund Audit Error]:", auditError);
    }

    res.status(200).json(success(result, result.message));
  } catch (error: any) {
    if (refundEbmSubmission?.transactionId) {
      await prisma.ebmTransaction.update({
        where: { id: refundEbmSubmission.transactionId },
        data: {
          errorMessage: `Local refund finalization failed after gateway success: ${error.message || 'Unknown error'}`,
        },
      }).catch((ebmUpdateError) => {
        console.error("[Refund Reconciliation Error]:", ebmUpdateError);
      });
    }
    console.error("[Refund Error]:", error);
    const status = error.status || 500;
    const message = error.message || "Failed to process refund";
    res.status(status).json(apiError(message, error.code));
  }
};


export const cancelSale = async (req: BranchAuthRequest, res: Response) => {
  let voidEbmSubmission: Awaited<ReturnType<typeof submitVoidToEbm>> | null = null;
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

    const ebmEnabled = isEbmEnabled();
    const shouldFiscalCancel = ebmEnabled && sale.status !== 'PENDING';
    const cancelledAt = new Date();

    if (shouldFiscalCancel) {
      const cancelInvoiceNumber = await generateInvoiceNumber(organizationId!);
      voidEbmSubmission = await submitVoidToEbm({
        organizationId,
        saleId,
        cancelInvoiceNumber,
        cancelledAt,
        reason,
      });

      if (!voidEbmSubmission.success) {
        const status =
          voidEbmSubmission.code === 'NOT_FISCALIZED'
            ? 409
            : voidEbmSubmission.code === 'VALIDATION'
              ? 400
              : 502;
        return res.status(status).json(apiError(voidEbmSubmission.error || "Failed to fiscalize cancellation"));
      }
    }

    await prisma.$transaction(async (prisma) => {
      await prisma.sale.update({
        where: { id: saleId },
        data: {
          status: 'CANCELLED',
          cancelledAt,
          cancelledById: parseInt(userId as string),
          cancellationReason: reason
        }
      });

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
          tx: prisma,
        });
      }

      const debtAmount = (sale as any).debtAmount?.toNumber?.() || 0;
      if (debtAmount > 0) {
        await prisma.customer.update({
          where: { id: sale.customerId },
          data: {
            balance: { decrement: debtAmount }
          }
        });
      }
    });

    try {
      await auditLogger.sales(req, {
        type: 'SALE_CANCELLED',
        description: `Sale #${sale.saleNumber} cancelled${reason ? `: ${reason}` : ''}`,
        entityType: 'Sale',
        entityId: saleId,
        metadata: { cancellationReason: reason }
      });
    } catch (auditError) {
      console.error("[Cancel Sale Audit Error]:", auditError);
    }

    const message = shouldFiscalCancel
      ? "Sale cancelled and fiscalized successfully"
      : "Sale cancelled successfully";

    res.status(200).json(success({ message }, message));
  } catch (error) {
    if (voidEbmSubmission?.transactionId) {
      await prisma.ebmTransaction.update({
        where: { id: voidEbmSubmission.transactionId },
        data: {
          errorMessage: `Local cancellation finalization failed after gateway success: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      }).catch((ebmUpdateError) => {
        console.error("[Cancel Reconciliation Error]:", ebmUpdateError);
      });
    }
    console.error("[Cancel Sale Error]:", error);
    res.status(500).json(apiError("Failed to cancel sale"));
  }
};
