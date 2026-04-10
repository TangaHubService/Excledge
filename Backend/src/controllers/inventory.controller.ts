import type { Response } from "express"
import { prisma } from "../lib/prisma"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { buildBranchFilter, getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import { auditLogger } from "../utils/auditLogger"
import {
  adjustStock as ledgerAdjustStock,
  removeStock as ledgerRemoveStock,
  getCurrentStock,
  addStock as ledgerAddStock
} from "../services/inventory-ledger.service"
import { success, error as apiError } from "../utils/apiResponse"

export const getProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { search, category, expiryStatus, limit = "50", page = "1" } = req.query

    // Cap max limit to 500
    const limitNum = Math.min(Math.max(Number.parseInt(limit as string) || 50, 1), 500)
    const pageNum = Math.max(Number.parseInt(page as string) || 1, 1)
    const skip = (pageNum - 1) * limitNum

    const branchFilter = buildBranchFilter(req)
    const where: any = {
      organizationId,
      isActive: true,
      deletedAt: null,
    }

    if (branchFilter.branchId) {
      where.batches = {
        some: {
          branchId: branchFilter.branchId
        }
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { batchNumber: { contains: search as string, mode: "insensitive" } },
      ]
    }

    if (category) {
      where.category = category
    }

    const expiryCondition: any = {};
    if (expiryStatus === "expired") {
      expiryCondition.expiryDate = {
        not: null,
        lt: new Date(),
      }
    } else if (expiryStatus === "expiring") {
      expiryCondition.expiryDate = {
        not: null,
        gte: new Date(),
        lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      }
    } else {
      // DEFAULT: Exclude expired products
      expiryCondition.OR = [
        { expiryDate: null },
        { expiryDate: { gte: new Date() } }
      ];
    }

    // Combine into where using AND to avoid overwriting search's OR if present
    where.AND = [expiryCondition];

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { expiryDate: "asc" },
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ])

    // Calculate actual stock from ledger for each product (source of truth)
    // If no ledger entries exist, fall back to database quantity
    const branchForLedger =
      req.selectedBranchId !== null && req.selectedBranchId !== undefined
        ? req.selectedBranchId
        : undefined

    const productsWithStock = await Promise.all(
      products.map(async (product) => {
        const ledgerEntryCount = await prisma.inventoryLedger.count({
          where: {
            productId: product.id,
            organizationId: organizationId,
            ...(branchForLedger != null ? { branchId: branchForLedger } : {}),
          },
        });

        let actualStock;
        if (ledgerEntryCount === 0) {
          actualStock = product.quantity;
        } else {
          actualStock = await getCurrentStock(organizationId, product.id, branchForLedger);
        }

        return {
          ...product,
          quantity: actualStock,
        };
      })
    );


    // Count products where quantity is at or below minStock threshold
    // Prisma doesn't support direct field-to-field comparison, so we use a raw query
    const lowStockResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count
      FROM products
      WHERE "organizationId" = ${organizationId}
        AND quantity <= "minStock"
        AND "minStock" > 0
    `
    const lowStockProducts = Number(lowStockResult[0]?.count || 0)

    const expiredProducts = await prisma.product.count({
      where: {
        organizationId,
        expiryDate: {
          not: null,
          lt: new Date(),
        },
      },
    })

    const expiringProducts = await prisma.product.count({
      where: {
        organizationId,
        expiryDate: {
          not: null,
          gte: new Date(),
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      },
    })

    res.json(success({
      data: productsWithStock,
      lowStockProducts,
      expiredProducts,
      expiringProducts,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum,
      },
    }))
  } catch (error: any) {
    console.error("[Get Products Error]:", error)
    res.status(500).json(apiError("Failed to get products"))
  }
}

export const getProductById = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const product = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!product) {
      return res.status(404).json(apiError("Product not found"))
    }

    res.json(success(product))
  } catch (error: any) {
    console.error("[Get Product Error]:", error)
    res.status(500).json(apiError("Failed to get product"))
  }
}

export const createProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { name, batchNumber, quantity, unitPrice, imageUrl, expiryDate, category, description, minStock } = req.body
    const userId = parseInt((req as any).user?.userId as string)
    const branchId = getBranchIdForOperation(req)

    if (expiryDate && new Date(expiryDate) < new Date()) {
      return res.status(400).json(apiError("Expiry date cannot be in the past"))
    }

    // Use transaction to ensure product creation and ledger entry are atomic
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          batchNumber,
          quantity,
          unitPrice,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          category,
          description,
          imageUrl,
          minStock: minStock || 10,
          organizationId: organizationId!,
        },
      })

      // Create initial ledger entry if quantity > 0
      if (quantity > 0) {
        await ledgerAddStock({
          organizationId: organizationId!,
          productId: product.id,
          userId,
          quantity,
          movementType: 'INITIAL_STOCK',
          branchId: branchId || 0,
          reference: `INIT-${product.id}`,
          referenceType: 'INITIAL_STOCK',
          note: 'Initial stock from product creation',
          batchNumber,
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          tx, // Pass transaction client
        });
      }

      return product;
    });

    await auditLogger.inventory(req, {
      type: 'PRODUCT_CREATE',
      description: `Product "${result.name}" created successfully`,
      entityType: 'Product',
      entityId: result.id,
      metadata: {
        product: result,
      }
    });

    res.status(201).json(success(result))
  } catch (error: any) {
    console.error("[Create Product Error]:", error)
    res.status(500).json(apiError("Failed to create product"))
  }
}

export const createProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const products = req.body
    const userId = parseInt((req as any).user?.userId as string)

    const existingProducts = await prisma.product.findMany({
      where: {
        organizationId,
        batchNumber: {
          in: products.map((product: any) => product.batchNumber),
        },
      },
      select: {
        batchNumber: true,
        name: true,
      },
    });

    if (existingProducts.length > 0) {
      const duplicateBatchNumbers = existingProducts.map(p => p.batchNumber).join(', ');
      const duplicateCount = existingProducts.length;

      return res.status(400).json(apiError(duplicateCount === 1
        ? `Product with batch number "${duplicateBatchNumbers}" already exists`
        : `${duplicateCount} products with batch numbers already exist: ${duplicateBatchNumbers}`,
        undefined,
        existingProducts.map(p => ({
          batchNumber: p.batchNumber,
          name: p.name,
        })),
      ))
    }

    // Use transaction to ensure all products and ledger entries are created atomically
    const result = await prisma.$transaction(async (tx) => {
      await tx.product.createMany({
        data: products.map((product: any) => ({
          name: product.name,
          batchNumber: product.batchNumber,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          category: product.category,
          description: product.description,
          imageUrl: product.imageUrl,
          minStock: product.minStock,
          organizationId: organizationId!,
          expiryDate: product.expiryDate ? new Date(product.expiryDate) : null,
        })),
      });

      // Fetch created products to get their IDs
      const createdProducts = await tx.product.findMany({
        where: {
          organizationId: organizationId!,
          batchNumber: {
            in: products.map((p: any) => p.batchNumber),
          },
        },
      });

      // Create initial ledger entries for products with quantity > 0
      for (const product of createdProducts) {
        if (product.quantity > 0) {
          await ledgerAddStock({
            organizationId: organizationId!,
            productId: product.id,
            userId,
            quantity: product.quantity,
            movementType: 'INITIAL_STOCK',
            branchId: branchId || 0,
            reference: `INIT-${product.id}`,
            referenceType: 'INITIAL_STOCK',
            note: 'Initial stock from bulk import',
            batchNumber: product.batchNumber || undefined,
            expiryDate: product.expiryDate || undefined,
            tx, // Pass transaction client
          });
        }
      }

      return createdProducts;
    });

    await auditLogger.inventory(req, {
      type: 'PRODUCT_CREATE',
      description: 'Products created successfully (Bulk)',
      entityType: 'Product',
      entityId: "BULK",
      metadata: {
        count: result.length,
        products: result,
      }
    });

    res.status(201).json(success(result))
  } catch (error: any) {
    console.error("[Create Products Error]:", error)
    res.status(500).json(apiError("Failed to create products"))
  }
}

export const updateProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const updateData = req.body

    const existingProduct = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!existingProduct) {
      return res.status(404).json(apiError("Product not found"))
    }

    if (updateData.expiryDate && new Date(updateData.expiryDate) < new Date()) {
      return res.status(400).json(apiError("Expiry date cannot be in the past"))
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...updateData,
        expiryDate: updateData.expiryDate ? new Date(updateData.expiryDate) : null,
      },
    })

    await auditLogger.inventory(req, {
      type: 'PRODUCT_UPDATE',
      description: `Product "${product.name}" updated successfully`,
      entityType: 'Product',
      entityId: id,
      metadata: {
        previousData: existingProduct,
        updatedData: product,
      }
    });

    res.json(success(product))
  } catch (error: any) {
    console.error("[Update Product Error]:", error)
    res.status(500).json(apiError("Failed to update product"))
  }
}

export const deleteProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const existingProduct = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!existingProduct) {
      return res.status(404).json(apiError("Product not found"))
    }

    await prisma.product.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() }
    })

    await auditLogger.inventory(req, {
      type: 'PRODUCT_ARCHIVED',
      description: `Product "${existingProduct.name}" archived successfully`,
      entityType: 'Product',
      entityId: id,
      metadata: {
        product: existingProduct,
      }
    });

    res.json(success({ message: "Product archived successfully" }))
  } catch (error: any) {
    console.error("[Delete Product Error]:", error)
    res.status(500).json(apiError("Failed to delete product"))
  }
}

export const getExpiringProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { days = "30", limit = "10", page = "1" } = req.query

    const branchFilter = buildBranchFilter(req)
    const where: any = {
      organizationId,
      deletedAt: null,
      expiryDate: {
        not: null,
        gte: new Date(),
        lte: new Date(Date.now() + Number.parseInt(days as string) * 24 * 60 * 60 * 1000),
      },
    }

    if (branchFilter.branchId) {
      where.batches = {
        some: {
          branchId: branchFilter.branchId
        }
      }
    }

    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)
    const take = Number.parseInt(limit as string)

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { expiryDate: "asc" },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ])

    res.json(success({
      data: products,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / take),
        currentPage: Number.parseInt(page as string),
        limit: take,
      },
    }))
  } catch (error: any) {
    console.error("[Get Expiring Products Error]:", error)
    res.status(500).json(apiError("Failed to get expiring products"))
  }
}

export const getExpiredProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { days = "30", limit = "10", page = "1" } = req.query

    const branchFilter = buildBranchFilter(req)
    const where: any = {
      organizationId,
      deletedAt: null,
      expiryDate: {
        not: null,
        lt: new Date(),
      },
    }

    if (branchFilter.branchId) {
      where.batches = {
        some: {
          branchId: branchFilter.branchId
        }
      }
    }

    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)
    const take = Number.parseInt(limit as string)

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { expiryDate: "desc" },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ])

    res.json(success({
      data: products,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / take),
        currentPage: Number.parseInt(page as string),
        limit: take,
      },
    }))
  } catch (error: any) {
    console.error("[Get Expired Products Error]:", error)
    res.status(500).json(apiError("Failed to get expired products"))
  }
}

export const getLowStockProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const { limit = "10", page = "1", search, status } = req.query

    const minStock = await prisma.product.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        ...buildBranchFilter(req)
      },
      select: { minStock: true },
    })

    const baseMinStock = minStock?.minStock || 10

    const branchFilter = buildBranchFilter(req)
    const where: any = {
      organizationId,
      deletedAt: null,
      quantity: {
        lt: baseMinStock,
      },
    }

    if (branchFilter.branchId) {
      where.batches = {
        some: {
          branchId: branchFilter.branchId
        }
      }
    }

    // Add search filter (name, SKU, batch number)
    if (search && typeof search === 'string' && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { sku: { contains: search.trim(), mode: 'insensitive' } },
        { batchNumber: { contains: search.trim(), mode: 'insensitive' } },
      ]
    }

    // Add status filter
    if (status && typeof status === 'string' && status !== 'all') {
      const statusFilter = status.toLowerCase()
      if (statusFilter === 'critical') {
        // Critical: quantity <= 25% of minStock
        where.quantity = {
          ...where.quantity,
          lte: Math.floor(baseMinStock * 0.25),
        }
      } else if (statusFilter === 'low') {
        // Low: quantity > 25% and <= 50% of minStock
        where.AND = [
          { quantity: { gt: Math.floor(baseMinStock * 0.25) } },
          { quantity: { lte: Math.floor(baseMinStock * 0.5) } },
        ]
        delete where.quantity
      } else if (statusFilter === 'warning') {
        // Warning: quantity > 50% and < minStock
        where.AND = [
          { quantity: { gt: Math.floor(baseMinStock * 0.5) } },
          { quantity: { lt: baseMinStock } },
        ]
        delete where.quantity
      }
    }

    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)
    const take = Number.parseInt(limit as string)

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { quantity: "asc" },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ])

    res.json(success({
      data: products,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / take),
        currentPage: Number.parseInt(page as string),
        limit: take,
      },
    }))
  } catch (error: any) {
    console.error("[Get Low Stock Products Error]:", error)
    res.status(500).json(apiError("Failed to get low stock products"))
  }
}

export const adjustStock = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const { quantity, note } = req.body;
    const userId = parseInt((req as any).user?.userId as string);
    const branchId = getBranchIdForOperation(req);

    const product = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!product) {
      return res.status(404).json(apiError("Product not found"));
    }

    // Use ledger service for adjustments
    const ledgerEntry = await ledgerAdjustStock({
      organizationId: organizationId!,
      productId: id,
      userId: userId!,
      quantity: quantity, // Can be positive or negative
      branchId: branchId ?? null,
      reference: `ADJ-${id}-${Date.now()}`,
      referenceType: 'ADJUSTMENT',
      note: note || "Manual adjustment",
    });

    await auditLogger.inventory(req, {
      type: 'STOCK_ADJUSTMENT',
      description: `Stock for "${product.name}" adjusted: ${quantity > 0 ? '+' : ''}${quantity}`,
      entityType: 'Product',
      entityId: id,
      metadata: {
        previousStock: (ledgerEntry as any).runningBalance - quantity,
        newStock: (ledgerEntry as any).runningBalance,
        adjustment: quantity,
      }
    });

    res.json(success(ledgerEntry));
  } catch (error: any) {
    console.error("[Adjust Stock Error]:", error);
    res.status(500).json(apiError(error.message || "Failed to adjust stock"));
  }
};

export const markAsDamage = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const { quantity, note } = req.body;
    const userId = parseInt((req as any).user?.userId as string);
    const branchId = getBranchIdForOperation(req);

    const product = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!product) {
      return res.status(404).json(apiError("Product not found"));
    }

    if (quantity > product.quantity) {
      return res.status(400).json(apiError("Damage quantity exceeds current stock"));
    }

    // Use ledger service for damage (Stock OUT)
    const ledgerEntry = await ledgerRemoveStock({
      organizationId: organizationId!,
      productId: id,
      userId: userId!,
      quantity: quantity,
      movementType: 'DAMAGE',
      branchId: branchId ?? null,
      reference: `DAMAGE-${id}-${Date.now()}`,
      referenceType: 'DAMAGE',
      note: note || "Marked as damage",
    });

    await auditLogger.inventory(req, {
      type: 'STOCK_DECREASED',
      description: `Damaged stock removed for "${product.name}": -${quantity}`,
      entityType: 'Product',
      entityId: id,
      metadata: {
        quantity,
        reason: 'DAMAGE',
        note,
        newBalance: (ledgerEntry as any).runningBalance
      }
    });

    res.json(success(ledgerEntry));
  } catch (error: any) {
    console.error("[Mark Damage Error]:", error);
    res.status(500).json(apiError(error.message || "Failed to mark damage"));
  }
};

export const processExpiredStock = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const { quantity, note } = req.body;
    const userId = parseInt((req as any).user?.userId as string);
    const branchId = getBranchIdForOperation(req);

    const product = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!product) {
      return res.status(404).json(apiError("Product not found"));
    }

    const qtyToRemove = quantity || product.quantity;

    // Use ledger service for expired stock (Stock OUT)
    const ledgerEntry = await ledgerRemoveStock({
      organizationId: organizationId!,
      productId: id,
      userId: userId!,
      quantity: qtyToRemove,
      movementType: 'EXPIRED',
      branchId: branchId ?? null,
      reference: `EXPIRED-${id}-${Date.now()}`,
      referenceType: 'EXPIRED',
      note: note || "Processed expired stock",
    });

    await auditLogger.inventory(req, {
      type: 'STOCK_DECREASED',
      description: `Expired stock processed for "${product.name}": -${qtyToRemove}`,
      entityType: 'Product',
      entityId: id,
      metadata: {
        quantity: qtyToRemove,
        reason: 'EXPIRED',
        note,
        newBalance: (ledgerEntry as any).runningBalance
      }
    });

    res.json(success(ledgerEntry));
  } catch (error: any) {
    console.error("[Process Expired Error]:", error);
    res.status(500).json(apiError(error.message || "Failed to process expired stock"));
  }
};
