import { prisma } from "../lib/prisma"
import type { Response } from "express"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { Decimal } from "@prisma/client/runtime/library"
import { EbmOperation } from "@prisma/client"
import { auditLogger } from "../utils/auditLogger"
import { removeStock, addStock } from "../services/inventory-ledger.service"
import {
  generateInvoiceNumber,
  submitInvoiceToEbm,
  consumeOrgPurchaseCode,
  isEbmEnabled,
} from "../services/rra-ebm.service"
import { processEbmOutboxBatch } from "../services/ebm-outbox.service"
import { selectBatchesForSale, updateBatchQuantity } from "../services/batch.service"
import { calculateProfit } from "../services/profit.service"
import { getAverageCost } from "../services/cost-price.service"
import { buildBranchFilter, getBranchIdForOperation, resolveBranchIdForWrite } from "../middleware/branchAuth.middleware"
import { success, error as apiError } from "../utils/apiResponse"
import { TaxService } from "../services/tax.service"
import { getOrganizationSettings } from "../services/organization-settings.service"
import { renderSalesInvoiceHtml, type RenderInvoicePayload } from "../services/invoice-render.service"
import QRCode from "qrcode"

export const createSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const { customerId, items, paymentType, cashAmount, debtAmount, insuranceAmount, isProforma, payments: splitPayments, shiftId } = req.body
    // @ts-ignore
    const userId = parseInt(req.user?.userId as string)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = await resolveBranchIdForWrite(req)
    const orgSettings = await getOrganizationSettings(organizationId)

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json(apiError("Sale must have at least one item"))
    }

    // If the mobile POS sent a shiftId, it must be this user's own open shift —
    // prevents attributing a sale to someone else's till or a already-closed shift.
    let resolvedShiftId: number | undefined
    if (shiftId !== undefined && shiftId !== null && shiftId !== '') {
      const shift = await prisma.shift.findFirst({
        where: { id: parseInt(shiftId), organizationId, userId, status: { in: ['OPEN', 'REOPENED'] } },
        select: { id: true },
      })
      if (!shift) {
        return res.status(400).json(apiError("Shift is not open or does not belong to you"))
      }
      resolvedShiftId = shift.id
    } else {
      // Business rule: every transaction belongs to a shift. When the caller
      // does not supply one, attach this user's currently active shift (if any).
      const active = await prisma.shift.findFirst({
        where: { organizationId, userId, status: { in: ['OPEN', 'REOPENED'] } },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      })
      resolvedShiftId = active?.id
    }

    // ── B2B purchase-code pre-check ──
    // RRA rejects (resultCd 910) any business-TIN (non-7-prefix) sale
    // submitted without a valid 6-character prcOrdCd — confirmed against the
    // sandbox. Catching this before the sale commits avoids completing a
    // checkout (payment taken, stock deducted) that can never be fiscalized.
    if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
      const customer = await prisma.customer.findUnique({
        where: { id: parseInt(customerId) },
        select: { TIN: true, prcOrdCd: true },
      })
      const custTin = customer?.TIN?.trim() ?? ''
      if (custTin && !custTin.startsWith('7')) {
        const poolCount = await prisma.organizationPurchaseCode.count({
          where: { organizationId, buyerTin: custTin, consumed: false },
        })
        const fallbackCode = customer?.prcOrdCd?.trim()
        const hasValidFallback = !!fallbackCode && fallbackCode.length === 6
        if (poolCount === 0 && !hasValidFallback) {
          return res.status(400).json(apiError(
            `This customer has a business TIN (${custTin}) but no RRA purchase order code on file. Add a 6-character purchase code for this customer before completing the sale.`
          ))
        }
      }
    }

    // Separate product items from service items
    const productItems = items.filter((i: any) => i.itemType !== 'SERVICE')
    const serviceItems = items.filter((i: any) => i.itemType === 'SERVICE')

    // ── Server-side mathematical gatekeeper (Module 2.2) ──
    // Re-compute totals server-side; reject if client delta > 0.01 RWF
    const clientTotal = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unitPrice), 0)

    // Pre-validate payment amounts using client total (rough check; precise check uses Decimal inside txn)
    const calculatedDebt = clientTotal - (cashAmount || 0) - (insuranceAmount || 0)
    if (Math.abs(calculatedDebt - (debtAmount || 0)) > 0.01) {
      return res.status(400).json(apiError("Payment amounts do not match total. Total must equal cashAmount + insuranceAmount + debtAmount"))
    }

    // Fetch all products once up-front for tax calculation
    const productIds = productItems
      .map((i: any) => parseInt(i.productId))
      .filter((id: number) => !isNaN(id))

    const products = productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds }, organizationId },
          select: { id: true, unitPrice: true, taxCategory: true, taxCode: true, name: true },
        })
      : []

    const productMap = new Map(products.map(p => [p.id, p]))

    // When the org disallows manual discounts, sellers may not submit a unit
    // price below the catalog price — the POS UI already locks the price
    // field in that case, but the API must not trust the client either.
    if (!orgSettings.featureFlags.allowManualDiscounts) {
      for (const item of productItems) {
        const product = productMap.get(parseInt(item.productId))
        if (!product) continue
        const catalogPrice = Number(product.unitPrice)
        if (Number(item.unitPrice) < catalogPrice - 0.01) {
          return res.status(400).json(apiError(
            `Manual price overrides are disabled for this organization. "${product.name}" must be sold at ${catalogPrice}.`
          ))
        }
      }
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

    // Sale number now; invoice number is allocated inside the transaction below so
    // that a rollback (e.g. insufficient stock, tax mismatch) also rolls back the
    // sequence increment — otherwise a failed sale permanently burns an RRA invoice
    // number, leaving a gap in the mandated gapless sequence.
    const saleNumber = `SALE-${Date.now()}`

    // C6: determine receipt type label (NS/TS/PS)
    const org = await prisma.organization.findUnique({
      where: { id: organizationId! },
      select: { trainingMode: true, vatRegistered: true },
    });
    const rcptLabel = isProforma ? 'PS' : (org?.trainingMode ? 'TS' : 'NS');

    // ── Atomic transaction ──
    const sale = await prisma.$transaction(async (tx) => {
      // 1. Validate stock availability for PRODUCT items only
      for (const item of productItems) {
        const product = productMap.get(parseInt(item.productId))

        if (!product) {
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        const stockAggregates = await tx.inventoryLedger.groupBy({
          by: ['direction'],
          where: {
            productId: parseInt(item.productId),
            organizationId: organizationId!,
            branchId: { equals: branchId as number },
          },
          _sum: { quantity: true },
        });

        const inQty = stockAggregates.find(a => a.direction === 'IN')?._sum.quantity || 0;
        const outQty = stockAggregates.find(a => a.direction === 'OUT')?._sum.quantity || 0;
        const currentStock = inQty - outQty;

        if (currentStock < item.quantity && !orgSettings.featureFlags.allowNegativeStock) {
          throw new Error(
            `Insufficient stock for product ${product.name}. Available: ${currentStock}, Requested: ${item.quantity}`
          );
        }
      }

      // 2. Server-side tax computation with Decimal arithmetic.
      // The business's VAT-registration status decides whether the products'
      // A/B/C categories apply, or whether every line is forced to tax code D.
      const allItemsForTax = items.map((i: any) => ({
        productId: i.productId ? parseInt(i.productId) : undefined,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        itemType: i.itemType || 'PRODUCT',
      }));
      const taxSummary = await TaxService.calculateSaleTax(organizationId!, allItemsForTax, org?.vatRegistered ?? false);

      // ── MODULE 2.2: Reconcile server-computed total vs client total ──
      const computedTotal = taxSummary.items.reduce(
        (sum, ti) => sum + Number(ti.taxableAmount) + Number(ti.taxAmount),
        0,
      )
      if (Math.abs(computedTotal - clientTotal) > 0.01) {
        throw new Error(
          `Total amount mismatch: server computed ${computedTotal.toFixed(2)}, client submitted ${clientTotal.toFixed(2)}`
        )
      }

      // 3. Select batches and calculate costs for PRODUCT items only
      const inventoryMethod = (req.body.inventoryMethod as 'FIFO' | 'LIFO' | 'AVERAGE') || 'FIFO';
      const saleItemsData: any[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isService = item.itemType === 'SERVICE';
        const quantity = item.quantity;
        const unitPrice = item.unitPrice;
        const itemTax = taxSummary.items[i];

        if (isService) {
          saleItemsData.push({
            quantity,
            unitPrice,
            totalPrice: quantity * unitPrice,
            costPrice: 0,
            profit: quantity * unitPrice,
            taxRate: itemTax?.taxRate || 0,
            taxAmount: itemTax?.taxAmount || 0,
            taxCode: itemTax?.taxCode || null,
            itemType: 'SERVICE',
            serviceName: item.serviceName || null,
            serviceDescription: item.serviceDescription || null,
            measurementUnit: item.measurementUnit || 'PCS',
            exemptionReference: item.exemptionReference || null,
          });
          continue;
        }

        const productId = parseInt(item.productId);
        let batchId: number | null = null;
        let costPrice = 0;

        try {
          const selectedBatches = await selectBatchesForSale({
            productId,
            organizationId: organizationId!,
            quantity,
            method: inventoryMethod,
            branchId: branchId,
          }, tx);

          if (selectedBatches.length > 0) {
            batchId = selectedBatches[0].batchId;
            costPrice = selectedBatches[0].unitCost;

            for (const batch of selectedBatches) {
              await updateBatchQuantity(batch.batchId, batch.quantity, organizationId!, tx);
            }
          } else {
            const avgCost = await getAverageCost(productId, organizationId!, branchId);
            costPrice = avgCost?.averageCost || 0;
          }
        } catch (error: any) {
          const avgCost = await getAverageCost(productId, organizationId!, branchId);
          costPrice = avgCost?.averageCost || 0;
        }

        const profit = (unitPrice - costPrice) * quantity;

        saleItemsData.push({
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
          costPrice,
          profit,
          taxRate: itemTax.taxRate,
          taxAmount: itemTax.taxAmount,
          taxCode: itemTax.taxCode,
          itemType: 'PRODUCT',
          measurementUnit: item.measurementUnit || 'PCS',
          exemptionReference: item.exemptionReference || null,
          product: { connect: { id: productId } },
          ...(batchId !== null ? { batch: { connect: { id: batchId } } } : {}),
        });
      }

      // 4. Allocate the RRA invoice sequence number and create the sale together,
      // so a rollback of this transaction also rolls back the sequence increment.
      const { invoiceNumber, vsdcInvcNo } = await generateInvoiceNumber(organizationId!, branchId as number, tx)

      const newSale = await tx.sale.create({
        data: {
          saleNumber,
          invoiceNumber,
          vsdcInvcNo,
          customerId: parseInt(customerId),
          userId: userId!,
          organizationId: organizationId!,
          branchId: branchId as any,
          paymentType: finalPaymentType,
          cashAmount: cashAmount || 0,
          insuranceAmount: insuranceAmount || 0,
          debtAmount: debtAmount || 0,
          shiftId: resolvedShiftId,
          totalAmount: computedTotal,
          vatAmount: taxSummary.vatAmount,
          taxableAmount: taxSummary.taxableAmount,
          status: 'COMPLETED',
          isProforma: !!isProforma,
          rcptLabel: rcptLabel as any,
          saleItems: { create: saleItemsData },
        },
        include: {
          saleItems: { include: { product: true, batch: true } },
          customer: true,
        },
      } as any);

      // 4b. Consume an organization-level RRA purchase code for business (B2B)
      // buyers. Test codes are configured once at the org level (not per customer)
      // and are single-use, so each business sale draws a fresh unused code. Falls
      // back to the legacy per-customer prcOrdCd when the org pool is empty.
      const custTin = (newSale as any).customer?.TIN?.trim() ?? '';
      if (custTin && !custTin.startsWith('7')) {
        const allocated = await consumeOrgPurchaseCode(organizationId!, custTin, (newSale as any).id, tx)
          ?? ((newSale as any).customer?.prcOrdCd ?? null);
        if (allocated) {
          await tx.sale.update({
            where: { id: (newSale as any).id },
            data: { prcOrdCd: allocated },
          });
          (newSale as any).prcOrdCd = allocated;
        }
      }

      // 5. Record stock movements for PRODUCT items only (MODULE 2.4: guard reference)
      for (const item of productItems) {
        const saleItem = (newSale as any).saleItems?.find((si: any) => si.productId === parseInt(item.productId));
        if (!saleNumber || saleNumber.trim().length === 0) {
          throw new Error('Stock movement reference cannot be empty');
        }
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
          tx,
        });
      }

      // 6. Update customer balance if debt (atomic with sale)
      const remainingDebt = computedTotal - (cashAmount || 0) - (insuranceAmount || 0)
      if (remainingDebt > 0) {
        await tx.customer.update({
          where: { id: parseInt(customerId) },
          data: { balance: { increment: remainingDebt } },
        });
      }

      // 7. Write transactional outbox entry (atomic with the sale)
      if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
        const operation: EbmOperation = 'SALE';
        const idempotencyKey = `ebm-${operation}-${organizationId}-${newSale.id}`;
        await tx.ebmOutbox.create({
          data: {
            organizationId: organizationId!,
            saleId: newSale.id,
            operation,
            idempotencyKey,
            payload: { version: 1, saleId: newSale.id, organizationId: organizationId!, operation } as any,
            status: 'PENDING',
            nextAttemptAt: new Date(),
          },
        });
      }

      return newSale;
    }, {
      maxWait: 30000,   // 30 seconds
      timeout: 60000,   // 60 seconds
    });

    // Fire the outbox worker immediately (fire-and-forget) so the invoice hits
    // the WAR right at sale time instead of waiting for the 2-minute cron tick.
    // The outbox row stays the single source of truth, so idempotency is kept
    // and the cron job remains a retry/backstop if this run fails or times out.
    if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
      void processEbmOutboxBatch(50).catch((e) => {
        console.error('[EBM] immediate fiscalization error:', e);
      });
    }

    // 7. Record split payments if provided
    if (splitPayments && Array.isArray(splitPayments) && splitPayments.length > 0) {
      const validPaymentMethods = ['CASH', 'BANK', 'CARD', 'PAYPACK', 'MTN_MOMO', 'AIRTEL_MONEY', 'WALLET', 'GIFT_CARD', 'STORE_CREDIT'];
      let totalSplitAmount = 0;

      for (const pmt of splitPayments) {
        if (!validPaymentMethods.includes(pmt.paymentMethod)) continue;
        const amount = Number(pmt.amount) || 0;
        if (amount <= 0) continue;
        totalSplitAmount += amount;

        await prisma.salePayment.create({
          data: {
            saleId: sale.id,
            organizationId,
            amount,
            paymentMethod: pmt.paymentMethod,
            reference: pmt.reference || null,
            status: 'COMPLETED',
            processedAt: new Date(),
            metadata: pmt.metadata || null,
          },
        });
      }
    }

    // 8. Log activity (outside transaction for performance, but after successful sale)
    await auditLogger.sales(req, {
      type: 'SALE_COMPLETED',
      description: `Sale completed (Invoice #${sale.invoiceNumber || saleNumber})`,
      entityType: 'Sale',
      entityId: sale.id,
      metadata: {
        invoiceNumber: sale.invoiceNumber,
        totalAmount: sale.totalAmount,
        paymentType: sale.paymentType,
        splitPayments: splitPayments?.length || 0,
      }
    });

    // Fetch the complete sale with payments
    const completeSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: {
        saleItems: { include: { product: true, batch: true } },
        customer: true,
        salePayments: true,
      },
    });

    res.status(201).json(success(completeSale || sale))
  } catch (error: any) {
    console.error("[Create Sale Error]:", error)

    // Return appropriate status code based on error type
    if (error.message && error.message.includes('Insufficient stock')) {
      return res.status(400).json(apiError(error.message || "Insufficient stock"))
    }

    if (error.message && error.message.includes('not found')) {
      return res.status(404).json(apiError(error.message || "Resource not found"))
    }

    if (error.code === 'P2002' && error.message?.includes('invoice_number')) {
      return res.status(500).json(apiError("Invoice number conflict. Please try again."))
    }

    res.status(500).json(apiError("Failed to create sale"))
  }
}

