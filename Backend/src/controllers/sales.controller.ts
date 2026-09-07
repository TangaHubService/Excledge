import { prisma } from "../lib/prisma"
import type { Response } from "express"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { Decimal } from "@prisma/client/runtime/library"
import { EbmOperation } from "@prisma/client"
import { auditLogger } from "../utils/auditLogger"
import { removeStock, addStock } from "../services/inventory-ledger.service"
import {
  generateInvoiceNumber,
  consumeOrgPurchaseCode,
  isEbmEnabled,
  allocateLocalReceiptSequence,
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
import { generateEbmInvoicePdf, getEbmInvoiceFilename, type InvoicePdfFormat } from "../services/invoice-pdf.service"
import { generateEbmReceiptPdf80mm } from "../services/invoice-receipt-pdf.service"
import { commitSale, CommitSaleError } from "../services/sale-commit.service"
import { SYSTEM_FOOTER, SYSTEM_POWERED_BY, CIS_VERSION_LABEL } from "../services/system-branding.service"
import QRCode from "qrcode"

export const createSale = async (req: BranchAuthRequest, res: Response) => {
  try {
    const { customerId, items, paymentType, cashAmount, debtAmount, insuranceAmount, isProforma, payments: splitPayments, shiftId, inventoryMethod } = req.body
    // @ts-ignore
    const userId = parseInt(req.user?.userId as string)
    const organizationId = parseInt(req.params.organizationId)
    const branchId = await resolveBranchIdForWrite(req)

    const { sale, completeSale, fiscalization } = await commitSale({
      organizationId,
      branchId: branchId as number,
      userId,
      customerId: parseInt(customerId),
      items,
      paymentType,
      cashAmount,
      debtAmount,
      insuranceAmount,
      payments: splitPayments,
      shiftId,
      isProforma: !!isProforma,
      inventoryMethod,
      req,
    })

    res.status(201).json(success({ ...(completeSale ?? sale), fiscalization }))
  } catch (error: any) {
    if (error instanceof CommitSaleError) {
      return res.status(error.statusCode).json(apiError(error.message))
    }

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

/**
 * Recompute a proforma's line items / customer before it is converted.
 * A proforma never touched inventory, VSDC or the customer balance, so this is a
 * pure recompute: replace saleItems, refresh totals. Only allowed while the
 * proforma has not been converted yet.
 *
 * PUT /:organizationId/:saleId/proforma   body: { customerId?, items: [...] }
 */
export const updateProforma = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const saleId = parseInt(req.params.saleId)
    const { customerId, items } = req.body as {
      customerId?: number
      items: Array<{ productId?: number; quantity: number; unitPrice: number; itemType?: 'PRODUCT' | 'SERVICE'; serviceName?: string; serviceDescription?: string; measurementUnit?: string }>
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json(apiError("A proforma must have at least one item"))
    }

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId, ...buildBranchFilter(req) },
      include: { convertedSale: { select: { id: true } } },
    })
    if (!sale) return res.status(404).json(apiError("Proforma not found"))
    if (!sale.isProforma) return res.status(400).json(apiError("Only a proforma can be edited this way"))
    if (sale.status === 'CONVERTED' || sale.convertedSale) {
      return res.status(409).json(apiError("This proforma has already been converted to a sale"))
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { vatRegistered: true, isTaxExempt: true },
    })

    const itemsForTax = items.map((i) => ({
      productId: i.productId ? Number(i.productId) : undefined,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      itemType: i.itemType || 'PRODUCT',
    }))
    const taxSummary = await TaxService.calculateSaleTax(
      organizationId,
      itemsForTax as any,
      org?.vatRegistered ?? false,
      org?.isTaxExempt ?? false,
    )
    const computedTotal = taxSummary.items.reduce(
      (sum, ti) => sum + Number(ti.taxableAmount) + Number(ti.taxAmount),
      0,
    )

    const saleItemsData = items.map((i, idx) => {
      const t = taxSummary.items[idx]
      const isService = (i.itemType || 'PRODUCT') === 'SERVICE'
      const quantity = Number(i.quantity)
      const unitPrice = Number(i.unitPrice)
      return {
        quantity,
        unitPrice,
        totalPrice: quantity * unitPrice,
        costPrice: 0,
        profit: 0,
        taxRate: t?.taxRate ?? 0,
        taxAmount: t?.taxAmount ?? 0,
        taxCode: (t?.taxCode as any) ?? null,
        itemType: isService ? 'SERVICE' : 'PRODUCT',
        measurementUnit: (i.measurementUnit as any) || 'PCS',
        serviceName: isService ? (i.serviceName || null) : null,
        serviceDescription: isService ? (i.serviceDescription || null) : null,
        ...(isService ? {} : { product: { connect: { id: Number(i.productId) } } }),
      }
    })

    const updated = await prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId } })
      return tx.sale.update({
        where: { id: saleId },
        data: {
          ...(customerId ? { customerId: Number(customerId) } : {}),
          totalAmount: computedTotal,
          vatAmount: taxSummary.vatAmount,
          taxableAmount: taxSummary.taxableAmount,
          debtAmount: computedTotal,
          cashAmount: 0,
          insuranceAmount: 0,
          saleItems: { create: saleItemsData as any },
        },
        include: {
          saleItems: { include: { product: true } },
          customer: true,
        },
      })
    })

    await auditLogger.sales(req, {
      type: 'SALE_UPDATE',
      description: `Proforma #${sale.invoiceNumber ?? saleId} edited`,
      entityType: 'Sale',
      entityId: saleId,
      metadata: { itemCount: items.length, totalAmount: computedTotal },
    })

    res.json(success(updated))
  } catch (error: any) {
    console.error("[Update Proforma Error]:", error)
    res.status(500).json(apiError("Failed to update the proforma"))
  }
}

