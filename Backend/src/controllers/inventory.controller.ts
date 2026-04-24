import type { Response } from "express"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import { auditLogger } from "../utils/auditLogger"
import { success, error as apiError } from "../utils/apiResponse"
import { InventoryService, CreateProductInput, ProductFilterParams, LowStockFilterParams } from "../services/inventory.service"

export const getProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { search, category, expiryStatus, limit = "50", page = "1" } = req.query

    const params: ProductFilterParams = {
      organizationId,
      branchId,
      search: search as string,
      category: category as string,
      expiryStatus: expiryStatus as string,
      limit: limit ? parseInt(limit as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
    }

    const result = await InventoryService.getProducts(params)
    res.json(success(result))
  } catch (err: any) {
    console.error("[Get Products Error]:", err)
    res.status(500).json(apiError("Failed to get products"))
  }
}

export const getProductById = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const product = await InventoryService.getProductById(id, organizationId)

    if (!product) {
      return res.status(404).json(apiError("Product not found"))
    }

    res.json(success(product))
  } catch (err: any) {
    console.error("[Get Product Error]:", err)
    res.status(500).json(apiError("Failed to get product"))
  }
}

export const createProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const userId = parseInt(req.user?.userId as string)
    const branchId = getBranchIdForOperation(req)

    const input: CreateProductInput = {
      name: req.body.name,
      sku: req.body.sku,
      itemCode: req.body.itemCode,
      itemClassCode: req.body.itemClassCode,
      packageUnitCode: req.body.packageUnitCode,
      quantityUnitCode: req.body.quantityUnitCode,
      batchNumber: req.body.batchNumber,
      quantity: req.body.quantity,
      unitPrice: req.body.unitPrice,
      imageUrl: req.body.imageUrl,
      expiryDate: req.body.expiryDate,
      category: req.body.category,
      description: req.body.description,
      minStock: req.body.minStock,
      taxCategory: req.body.taxCategory,
      barcode: req.body.barcode,
    }

    const result = await InventoryService.createProduct(input, organizationId, userId, branchId)

    await auditLogger.inventory(req, {
      type: 'PRODUCT_CREATE',
      description: `Product "${result.name}" created successfully`,
      entityType: 'Product',
      entityId: result.id,
      metadata: { product: result },
    })

    res.status(201).json(success(result))
  } catch (err: any) {
    console.error("[Create Product Error]:", err)
    if (err.message && err.message.includes('Expiry date')) {
      return res.status(400).json(apiError(err.message))
    }
    res.status(500).json(apiError(err.message || "Failed to create product"))
  }
}

export const createProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const products = req.body
    const userId = parseInt(req.user?.userId as string)

    const input: CreateProductInput[] = products.map((p: any) => ({
      name: p.name,
      sku: p.sku,
      itemCode: p.itemCode,
      itemClassCode: p.itemClassCode,
      packageUnitCode: p.packageUnitCode,
      quantityUnitCode: p.quantityUnitCode,
      batchNumber: p.batchNumber,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      category: p.category,
      description: p.description,
      imageUrl: p.imageUrl,
      minStock: p.minStock,
      taxCategory: p.taxCategory,
      barcode: p.barcode,
      expiryDate: p.expiryDate,
    }))

    const result = await InventoryService.createProducts(input, organizationId, userId, branchId)

    await auditLogger.inventory(req, {
      type: 'PRODUCT_CREATE',
      description: 'Products created successfully (Bulk)',
      entityType: 'Product',
      entityId: "BULK",
      metadata: { count: result.length, products: result },
    })

    res.status(201).json(success(result))
  } catch (err: any) {
    console.error("[Create Products Error]:", err)
    if (err.message && err.message.includes('already exists')) {
      return res.status(400).json(apiError(err.message, undefined, err.duplicates))
    }
    res.status(500).json(apiError(err.message || "Failed to create products"))
  }
}

export const updateProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const updateData = req.body

    const existingProduct = await InventoryService.getProductById(id, organizationId)

    if (!existingProduct) {
      return res.status(404).json(apiError("Product not found"))
    }

    const product = await InventoryService.updateProduct(id, organizationId, updateData)

    await auditLogger.inventory(req, {
      type: 'PRODUCT_UPDATE',
      description: `Product "${product.name}" updated successfully`,
      entityType: 'Product',
      entityId: id,
      metadata: { previousData: existingProduct, updatedData: product },
    })

    res.json(success(product))
  } catch (err: any) {
    console.error("[Update Product Error]:", err)
    if (err.message && err.message.includes('Expiry date')) {
      return res.status(400).json(apiError(err.message))
    }
    res.status(500).json(apiError(err.message || "Failed to update product"))
  }
}