export const getSales = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { startDate, endDate, customerId, page, limit, search, status, paymentType } = req.query
    const requestedPage = Number(page)
    const pageNumber = Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.floor(requestedPage)
      : 1
    const requestedLimit = Number(limit)
    const pageSize = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 500)
      : 50

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

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
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
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({ where }),
    ])

    res.json(success({
      data: sales,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }))
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
        salePayments: {
          orderBy: { createdAt: "asc" },
        },
        originalSale: {
          select: {
            id: true,
            saleNumber: true,
            invoiceNumber: true,
            createdAt: true,
          },
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

    await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id },
        data: {
          debtAmount: remainingDebt,
          cashAmount: { increment: amount },
        },
      })

      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          balance: { decrement: amount },
        },
      })
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
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const orgSettings = await getOrganizationSettings(organizationId);
    const result = await executeWithRetry(async () => {
      return await prisma.$transaction(async (prisma) => {
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

        // Get all sale items for full refund — include batchId to restore batch quantities
        const itemsToRefund = ((sale as any).saleItems || []).map((item: any) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
          totalPrice: item.totalPrice.toNumber(),
          batchId: item.batchId || item.batch?.id || null,
          itemType: item.itemType || 'PRODUCT',
          serviceName: item.serviceName || null,
          serviceDescription: item.serviceDescription || null,
        }));

        // Calculate total refund amount
        const totalRefundAmount = itemsToRefund.reduce((sum: number, item: any) => sum + item.totalPrice, 0);

        // ── MODULE 2.3: Reject if refund exceeds original total (defense-in-depth) ──
        const originalTotal = Number((sale as any).totalAmount);
        if (totalRefundAmount > originalTotal + 0.01) {
          throw {
            status: 400,
            message: `Refund total ${totalRefundAmount.toFixed(2)} exceeds original invoice total ${originalTotal.toFixed(2)}`,
          };
        }

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

        // C6: determine NR vs TR based on training mode
        const refundOrg = await prisma.organization.findUnique({
          where: { id: organizationId! },
          select: { trainingMode: true },
        });
        const refundRcptLabel = refundOrg?.trainingMode ? 'TR' : 'NR';

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
            rcptLabel: refundRcptLabel as any,
            originalSaleId: id, // Link to original sale
            shiftId: (sale as any).shiftId ?? undefined, // Refund belongs to the original sale's shift
            saleItems: {
              create: itemsToRefund.map((item: any) => ({
                productId: item.productId || undefined,
                quantity: -item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: -item.totalPrice,
                itemType: item.itemType,
                serviceName: item.serviceName,
                serviceDescription: item.serviceDescription,
              }))
            }
          } as any,
          include: {
            saleItems: { include: { product: true } },
            customer: true
          }
        });

        // Update product quantities (restore inventory) and record movements in ledger (Stock IN)
        // Only restore stock for PRODUCT items; SERVICE items have no inventory
        for (const item of itemsToRefund) {
          if (item.itemType === 'SERVICE' || !item.productId) continue;

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

          if (item.batchId) {
            const existingBatch = await prisma.batch.findFirst({
              where: { id: item.batchId, organizationId: organizationId! },
            });
            if (existingBatch) {
              await prisma.batch.update({
                where: { id: item.batchId },
                data: {
                  quantity: existingBatch.quantity + item.quantity,
                  isActive: true,
                },
              });
            }
          }
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

        // Write EBM outbox entry for REFUND atomically with the transaction.
        // This ensures the RRA is notified even if the process crashes after commit.
        if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
          const refundIdempotencyKey = `ebm-REFUND-${organizationId}-${refundSale.id}`;
          await prisma.ebmOutbox.create({
            data: {
              organizationId: organizationId!,
              saleId: refundSale.id,
              operation: 'REFUND',
              idempotencyKey: refundIdempotencyKey,
              payload: {
                version: 1,
                saleId: refundSale.id,
                organizationId: organizationId!,
                operation: 'REFUND',
                originalSaleId: id,
              } as any,
              status: 'PENDING',
              nextAttemptAt: new Date(),
            },
          });
        }

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

    // Fire the outbox worker immediately (fire-and-forget) so the refund hits
    // the WAR right at refund time instead of waiting for the 2-minute cron tick.
    // The outbox row stays the single source of truth for idempotency; the cron
    // job remains a retry/backstop if this run fails or times out.
    if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
      void processEbmOutboxBatch(50).catch((e) => {
        console.error('[EBM] immediate refund fiscalization error:', e);
      });
    }

    res.status(200).json(success(result));
  } catch (error: any) {
    console.error("[Refund Error]:", error);
    const status = error.status || 500;
    const message = error.message || "Failed to process refund";
    res.status(status).json(apiError(message, error.code));
  }
};