/**
 * Convert a proforma into a real NS sale: creates a fresh, fully-fiscalized sale
 * from the (optionally edited) proforma lines + the supplied payment, links it
 * back via proformaSourceId, and moves the proforma to status CONVERTED. The
 * proforma document itself is kept untouched.
 *
 * POST /:organizationId/:saleId/convert
 *   body: { paymentType?, cashAmount?, debtAmount?, insuranceAmount?, payments?,
 *           shiftId?, customerId?, items? }
 */
export const convertProforma = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const saleId = parseInt(req.params.saleId)
    // @ts-ignore
    const userId = parseInt(req.user?.userId as string)
    const branchId = await resolveBranchIdForWrite(req)
    const { paymentType, cashAmount, debtAmount, insuranceAmount, payments: splitPayments, shiftId, customerId, items } = req.body

    const proforma = await prisma.sale.findFirst({
      where: { id: saleId, organizationId, ...buildBranchFilter(req) },
      include: {
        saleItems: true,
        convertedSale: { select: { id: true, invoiceNumber: true } },
      },
    })
    if (!proforma) return res.status(404).json(apiError("Proforma not found"))
    if (!proforma.isProforma) return res.status(400).json(apiError("This sale is not a proforma"))
    if (proforma.status === 'CONVERTED' || proforma.convertedSale) {
      return res.status(409).json(apiError("This proforma has already been converted", undefined, { convertedSaleId: proforma.convertedSale?.id ?? null }))
    }

    // Use the edited lines when supplied, otherwise the proforma's current lines.
    const resolvedItems = Array.isArray(items) && items.length > 0
      ? items
      : proforma.saleItems.map((si) => ({
          productId: si.productId ?? undefined,
          quantity: si.quantity,
          unitPrice: Number(si.unitPrice),
          itemType: si.itemType,
          serviceName: si.serviceName ?? undefined,
          serviceDescription: si.serviceDescription ?? undefined,
          measurementUnit: si.measurementUnit,
        }))

    const { sale, completeSale, fiscalization } = await commitSale({
      organizationId,
      branchId: branchId as number,
      userId,
      customerId: customerId ? Number(customerId) : proforma.customerId,
      items: resolvedItems,
      paymentType,
      cashAmount,
      debtAmount,
      insuranceAmount,
      payments: splitPayments,
      shiftId,
      isProforma: false,
      proformaSourceId: saleId,
      inventoryMethod: req.body?.inventoryMethod,
      req,
    })

    await prisma.sale.update({ where: { id: saleId }, data: { status: 'CONVERTED' } })

    res.status(201).json(success({ ...(completeSale ?? sale), fiscalization, proformaSourceId: saleId }))
  } catch (error: any) {
    if (error instanceof CommitSaleError) {
      return res.status(error.statusCode).json(apiError(error.message))
    }
    // proforma_source_id is unique — a concurrent convert loses this race.
    if (error.code === 'P2002' && String(error.meta?.target ?? '').includes('proforma_source_id')) {
      return res.status(409).json(apiError("This proforma has already been converted"))
    }
    if (error.message && error.message.includes('Insufficient stock')) {
      return res.status(400).json(apiError(error.message))
    }
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json(apiError(error.message))
    }
    console.error("[Convert Proforma Error]:", error)
    res.status(500).json(apiError("Failed to convert the proforma"))
  }
}