export const deleteProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const existingProduct = await InventoryService.getProductById(id, organizationId)

    if (!existingProduct) {
      return res.status(404).json(apiError("Product not found"))
    }

    await InventoryService.deleteProduct(id, organizationId)

    await auditLogger.inventory(req, {
      type: 'PRODUCT_ARCHIVED',
      description: `Product "${existingProduct.name}" archived successfully`,
      entityType: 'Product',
      entityId: id,
      metadata: { product: existingProduct },
    })

    res.json(success({ message: "Product archived successfully" }))
  } catch (err: any) {
    console.error("[Delete Product Error]:", err)
    res.status(500).json(apiError(err.message || "Failed to delete product"))
  }
}

export const getExpiringProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { days = "30", limit = "10", page = "1" } = req.query

    const result = await InventoryService.getExpiringProducts(
      organizationId,
      branchId,
      parseInt(days as string),
      parseInt(limit as string),
      parseInt(page as string)
    )

    res.json(success(result))
  } catch (err: any) {
    console.error("[Get Expiring Products Error]:", err)
    res.status(500).json(apiError("Failed to get expiring products"))
  }
}

export const getExpiredProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { limit = "10", page = "1" } = req.query

    const result = await InventoryService.getExpiredProducts(
      organizationId,
      branchId,
      parseInt(limit as string),
      parseInt(page as string)
    )

    res.json(success(result))
  } catch (err: any) {
    console.error("[Get Expired Products Error]:", err)
    res.status(500).json(apiError("Failed to get expired products"))
  }
}

export const getLowStockProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const { limit = "10", page = "1", search, status } = req.query

    const params: LowStockFilterParams = {
      organizationId,
      branchId,
      search: search as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
    }

    const result = await InventoryService.getLowStockProducts(params)
    res.json(success(result))
  } catch (err: any) {
    console.error("[Get Low Stock Products Error]:", err)
    res.status(500).json(apiError("Failed to get low stock products"))
  }
}

export const adjustStock = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { quantity, note } = req.body
    const userId = parseInt(req.user?.userId as string)
    const branchId = getBranchIdForOperation(req)

    const product = await InventoryService.getProductById(id, organizationId)

    if (!product) {
      return res.status(404).json(apiError("Product not found"))
    }

    const ledgerEntry = await InventoryService.adjustStock(
      id,
      organizationId,
      userId,
      quantity,
      branchId,
      note
    )

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
    })

    res.json(success(ledgerEntry))
  } catch (err: any) {
    console.error("[Adjust Stock Error]:", err)
    res.status(500).json(apiError(err.message || "Failed to adjust stock"))
  }
}

export const markAsDamage = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { quantity, note } = req.body
    const userId = parseInt(req.user?.userId as string)
    const branchId = getBranchIdForOperation(req)

    const product = await InventoryService.getProductById(id, organizationId)

    if (!product) {
      return res.status(404).json(apiError("Product not found"))
    }

    if (quantity > product.quantity) {
      return res.status(400).json(apiError("Damage quantity exceeds current stock"))
    }

    const ledgerEntry = await InventoryService.markAsDamage(
      id,
      organizationId,
      userId,
      quantity,
      branchId,
      note
    )

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
    })

    res.json(success(ledgerEntry))
  } catch (err: any) {
    console.error("[Mark Damage Error]:", err)
    res.status(500).json(apiError(err.message || "Failed to mark damage"))
  }
}

export const processExpiredStock = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { quantity, note } = req.body
    const userId = parseInt(req.user?.userId as string)
    const branchId = getBranchIdForOperation(req)

    const product = await InventoryService.getProductById(id, organizationId)

    if (!product) {
      return res.status(404).json(apiError("Product not found"))
    }

    const ledgerEntry = await InventoryService.processExpiredStock(
      id,
      organizationId,
      userId,
      quantity,
      branchId,
      note
    )

    await auditLogger.inventory(req, {
      type: 'STOCK_DECREASED',
      description: `Expired stock processed for "${product.name}": -${quantity || product.quantity}`,
      entityType: 'Product',
      entityId: id,
      metadata: {
        quantity: quantity || product.quantity,
        reason: 'EXPIRED',
        note,
        newBalance: (ledgerEntry as any).runningBalance
      }
    })

    res.json(success(ledgerEntry))
  } catch (err: any) {
    console.error("[Process Expired Error]:", err)
    res.status(500).json(apiError(err.message || "Failed to process expired stock"))
  }
}