/**
 * Reprint a sale receipt — increments reprintCount atomically and returns
 * the sale with isCopy=true so the frontend can render a "COPY RECEIPT" label.
 */
export const reprintSaleReceipt = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId);
    const organizationId = parseInt(req.params.organizationId);

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId, ...buildBranchFilter(req) },
      include: {
        saleItems: { include: { product: true } },
        customer: true,
      },
    });

    if (!sale) {
      return res.status(404).json(apiError("Sale not found"));
    }

    // C6: CS = copy of a sale, CR = copy of a refund
    const copyLabel = (sale.status === 'REFUNDED' || (sale as any).rcptLabel === 'NR' || (sale as any).rcptLabel === 'TR')
      ? 'CR'
      : 'CS';

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        reprintCount: { increment: 1 },
        rcptLabel: copyLabel as any,
      },
    });

    await auditLogger.sales(req, {
      type: 'SALE_REPRINTED',
      description: `Receipt reprinted for Sale #${sale.saleNumber} (count: ${updated.reprintCount})`,
      entityType: 'Sale',
      entityId: saleId,
      metadata: { reprintCount: updated.reprintCount },
    });

    res.json(success({
      ...sale,
      isCopy: updated.reprintCount > 1,
      reprintCount: updated.reprintCount,
      rcptLabel: copyLabel,
    }));
  } catch (error: any) {
    console.error("[Reprint Sale Error]:", error);
    res.status(500).json(apiError("Failed to reprint receipt"));
  }
};