export const getSales = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { startDate, endDate, customerId, page, limit, search, status, paymentType, rcptLabel } = req.query
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

    if (rcptLabel) {
      where.rcptLabel = rcptLabel as string
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
          },
          // Proforma-conversion links so the UI can badge "Converted".
          convertedSale: { select: { id: true, invoiceNumber: true, saleNumber: true } },
          proformaSource: { select: { id: true, invoiceNumber: true } },
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
        convertedSale: { select: { id: true, saleNumber: true, invoiceNumber: true, createdAt: true } },
        proformaSource: { select: { id: true, saleNumber: true, invoiceNumber: true, createdAt: true } },
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

        // Get all sale items for full refund — include batchId to restore batch quantities.
        // Tax code / rate / amount and any line discount are carried over from the
        // original line so the refund is fiscalised (and printed) as a true mirror
        // of the original — otherwise a refund of an 18% VAT sale would be reported
        // to RRA as a tax-exempt, zero-VAT refund (RRA checklist §9/§56).
        const itemsToRefund = ((sale as any).saleItems || []).map((item: any) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
          totalPrice: item.totalPrice.toNumber(),
          taxRate: Number(item.taxRate ?? 0),
          taxAmount: Number(item.taxAmount ?? 0),
          taxCode: item.taxCode ?? null,
          dcRate: Number(item.dcRate ?? 0),
          dcAmt: Number(item.dcAmt ?? 0),
          measurementUnit: item.measurementUnit ?? 'PCS',
          batchId: item.batchId || item.batch?.id || null,
          itemType: item.itemType || 'PRODUCT',
          serviceName: item.serviceName || null,
          serviceDescription: item.serviceDescription || null,
        }));

        // Calculate total refund amount
        const totalRefundAmount = itemsToRefund.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
        const totalRefundVat = itemsToRefund.reduce((sum: number, item: any) => sum + item.taxAmount, 0);
        const totalRefundTaxable = totalRefundAmount - totalRefundVat;

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
            vatAmount: -totalRefundVat,      // Negative — mirrors the original VAT being refunded
            taxableAmount: -totalRefundTaxable,
            status: 'REFUNDED',
            refundReason: reason,
            rcptLabel: refundRcptLabel as any,
            originalSaleId: id, // Link to original sale
            shiftId: (sale as any).shiftId ?? undefined, // Refund belongs to the original sale's shift
            saleItems: {
              create: itemsToRefund.map((item: any) => ({
                productId: item.productId || undefined,
                // quantity negative x unitPrice positive = totalPrice negative;
                // unitPrice itself stays positive here so that identity holds —
                // the printed minus sign on the per-unit price (RRA checklist
                // §56) is applied at render time (composeInvoicePayload), not
                // stored, to avoid double-negating the line total.
                quantity: -item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: -item.totalPrice,
                // Tax + discount mirror the original line with the sign flipped so
                // the refund fiscalises with the correct tax code/amount and the
                // printed receipt shows every amount negative (RRA checklist §56).
                taxRate: item.taxRate,
                taxAmount: -item.taxAmount,
                taxCode: item.taxCode ?? undefined,
                dcRate: item.dcRate,
                dcAmt: -item.dcAmt,
                measurementUnit: item.measurementUnit,
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

    // Bounded wait (same rationale as createSale — RRA checklist §16/§22: a
    // refund receipt must not be issued before VSDC confirms it either). The
    // outbox row stays the single source of truth; the 2-minute cron job
    // remains the retry/backstop if this wait times out.
    let refundFiscalization: { status: 'success' | 'pending' | 'failed' } = { status: 'success' };
    if (isEbmEnabled() && orgSettings.featureFlags.ebmIntegrationEnabled) {
      const EBM_INLINE_WAIT_MS = 5000;
      await Promise.race([
        processEbmOutboxBatch(5).catch((e) => {
          console.error('[EBM] immediate refund fiscalization error:', e);
        }),
        new Promise((resolve) => setTimeout(resolve, EBM_INLINE_WAIT_MS)),
      ]);

      const outboxRow = await prisma.ebmOutbox.findFirst({
        where: { saleId: result.refundSale.id, operation: 'REFUND' },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      refundFiscalization = {
        status: outboxRow?.status === 'SUCCEEDED' ? 'success' : outboxRow?.status === 'DEAD_LETTER' ? 'failed' : 'pending',
      };
    }

    res.status(200).json(success({ ...result, fiscalization: refundFiscalization }));
  } catch (error: any) {
    console.error("[Refund Error]:", error);
    const status = error.status || 500;
    const message = error.message || "Failed to process refund";
    res.status(status).json(apiError(message, error.code));
  }
};


/**
 * Registers one download/print of this sale's invoice PDF — called by the
 * frontend right before it fetches the actual PDF for every deliberate
 * download. CIS/VSDC spec §7.18: "print only one original receipt. Reprint
 * shall have a watermark with mention Copy." There's no separate "copy"
 * action: the FIRST registered download stays the original (reprintCount
 * reaches 1, isCopy stays false in getSaleInvoiceData); every one after that
 * is automatically rendered as a COPY (CS/CR) receipt.
 */
export const reprintSaleReceipt = async (req: BranchAuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId);
    const organizationId = parseInt(req.params.organizationId);

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId, ...buildBranchFilter(req) },
      select: { id: true, saleNumber: true, status: true, rcptLabel: true },
    });

    if (!sale) {
      return res.status(404).json(apiError("Sale not found"));
    }

    // C6: CS = copy of a sale, CR = copy of a refund. This is a display-only
    // label for the printout being produced right now — it must NOT overwrite
    // the sale's own rcptLabel (NS/NR/TS/TR), which is the fiscal record of
    // what the original receipt actually was. Persisting CS/CR onto the sale
    // previously made reprinted TRAINING receipts (TS/TR) look like normal
    // sales/refunds everywhere the sale's rcptLabel is read from, including
    // the daily X/Z report's training exclusion filter.
    const copyLabel = (sale.status === 'REFUNDED' || sale.rcptLabel === 'NR' || sale.rcptLabel === 'TR')
      ? 'CR'
      : 'CS';

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: { reprintCount: { increment: 1 } },
    });

    await auditLogger.sales(req, {
      type: 'SALE_REPRINTED',
      description: `Invoice downloaded for Sale #${sale.saleNumber} (download #${updated.reprintCount})`,
      entityType: 'Sale',
      entityId: saleId,
      metadata: { reprintCount: updated.reprintCount, copyLabel },
    });

    res.json(success({
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

        // RRA checklist §28: an approved (VSDC-signed) receipt must never be
        // modified — that includes re-numbering it. Regeneration is only for a
        // sale whose invoice number was never accepted by VSDC (still pending or
        // permanently failed). A fiscalised sale can only be corrected via a
        // refund against the original receipt.
        const alreadyFiscalised = sale.ebmTransactions.some(
            (t) => (t.operation === 'SALE' || !t.operation) && t.submissionStatus === 'SUCCESS' && t.ebmInvoiceNumber != null,
        );
        if (alreadyFiscalised) {
            return res.status(409).json(apiError(
                'This sale already has a VSDC-signed receipt and cannot be re-numbered. Issue a refund against the original receipt instead.',
            ));
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
    // `tx` is this sale's own successful VSDC response — prefer the ID it was
    // actually stamped with over the (possibly still-unconfigured) device
    // setting, same precedence composeInvoicePayload uses.
    const sdcId = tx.sdcId ?? branch?.ebmDeviceId ?? org?.ebmDeviceId ?? null;

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
/**
 * Thrown by composeInvoicePayload when a real (non-proforma) sale has not yet
 * been confirmed by VSDC — RRA VSDC spec forbids issuing/printing a receipt
 * without that confirmation (checklist §16/§22), so callers must surface this
 * distinctly instead of falling back to a degraded, unsigned receipt.
 */
export class FiscalizationPendingError extends Error {
  constructor(public readonly reason: "pending" | "failed") {
    super(`Sale not yet confirmed by VSDC (${reason})`)
    this.name = "FiscalizationPendingError"
  }
}

export async function composeInvoicePayload(req: BranchAuthRequest): Promise<RenderInvoicePayload | null> {
  const saleId = parseInt(req.params.saleId ?? req.params.id)
  const organizationId = parseInt(req.params.organizationId)

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId, ...buildBranchFilter(req) },
      include: {
        customer: { select: { id: true, name: true, phone: true, TIN: true, email: true, address: true } },
        user: { select: { id: true, name: true } },
        saleItems: { include: { product: true } },
        ebmTransactions: { orderBy: { createdAt: "desc" } },
        originalSale: { select: { vsdcInvcNo: true, invoiceNumber: true, saleNumber: true } },
      },
    })

    if (!sale) return null

    // Proforma sales are never submitted to VSDC by design and have no outbox
    // row to check. A real (NS/NR) sale that does have an outbox row must have
    // reached SUCCEEDED before its receipt can be composed — anything else
    // (PENDING/PROCESSING/FAILED still retrying, or permanently DEAD_LETTER)
    // blocks here rather than silently degrading to an unsigned receipt.
    if (!sale.isProforma) {
      // Not filtered to operation:"SALE" — a refund sale's outbox row is
      // written with operation:"REFUND" (see refundSale), and a voided sale's
      // with "VOID"; whichever applies to this sale is what must have SUCCEEDED.
      const outboxRow = await prisma.ebmOutbox.findFirst({
        where: { saleId: sale.id },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      })
      if (outboxRow && outboxRow.status !== "SUCCEEDED") {
        throw new FiscalizationPendingError(outboxRow.status === "DEAD_LETTER" ? "failed" : "pending")
      }
    }

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

    // "Linked to RRA/EBM" means the VSDC device credentials actually used to
    // talk to RRA (see getOsdcCreds/getVsdcCreds: org.TIN + branch.ebmSerialNo,
    // falling back to org.ebmSerialNo) are configured — NOT ebmDeviceId, which
    // is just the SDC ID RRA hands back after a successful transaction and is
    // still empty for a freshly-registered device that hasn't fiscalized yet.
    // bhfId defaults to "00" everywhere else in the codebase, so it alone
    // can't signal registration either.
    const isEbmLinked = Boolean(org?.TIN && (branch?.ebmSerialNo || org?.ebmSerialNo))

    const fiscalTx = (sale.ebmTransactions ?? []).find((t) => t.submissionStatus === "SUCCESS" && (!t.operation || t.operation === "SALE" || t.operation === "REFUND"))
    const responseData = fiscalTx?.responseData as { normalized?: { ebmInvoiceNumber?: string; verificationCode?: string; sdcDateTime?: string; intrlData?: string; vsdcSignature?: string } } | null | undefined
    const norm = responseData?.normalized

    const mrcNo = branch?.ebmSerialNo ?? org?.ebmSerialNo ?? null
    // Prefer the ID stamped in the successful RRA response. Configured device
    // values are a fallback only; this keeps the printed SDC identifier aligned
    // with the actual fiscal receipt.
    let sdcId = fiscalTx?.sdcId ?? branch?.ebmDeviceId ?? org?.ebmDeviceId ?? null
    // Proforma/training documents never get their own fiscalTx (never
    // submitted to VSDC), and the device may not have its ebmDeviceId
    // backfilled in Organization/Branch settings — but the SDC ID is a fixed
    // per-device identifier, so reuse the one this branch's device was last
    // handed back on any real, successfully-fiscalized sale.
    if (!sdcId) {
      const lastKnownDevice = await prisma.ebmTransaction.findFirst({
        where: { organizationId, sdcId: { not: null }, sale: { branchId: sale.branchId } },
        orderBy: { createdAt: "desc" },
        select: { sdcId: true },
      })
      sdcId = lastKnownDevice?.sdcId ?? null
    }
    const sdcRcptNo = fiscalTx?.sdcRcptNo ?? null
    const totalRcptNo = fiscalTx?.totalRcptNo ?? null
    const internalData = fiscalTx?.internalData ?? norm?.intrlData ?? null
    const receiptSignature = fiscalTx?.receiptSignature ?? norm?.vsdcSignature ?? norm?.verificationCode ?? null
    // Proforma has no fiscalTx (never sent to VSDC), so it has no VSDC-stamped
    // time either — fall back to the CIS's own creation time, same as the
    // spec's own proforma example still prints a date/time under SDC INFORMATION.
    const sdcDateTime = fiscalTx?.sdcDateTime ?? norm?.sdcDateTime ?? (sale.isProforma ? sale.createdAt : null)
    const ebmInvoiceNumber = fiscalTx?.ebmInvoiceNumber ?? norm?.ebmInvoiceNumber ?? sale.invoiceNumber ?? null
    const rcptLabel = fiscalTx?.rcptLabel ?? sale.rcptLabel ?? null
    // Proforma is never submitted to VSDC (see createSale step 4/7), so it never
    // has a fiscalTx/sdcRcptNo — it prints its own local, non-fiscal counter pair
    // instead: localReceiptSeq (this type only) / localReceiptTotalSeq (every
    // locally-numbered type combined), the same distinct-A/B shape as a real
    // VSDC counter (spec §7.25's own example: "168/258 NS" — two different numbers).
    const fiscalReceiptNumber = sdcRcptNo != null
      ? `${sdcRcptNo}/${totalRcptNo ?? sdcRcptNo}${rcptLabel ? ` ${rcptLabel}` : ""}`
      : sale.localReceiptSeq != null
        ? `${sale.localReceiptSeq}/${sale.localReceiptTotalSeq ?? sale.localReceiptSeq}${rcptLabel ? ` ${rcptLabel}` : ""}`
        : sale.saleNumber
    // The invoice number is the sequence submitted to VSDC (invcNo), not the
    // SDC device identifier. SDC ID and receipt counters are printed separately.
    const fiscalInvoiceNumber = sale.vsdcInvcNo != null
      ? String(sale.vsdcInvcNo)
      : ebmInvoiceNumber ?? sale.invoiceNumber ?? sale.saleNumber
    const originalReceiptNumber = sale.originalSale
      ? (sale.originalSale.vsdcInvcNo != null
          ? String(sale.originalSale.vsdcInvcNo)
          : sale.originalSale.invoiceNumber ?? sale.originalSale.saleNumber)
      : null

    const currency = org?.currency ?? "RWF"
    const toNumber = (v: unknown): number => (v == null ? 0 : typeof v === "number" ? v : Number(String(v)))
    const totalAmount = toNumber(sale.totalAmount)
    const cashAmount = toNumber(sale.cashAmount)
    const debtAmount = toNumber(sale.debtAmount)
    const insuranceAmount = toNumber(sale.insuranceAmount)
    const vatAmount = toNumber(sale.vatAmount)
    const taxableAmount = toNumber(sale.taxableAmount)
    // A refund stores every amount negative; compute the residual sale-level
    // discount on magnitudes and re-apply the document's sign so a refund
    // receipt shows the discount negative too (RRA checklist §56) instead of a
    // spurious positive value.
    const docSign = totalAmount < 0 ? -1 : 1
    const discountAmount = docSign * Math.max(
      0,
      Math.abs(totalAmount) - Math.abs(cashAmount) - Math.abs(debtAmount) - Math.abs(insuranceAmount) - Math.abs(vatAmount) - Math.abs(taxableAmount),
    )

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
        // Per-unit price always prints positive, refund or not — only qty and
        // the amounts derived from it (gross/net/total) carry the refund's
        // negative sign. qty is already stored negative for a refund line, so
        // qty*unitPrice still yields the correct negative line total below.
        unitPrice: Math.abs(unitPrice),
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
    // §56: keep the discount signed with the document (negative on a refund).
    const discount = docSign * Math.max(0, Math.round(Math.abs(itemDiscount) + Math.abs(discountAmount)))
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
        ebmLinked: isEbmLinked,
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
        // CIS/VSDC spec §7.18/§15: only ONE original printout is allowed —
        // reprintCount is incremented on every deliberate "download" of this
        // invoice's PDF, so the first download (count reaches 1) stays the
        // original and every one after (count > 1) renders as a COPY.
        isCopy: (sale.reprintCount ?? 0) > 1,
        currency,
        originalReceiptNumber,
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
        receiptNumber: (sdcRcptNo != null || sale.isProforma) ? fiscalReceiptNumber : null,
        receiptSignature,
        internalData,
        sdcDateTime: sdcDateTime ? String(sdcDateTime) : null,
        date: sdcDateTime ? new Date(sdcDateTime).toISOString() : null,
        time: sdcDateTime ? `${p2(new Date(sdcDateTime).getHours())}:${p2(new Date(sdcDateTime).getMinutes())}:${p2(new Date(sdcDateTime).getSeconds())}` : null,
        ebmInvoiceNumber: ebmInvoiceNumber,
        rcptLabel,
        poweredBy: SYSTEM_FOOTER,
        softwareVersion: CIS_VERSION_LABEL,
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
        poweredBy: SYSTEM_POWERED_BY,
      },
      footer: {
        message: "Thank you for your business.",
        note: null,
      },
    }

    return invoiceData
}