/**
 * Regenerate invoice for a sale — creates a new invoice number, updates the sale,
 * generates new EBM transaction, preserves history, and prevents duplicate numbers.
 */
export const regenerateInvoice = async (req: BranchAuthRequest, res: Response) => {
    try {
        const saleId = parseInt(req.params.saleId);
        const organizationId = parseInt(req.params.organizationId);
        const branchId = await resolveBranchIdForWrite(req);

        const sale = await prisma.sale.findFirst({
            where: { id: saleId, organizationId, ...buildBranchFilter(req) },
            include: { ebmTransactions: { orderBy: { createdAt: 'desc' } } },
        });

        if (!sale) {
            return res.status(404).json(apiError("Sale not found"));
        }

        if (sale.status === 'CANCELLED' || sale.status === 'REFUNDED') {
            return res.status(400).json(apiError(`Cannot regenerate invoice for a ${sale.status.toLowerCase()} sale`));
        }

        const result = await prisma.$transaction(async (tx) => {
            // Generate new invoice number
            const { invoiceNumber, vsdcInvcNo } = await generateInvoiceNumber(organizationId, branchId as number, tx);

            // Update sale with new invoice number
            const updatedSale = await tx.sale.update({
                where: { id: saleId },
                data: {
                    invoiceNumber,
                    vsdcInvcNo,
                    reprintCount: { increment: 1 },
                    updatedAt: new Date(),
                },
            });

            // Create a new EBM transaction record for the regenerated invoice
            if (isEbmEnabled()) {
                const idempotencyKey = `ebm-REGEN-${organizationId}-${saleId}-${Date.now()}`;
                await tx.ebmOutbox.create({
                    data: {
                        organizationId,
                        saleId,
                        operation: 'SALE',
                        idempotencyKey,
                        payload: {
                            version: 1,
                            saleId,
                            organizationId,
                            operation: 'SALE',
                            invoiceNumber,
                            regenerated: true,
                        } as any,
                        status: 'PENDING',
                        nextAttemptAt: new Date(),
                    },
                });
            }

            return updatedSale;
        });

        await auditLogger.sales(req, {
            type: 'SALE_UPDATE',
            description: `Invoice regenerated for Sale #${sale.saleNumber} - New invoice: ${result.invoiceNumber}`,
            entityType: 'Sale',
            entityId: saleId,
            metadata: {
                previousInvoice: sale.invoiceNumber,
                newInvoice: result.invoiceNumber,
                reprintCount: result.reprintCount,
            },
        });

        res.json(success({
            ...result,
            previousInvoiceNumber: sale.invoiceNumber,
            isRegenerated: true,
        }));
    } catch (error: any) {
        console.error("[Regenerate Invoice Error]:", error);
        if (error.code === 'P2002') {
            return res.status(500).json(apiError("Invoice number conflict. Please try again."));
        }
        res.status(500).json(apiError("Failed to regenerate invoice"));
    }
};

/**
 * E2/E3: GET /api/organizations/:orgId/sales/:saleId/ebm-receipt
 * Returns the latest successful SDC fiscalization data for a sale.
 * The frontend polls this after sale creation once the outbox worker has run.
 */
export const getEbmReceipt = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId);
    const organizationId = parseInt(req.params.organizationId);

    const tx = await prisma.ebmTransaction.findFirst({
      where: {
        saleId,
        organizationId,
        submissionStatus: 'SUCCESS',
        operation: { in: ['SALE', 'REFUND'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!tx) {
      return res.status(202).json({
        status: 'pending',
        message: 'Fiscal submission not yet complete',
      });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: { rcptLabel: true, invoiceNumber: true, saleNumber: true },
    });

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { TIN: true, ebmDeviceId: true, ebmSerialNo: true },
    });

    const branch = sale
      ? await prisma.branch.findFirst({
          where: { id: (sale as any).branchId },
          select: { bhfId: true, ebmDeviceId: true, ebmSerialNo: true },
        })
      : null;

    const mrcNo = branch?.ebmSerialNo ?? org?.ebmSerialNo ?? null;
    const sdcId = branch?.ebmDeviceId ?? org?.ebmDeviceId ?? null;

    res.json({
      status: 'success',
      ebm: {
        sdcId,
        mrcNo,
        sdcRcptNo:        tx.sdcRcptNo,
        internalData:     tx.internalData,
        receiptSignature: tx.receiptSignature,
        qrPayload:        tx.qrPayload,
        sdcDateTime:      tx.sdcDateTime,
        rcptLabel:        tx.rcptLabel ?? sale?.rcptLabel,
        ebmInvoiceNumber: tx.ebmInvoiceNumber,
      },
    });
  } catch (error: any) {
    console.error('[EBM Receipt Error]:', error);
    res.status(500).json(apiError('Failed to get EBM receipt data'));
  }
};