export const getInvoice = async (req: BranchAuthRequest, res: Response) => {
  try {
    const invoiceData = await composeInvoicePayload(req)
    if (!invoiceData) return res.status(404).json(apiError("Sale not found"))

    return res.json(success({
      ...invoiceData,
      renderedHtml: renderSalesInvoiceHtml(invoiceData),
    }))
  } catch (error: any) {
    if (error instanceof FiscalizationPendingError) {
      return res.status(425).json({ success: false, status: "pending_fiscalization", reason: error.reason, error: error.message })
    }
    console.error("[Get Invoice Error]:", error)
    return res.status(500).json(apiError("Failed to get invoice"))
  }
}

/** Authoritative backend-generated invoice PDF (A4, A5 or 80mm) for download, preview, sharing, and printing. */
export const getInvoicePdf = async (req: BranchAuthRequest, res: Response) => {
  try {
    const invoiceData = await composeInvoicePayload(req)
    if (!invoiceData) return res.status(404).json(apiError("Sale not found"))

    const q = String(req.query.format ?? "").toUpperCase()
    const format: InvoicePdfFormat = q === "80MM" ? "80mm" : q === "A5" ? "A5" : "A4"
    const pdf = format === "80mm"
      ? await generateEbmReceiptPdf80mm(invoiceData)
      : await generateEbmInvoicePdf(invoiceData, format === "A5" ? "A5" : "A4")
    const filename = getEbmInvoiceFilename(invoiceData, format)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Length", String(pdf.length))
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`)
    res.setHeader("Cache-Control", "private, no-store")
    return res.status(200).send(pdf)
  } catch (error: any) {
    if (error instanceof FiscalizationPendingError) {
      return res.status(425).json({ success: false, status: "pending_fiscalization", reason: error.reason, error: error.message })
    }
    console.error("[Get Invoice PDF Error]:", error)
    return res.status(500).json(apiError("Failed to generate invoice PDF"))
  }
}