export const cancelSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId);
    const organizationId = parseInt(req.params.organizationId);
    const orgSettings = await getOrganizationSettings(organizationId);
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
            product: true,
            batch: true
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
      // Only restore stock for PRODUCT items; SERVICE items have no inventory
      for (const item of sale.saleItems) {
        const isService = (item as any).itemType === 'SERVICE' || !item.productId;
        if (isService) continue;

        const productId = item.productId!;
        await addStock({
          organizationId: organizationId!,
          productId,
          userId: parseInt(userId as string),
          quantity: item.quantity,
          movementType: 'RETURN_CUSTOMER',
          branchId: (sale as any).branchId,
          reference: sale.saleNumber,
          referenceType: 'SALE_CANCELLATION',
          note: `Sale cancellation: ${sale.saleNumber}`,
          tx: prisma,
        });

        const batchId = (item as any).batchId || (item as any).batch?.id || null;
        if (batchId) {
          const existingBatch = await prisma.batch.findFirst({
            where: { id: batchId, organizationId: organizationId! },
          });
          if (existingBatch) {
            await prisma.batch.update({
              where: { id: batchId },
              data: {
                quantity: existingBatch.quantity + item.quantity,
                isActive: true,
              },
            });
          }
        }
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

      // Write EBM outbox entry for VOID atomically with the transaction.
      // The outbox worker will notify RRA; this survives process crashes.
      if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
        const voidIdempotencyKey = `ebm-VOID-${organizationId}-${saleId}`;
        await prisma.ebmOutbox.create({
          data: {
            organizationId,
            saleId,
            operation: 'VOID',
            idempotencyKey: voidIdempotencyKey,
            payload: {
              version: 1,
              saleId,
              organizationId,
              operation: 'VOID',
              reason: reason ?? null,
            } as any,
            status: 'PENDING',
            nextAttemptAt: new Date(),
          },
        });
      }
    });

    // Fire the outbox worker immediately (fire-and-forget) so the void hits
    // the WAR right at cancel time instead of waiting for the cron tick. The
    // outbox row stays the single source of truth for idempotency; the cron
    // job remains a retry/backstop if this run fails or times out.
    if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
      void processEbmOutboxBatch(50).catch((e) => {
        console.error('[EBM] immediate void fiscalization error:', e);
      });
    }

    res.status(200).json(success({ message: "Sale cancelled successfully" }));
  } catch (error) {
    console.error("[Cancel Sale Error]:", error);
    res.status(500).json(apiError("Failed to cancel sale"));
  }
};

/** Build the RRA QR string per CIS/VSDC spec (§4.2): ddmmyyyy#hhmmss#sdcId#sdcRcptNo#internalData#receiptSignature */
function buildRraQrString(p: {
  sdcDateTime?: string | Date | null
  sdcId?: string | null
  sdcRcptNo?: number | string | null
  internalData?: string | null
  receiptSignature?: string | null
}): string | null {
  if (!p.sdcDateTime || !p.sdcId || p.sdcRcptNo == null || !p.internalData || !p.receiptSignature) return null
  const dt = p.sdcDateTime instanceof Date ? p.sdcDateTime : new Date(p.sdcDateTime)
  if (Number.isNaN(dt.getTime())) return null
  const p2 = (x: number) => String(x).padStart(2, "0")
  return [
    `${p2(dt.getDate())}${p2(dt.getMonth() + 1)}${dt.getFullYear()}`,
    `${p2(dt.getHours())}${p2(dt.getMinutes())}${p2(dt.getSeconds())}`,
    p.sdcId,
    String(p.sdcRcptNo),
    p.internalData,
    p.receiptSignature,
  ].join("#")
}

const RCT_LABEL_DISPLAY: Record<string, string> = {
  NS: "Normal Sale",
  NR: "Normal Refund",
  CS: "Copy Sale",
  CR: "Copy Refund",
  TS: "Training Sale",
  TR: "Training Refund",
  PS: "Proforma Sale",
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile Money",
  MTN_MOMO: "MTN Mobile Money",
  CARD: "Card",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  BANK_TRANSFER: "Bank Transfer",
  PAYPACK: "PayPack",
  CREDIT: "Credit",
  DEBT: "Credit",
  MIXED: "Mixed",
}

/**
 * Composed invoice payload used by the modern ERP invoice renderer.
 *
 * GET /api/organizations/:orgId/invoices/:saleId
 *
 * Returns a single, fully-mapped document so the frontend renders ONLY values
 * coming from the API — no hardcoded business data anywhere in the UI.
 * All money arithmetic (subtotal, discount, VAT, tax, paid, balance, grand
 * total) is performed here in the backend; the frontend merely displays it.
 */
export const getInvoice = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId ?? req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId, ...buildBranchFilter(req) },
      include: {
        customer: { select: { id: true, name: true, phone: true, TIN: true, email: true, address: true } },
        user: { select: { id: true, name: true } },
        saleItems: { include: { product: true } },
        ebmTransactions: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!sale) return res.status(404).json(apiError("Sale not found"))

    const [org, branch] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, avatar: true, address: true, phone: true, email: true, TIN: true, VRN: true, currency: true, ebmDeviceId: true, ebmSerialNo: true },
      }),
      prisma.branch.findUnique({
        where: { id: sale.branchId },
        select: { name: true, bhfId: true, ebmDeviceId: true, ebmSerialNo: true, address: true },
      }),
    ])

    const fiscalTx = (sale.ebmTransactions ?? []).find((t) => t.submissionStatus === "SUCCESS" && (!t.operation || t.operation === "SALE" || t.operation === "REFUND"))
    const responseData = fiscalTx?.responseData as { normalized?: { ebmInvoiceNumber?: string; verificationCode?: string; sdcDateTime?: string; intrlData?: string; vsdcSignature?: string } } | null | undefined
    const norm = responseData?.normalized

    const mrcNo = branch?.ebmSerialNo ?? org?.ebmSerialNo ?? null
    // Prefer the ID stamped in the successful RRA response. Configured device
    // values are a fallback only; this keeps the printed SDC identifier aligned
    // with the actual fiscal receipt.
    const sdcId = fiscalTx?.sdcId ?? branch?.ebmDeviceId ?? org?.ebmDeviceId ?? null
    const sdcRcptNo = fiscalTx?.sdcRcptNo ?? null
    const totalRcptNo = fiscalTx?.totalRcptNo ?? null
    const internalData = fiscalTx?.internalData ?? norm?.intrlData ?? null
    const receiptSignature = fiscalTx?.receiptSignature ?? norm?.vsdcSignature ?? norm?.verificationCode ?? null
    const sdcDateTime = fiscalTx?.sdcDateTime ?? norm?.sdcDateTime ?? null
    const ebmInvoiceNumber = fiscalTx?.ebmInvoiceNumber ?? norm?.ebmInvoiceNumber ?? sale.invoiceNumber ?? null
    const rcptLabel = fiscalTx?.rcptLabel ?? sale.rcptLabel ?? null
    const fiscalReceiptNumber = sdcRcptNo != null
      ? `${sdcRcptNo}/${totalRcptNo ?? sdcRcptNo}${rcptLabel ? ` ${rcptLabel}` : ""}`
      : sale.saleNumber
    const fiscalInvoiceNumber = fiscalTx && sdcId && sdcRcptNo != null
      ? `${sdcId}-${sdcRcptNo}`
      : ebmInvoiceNumber ?? sale.invoiceNumber ?? sale.saleNumber

    const currency = org?.currency ?? "RWF"
    const toNumber = (v: unknown): number => (v == null ? 0 : typeof v === "number" ? v : Number(String(v)))
    const totalAmount = toNumber(sale.totalAmount)
    const cashAmount = toNumber(sale.cashAmount)
    const debtAmount = toNumber(sale.debtAmount)
    const insuranceAmount = toNumber(sale.insuranceAmount)
    const vatAmount = toNumber(sale.vatAmount)
    const taxableAmount = toNumber(sale.taxableAmount)
    const discountAmount = Math.max(0, totalAmount - cashAmount - debtAmount - insuranceAmount - vatAmount - taxableAmount)

    const items = (sale.saleItems ?? []).map((line, index) => {
      const qty = toNumber(line.quantity)
      const unitPrice = toNumber(line.unitPrice)
      const gross = qty * unitPrice
      const dcAmt = toNumber(line.dcAmt)
      const dcRate = toNumber(line.dcRate)
      const taxAmt = toNumber(line.taxAmount)
      const taxRate = toNumber(line.taxRate)
      const net = gross - dcAmt
      return {
        id: String(line.id),
        line: index + 1,
        code: line.product?.itemCd ?? line.product?.sku ?? line.product?.barcode ?? line.product?.name ?? line.serviceName ?? "",
        description: line.serviceName ?? line.product?.name ?? line.serviceDescription ?? "",
        quantity: qty,
        unit: line.measurementUnit ?? "PCS",
        unitPrice,
        discountPct: dcRate,
        discountAmt: dcAmt,
        taxCode: line.taxCode ?? null,
        vatPct: taxRate,
        taxAmount: taxAmt,
        subtotal: gross,
        net,
        // Unit prices and `sale.totalAmount` are VAT-inclusive throughout the
        // checkout flow. The tax is an extraction from the gross line, not an
        // amount to add again on the printed invoice.
        total: net,
        itemType: line.itemType ?? "PRODUCT",
      }
    })

    const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
    const itemDiscount = items.reduce((s, i) => s + i.discountAmt, 0)
    const lineTax = items.reduce((s, i) => s + i.taxAmount, 0)
    const discount = Math.max(0, Math.round(itemDiscount + discountAmount))
    const grandTotal = Math.round(totalAmount)
    const paid = Math.round(cashAmount + insuranceAmount)
    const balance = Math.round(debtAmount)

    // QR image is generated server-side — the frontend only renders the image returned by the API.
    const qrRaw = fiscalTx?.qrPayload ?? buildRraQrString({ sdcDateTime, sdcId, sdcRcptNo, internalData, receiptSignature })
    const qrCodeImage = qrRaw
      ? await QRCode.toDataURL(qrRaw, { errorCorrectionLevel: "M", margin: 1, width: 220, color: { dark: "#000000", light: "#FFFFFF" } })
      : null

    const isCertified = !!fiscalTx
    const verificationUrl = isCertified && sdcId ? `https://esbm.rra.gov.rw/tax-invoice/verification?sdcId=${encodeURIComponent(sdcId)}&receipt=${encodeURIComponent(String(sdcRcptNo))}` : null

    const dateObj = new Date(sale.createdAt)
    const p2 = (x: number) => String(x).padStart(2, "0")
    const time = `${p2(dateObj.getHours())}:${p2(dateObj.getMinutes())}:${p2(dateObj.getSeconds())}`
    const invoiceDate = dateObj.toISOString()

    const paymentMethodLabel = PAYMENT_METHOD_LABEL[sale.paymentType] ?? sale.paymentType ?? ""

    const invoiceData: RenderInvoicePayload = {
      company: {
        logo: org?.avatar ?? null,
        name: org?.name ?? "",
        address: branch?.address ?? org?.address ?? "",
        branchName: branch?.name ?? null,
        bhfId: branch?.bhfId ?? null,
        phone: org?.phone ?? null,
        email: org?.email ?? null,
        tin: org?.TIN ?? null,
        vrn: org?.VRN ?? null,
        mrc: mrcNo,
        website: null,
        currency,
      },
      customer: {
        name: sale.customer?.name ?? "",
        tin: sale.customer?.TIN ?? null,
        phone: sale.customer?.phone ?? null,
        email: sale.customer?.email ?? null,
        address: sale.customer?.address ?? null,
        vatNo: sale.customer?.TIN ?? null,
      },
      invoice: {
        id: String(sale.id),
        saleNumber: sale.saleNumber,
        invoiceNumber: fiscalInvoiceNumber,
        receiptNumber: fiscalReceiptNumber,
        invoiceDate,
        time,
        paymentMethod: paymentMethodLabel,
        cashier: sale.user?.name ?? "",
        status: sale.status,
        rcptLabel,
        rcptLabelText: rcptLabel ? RCT_LABEL_DISPLAY[rcptLabel] ?? rcptLabel : null,
        isProforma: sale.isProforma,
        isCopy: (sale.reprintCount ?? 0) > 0,
        currency,
      },
      items,
      totals: {
        subtotal: Math.round(subtotal),
        discount,
        taxable: Math.round(taxableAmount),
        vat: Math.round(vatAmount),
        tax: Math.round(lineTax),
        shipping: 0,
        paid,
        balance,
        grandTotal,
      },
      charges: {
        vatAmount: Math.round(vatAmount),
        taxableAmount: Math.round(taxableAmount),
        discountAmount: Math.round(discountAmount),
        cashAmount: Math.round(cashAmount),
        insuranceAmount: Math.round(insuranceAmount),
        debtAmount: Math.round(debtAmount),
        totalAmount: Math.round(totalAmount),
        shipping: 0,
      },
      payment: {
        method: sale.paymentType ?? "",
        methodLabel: paymentMethodLabel,
        reference: null,
        bank: null,
        cashAmount: Math.round(cashAmount),
        insuranceAmount: Math.round(insuranceAmount),
        debtAmount: Math.round(debtAmount),
      },
      sdcInformation: {
        sdcId,
        mrcNo,
        receiptNumber: sdcRcptNo != null ? fiscalReceiptNumber : null,
        receiptSignature,
        internalData,
        sdcDateTime: sdcDateTime ? String(sdcDateTime) : null,
        date: sdcDateTime ? new Date(sdcDateTime).toISOString() : null,
        time: sdcDateTime ? `${p2(new Date(sdcDateTime).getHours())}:${p2(new Date(sdcDateTime).getMinutes())}:${p2(new Date(sdcDateTime).getSeconds())}` : null,
        ebmInvoiceNumber: ebmInvoiceNumber,
        rcptLabel,
        poweredBy: null,
      },
      certification: {
        isCertified,
        certificateImage: null,
        certificateText: isCertified ? "This is a fiscalized EBM receipt certified by the Rwanda Revenue Authority." : null,
      },
      verification: {
        qrCodeImage,
        qrPayload: qrRaw,
        verificationUrl,
      },
      branding: {
        primaryColor: "#1565C0",
        rraLogo: null,
        poweredBy: "EXCEL EDGE ERP",
      },
      footer: {
        message: "Thank you for your business.",
        note: null,
      },
    }

    res.json(
      success({
        ...invoiceData,
        renderedHtml: renderSalesInvoiceHtml(invoiceData),
      })
    )
  } catch (error: any) {
    console.error("[Get Invoice Error]:", error)
    res.status(500).json(apiError("Failed to get invoice"))
  }
}
