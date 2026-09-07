import type { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import type { BranchAuthRequest } from "../middleware/branchAuth.middleware"
import { buildBranchFilter, getBranchIdForOperation } from "../middleware/branchAuth.middleware"
import { auditLogger } from "../utils/auditLogger"
import {
  adjustStock as ledgerAdjustStock,
  removeStock as ledgerRemoveStock,
  addStock as ledgerAddStock
} from "../services/inventory-ledger.service"
import { syncProductToRraAsync } from "../services/product-sync.service"
import { TaxService } from "../services/tax.service"
import { allocateItemCd, allocateItemCdBlock, buildItemCd, deriveQtyUnitCd, isItemCdConflict } from "../services/item-code.service"
import { success, error as apiError } from "../utils/apiResponse"
import { getOrganizationSettings } from "../services/organization-settings.service"
import { getOrderBy } from "../utils/sorting"

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

    // Default: show all items. Optionally filter by type.
    const itemType = req.query.itemType as string | undefined
    if (itemType === 'PRODUCT' || itemType === 'SERVICE') {
      where.itemType = itemType
    }

    // SERVICE items carry no batch rows (not stock-tracked), so the branch
    // scoping must not exclude them — only PRODUCT rows need a matching batch.
    const branchCondition = branchFilter.branchId
      ? {
          OR: [
            { itemType: 'SERVICE' },
            { batches: { some: { branchId: branchFilter.branchId } } },
          ],
        }
      : null

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { sku: { contains: search as string, mode: "insensitive" } },
        { barcode: { contains: search as string, mode: "insensitive" } },
        { batchNumber: { contains: search as string, mode: "insensitive" } },
      ]
    }

    if (category) {
      where.category = category
    }

    // Expiry filter — default excludes expired products from the listing
    if (expiryStatus === "expired") {
      where.expiryDate = { not: null, lt: new Date() }
    } else if (expiryStatus === "expiring") {
      where.expiryDate = {
        not: null,
        gte: new Date(),
        lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      }
    } else {
      // DEFAULT: Exclude expired products from listing
      const expiryFilter = {
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: new Date() } },
        ],
      }
      // If search OR exists, nest under AND to avoid overwrite
      where.AND = where.OR
        ? [expiryFilter, { OR: where.OR }]
        : [expiryFilter]
      delete where.OR
    }

    if (branchCondition) {
      where.AND = where.AND ? [...where.AND, branchCondition] : [branchCondition]
    }

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: getOrderBy(req.query, {
          id: { id: '$direction' },
          name: { name: '$direction' },
          sku: { sku: '$direction' },
          batchNumber: { batchNumber: '$direction' },
          barcode: { barcode: '$direction' },
          category: { category: '$direction' },
          sellingPrice: { sellingPrice: '$direction' },
          costPrice: { costPrice: '$direction' },
          minStock: { minStock: '$direction' },
          quantity: { quantity: '$direction' },
          expiryDate: { expiryDate: '$direction' },
          createdAt: { createdAt: '$direction' },
        }, 'expiryDate', 'asc'),
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ])

    // -------------------------------------------------------
    // 1. Single-pass stock aggregation from batches
    // -------------------------------------------------------
    const branchForLedger =
      req.selectedBranchId !== null && req.selectedBranchId !== undefined
        ? req.selectedBranchId
        : undefined

    const productIds = products.map(p => p.id);
    const stockMap: Record<number, number> = {};

    if (productIds.length > 0) {
      const batchWhere: any = {
        organizationId,
        productId: { in: productIds },
        isActive: true,
      };
      if (branchForLedger !== undefined) {
        batchWhere.branchId = branchForLedger;
      }

      const batchAggregates = await prisma.batch.groupBy({
        by: ['productId'],
        where: batchWhere,
        _sum: { quantity: true },
      });

      for (const pid of productIds) { stockMap[pid] = 0; }
      for (const row of batchAggregates) {
        stockMap[row.productId] = row._sum.quantity || 0;
      }
    }

    const productsWithStock = products.map(product => ({
      ...product,
      quantity: stockMap[product.id] ?? 0,
    }));

    // -------------------------------------------------------
    // 2. Branch-scoped low-stock count (raw SQL)
    // -------------------------------------------------------
    const lowStockProducts = branchForLedger !== undefined
      ? Number((await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::int as count
          FROM products p
          WHERE p."organizationId" = ${organizationId}
            AND p."isActive" = true
            AND p."deletedAt" IS NULL
            AND p."minStock" > 0
            AND (
              SELECT COALESCE(SUM(b.quantity), 0)
              FROM batches b
              WHERE b."productId" = p.id
                AND b."branchId" = ${branchForLedger}
                AND b."isActive" = true
            ) <= p."minStock"
        `)[0]?.count || 0)
      : Number((await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::int as count
          FROM products p
          WHERE p."organizationId" = ${organizationId}
            AND p."isActive" = true
            AND p."deletedAt" IS NULL
            AND p."minStock" > 0
            AND p.quantity <= p."minStock"
        `)[0]?.count || 0)

    const branchScope = branchForLedger !== undefined
      ? { batches: { some: { branchId: branchForLedger } } }
      : {}

    const expiredProducts = await prisma.product.count({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        ...branchScope,
        expiryDate: { not: null, lt: new Date() },
      },
    })

    const expiringProducts = await prisma.product.count({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        ...branchScope,
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
    const { name, batchNumber, quantity, unitPrice, purchasePrice, imageUrl, expiryDate, category, description, minStock, sku, taxCategory, taxCode, measurementUnit, barcode, itemType, pkgUnitCd, qtyUnitCd, packagingQty, itemClsCd, itemStandardName, origin, useInsurance, additionalInfo, l1SalePrice, l2SalePrice, l3SalePrice, l4SalePrice, l5SalePrice } = req.body
    const userId = parseInt((req as any).user?.userId as string)
    const branchId = getBranchIdForOperation(req)
    const isService = itemType === 'SERVICE'

    if (expiryDate && new Date(expiryDate) < new Date() && !isService) {
      return res.status(400).json(apiError("Expiry date cannot be in the past"))
    }

    // Duplicate batchNumber check for PRODUCT items only
    if (batchNumber && !isService) {
      const existingProduct = await prisma.product.findFirst({
        where: {
          organizationId,
          batchNumber,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (existingProduct) {
        return res.status(400).json(apiError(
          `Product with batch number "${batchNumber}" already exists (${existingProduct.name})`
        ));
      }
    }

    // Duplicate barcode check — a barcode identifies a specific physical item,
    // so two active products in the same org must never share one.
    if (barcode) {
      const existingBarcode = await prisma.product.findFirst({
        where: {
          organizationId,
          barcode,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });

      if (existingBarcode) {
        return res.status(400).json(apiError(
          `Product with barcode "${barcode}" already exists (${existingBarcode.name})`
        ));
      }
    }

    // Tax category is the RRA code A/B/C/D. Validate it, then keep the legacy
    // TaxCategory enum in sync (A=EXEMPT, B=STANDARD, C=ZERO_RATED, D=NON_TAXABLE).
    const normalizedTaxCode = taxCode
      ? String(taxCode).toUpperCase()
      : (taxCategory ? TaxService.getTaxCode(taxCategory) : 'B');
    if (!TaxService.ALLOWED_TAX_CODES.has(normalizedTaxCode as any)) {
      return res.status(400).json(apiError(
        `Invalid tax category "${taxCode}". Must be one of A, B, C or D.`
      ));
    }

    // The RRA item code (itemCd) is derived, not user-entered — VSDC spec
    // §4.17: RW + product-type digit + pkgUnitCd + qtyUnitCd + sequence.
    // qtyUnitCd is likewise derived from measurementUnit rather than asked
    // for separately, since the UI only ever collects measurementUnit/pkgUnitCd.
    const resolvedItemType = (isService ? 'SERVICE' : (itemType || 'PRODUCT')) as 'PRODUCT' | 'SERVICE'
    const resolvedQtyUnitCd = qtyUnitCd || deriveQtyUnitCd(measurementUnit)

    const createProductInTx = async (tx: any) => {
      // Allocated from the same atomic per-organization counter table the
      // create() below runs against, inside this same transaction, so a
      // sequence number is only ever consumed if the product actually commits
      // — no gap is left behind if create() fails for an unrelated reason.
      const itemCd = await allocateItemCd(organizationId!, resolvedItemType, pkgUnitCd, resolvedQtyUnitCd, tx)
      const product = await tx.product.create({
        data: {
          name,
          batchNumber: isService ? null : batchNumber,
          quantity: isService ? 0 : (quantity || 0),
          unitPrice,
          purchasePrice: isService ? null : (purchasePrice != null && purchasePrice !== '' ? purchasePrice : null),
          expiryDate: isService ? null : (expiryDate ? new Date(expiryDate) : null),
          category: category || (isService ? 'Services' : undefined),
          description,
          imageUrl,
          minStock: isService ? 0 : (minStock || 10),
          organizationId: organizationId!,
          sku,
          taxCategory: TaxService.getTaxCategory(normalizedTaxCode as any),
          taxCode: normalizedTaxCode as any,
          measurementUnit: measurementUnit || 'OTHER',
          itemType,
          barcode,
          pkgUnitCd: isService ? null : (pkgUnitCd || null),
          qtyUnitCd: resolvedQtyUnitCd,
          packagingQty: isService ? null : (packagingQty != null && packagingQty !== '' ? packagingQty : null),
          itemCd,
          itemClsCd: itemClsCd || null,
          itemStandardName: itemStandardName || null,
          origin: origin || 'RW',
          useInsurance: !!useInsurance,
          additionalInfo: additionalInfo || null,
          l1SalePrice: l1SalePrice != null && l1SalePrice !== '' ? l1SalePrice : null,
          l2SalePrice: l2SalePrice != null && l2SalePrice !== '' ? l2SalePrice : null,
          l3SalePrice: l3SalePrice != null && l3SalePrice !== '' ? l3SalePrice : null,
          l4SalePrice: l4SalePrice != null && l4SalePrice !== '' ? l4SalePrice : null,
          l5SalePrice: l5SalePrice != null && l5SalePrice !== '' ? l5SalePrice : null,
        },
      })

      // Skip batch and ledger for SERVICE items — no inventory tracking
      if (!isService) {
        // Create batch record to link product to branch. Cost basis is the
        // purchase price (what was actually paid for stock) — falling back to
        // the sales price only when no purchase price was provided.
        const batchUnitCost = purchasePrice != null && purchasePrice !== ''
          ? Number(purchasePrice)
          : (unitPrice ? Number(unitPrice) : 0);
        const batchName = batchNumber || `DEFAULT-${product.id}`;
        await tx.batch.upsert({
          where: {
            productId_batchNumber_branchId: {
              productId: product.id,
              batchNumber: batchName,
              branchId,
            }
          },
          update: {
            quantity: { increment: quantity || 0 },
            unitCost: batchUnitCost,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            isActive: true,
          },
          create: {
            productId: product.id,
            organizationId: organizationId!,
            branchId,
            batchNumber: batchName,
            quantity: quantity || 0,
            unitCost: batchUnitCost,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            isActive: true,
          },
        });

        // Create initial ledger entry for branch-scoped stock tracking
        await ledgerAddStock({
          organizationId: organizationId!,
          productId: product.id,
          userId,
          quantity: quantity || 0,
          movementType: 'INITIAL_STOCK',
          branchId,
          reference: `INIT-${product.id}`,
          referenceType: 'INITIAL_STOCK',
          note: 'Initial stock from product creation',
          batchNumber,
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          tx,
        });
      }

      return product;
    }

    // itemCd is allocated from an atomic per-organization counter (see
    // createProductInTx above), so a genuine collision shouldn't happen —
    // this retry is a defensive fallback for the same transient-error class
    // openShift() in shift.service.ts retries on.
    let result: any
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = await prisma.$transaction((tx) => createProductInTx(tx))
        break
      } catch (err) {
        if (!isItemCdConflict(err) || attempt === 4) {
          throw err
        }
        // Conflict on itemCd — loop again to allocate the next sequence number.
      }
    }

    await auditLogger.inventory(req, {
      type: 'PRODUCT_CREATE',
      description: `Product "${result.name}" created successfully`,
      entityType: 'Product',
      entityId: result.id,
      metadata: {
        product: result,
      }
    });

    syncProductToRraAsync(result.id, userId);

    res.status(201).json(success(result))
  } catch (error: any) {
    if (error.message && error.message.includes('already exists')) {
      return res.status(400).json(apiError(error.message))
    }
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field'
      return res.status(409).json(apiError(`A product with this ${field} already exists`))
    }
    if (error.code === 'P2021' || error.message?.includes('does not exist') || error.code === '42704') {
      console.error('[Schema Error]', error.message)
      return res.status(500).json(apiError('Temporary system error. Please try again.'))
    }
    console.error("[Create Product Error]:", error)
    const message = process.env.NODE_ENV === 'development'
      ? `Failed to create product: ${error.message}`
      : 'Failed to create product'
    res.status(500).json(apiError(message))
  }
}

export const createProducts = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId)
    const branchId = getBranchIdForOperation(req)
    const products = req.body
    const userId = parseInt((req as any).user?.userId as string)

    // Filter out PRODUCT items without batch numbers (services are fine without)
    const productsWithBatch = products.filter((p: any) => p.batchNumber && p.itemType !== 'SERVICE');
    const batchNumbers = productsWithBatch.map((p: any) => p.batchNumber);

    if (batchNumbers.length > 0) {
      // Check for existing Products with matching batch numbers
      const existingProducts = await prisma.product.findMany({
        where: {
          organizationId,
          batchNumber: { in: batchNumbers },
          deletedAt: null,
        },
        select: { batchNumber: true, name: true },
      });

      if (existingProducts.length > 0) {
        const duplicates = existingProducts.map(p => p.batchNumber).join(', ');
        return res.status(400).json(apiError(
          existingProducts.length === 1
            ? `Product with batch number "${duplicates}" already exists`
            : `${existingProducts.length} products with batch numbers already exist: ${duplicates}`,
          undefined,
          existingProducts.map(p => ({
            batchNumber: p.batchNumber,
            name: p.name,
          })),
        ))
      }

      // Also check for existing Batches that would violate the compound unique key
      // (productId_batchNumber_branchId). Since batches reference products via FK,
      // a batch can only exist if its product does. This catches any edge case
      // where a product exists but was missed by the above check.
      const existingBatches = await prisma.batch.findMany({
        where: {
          organizationId,
          branchId,
          batchNumber: { in: batchNumbers },
          isActive: true,
        },
        select: {
          batchNumber: true,
          product: { select: { name: true } },
        },
      });

      if (existingBatches.length > 0) {
        const conflictBatchNumbers = existingBatches.map(b => b.batchNumber).join(', ');
        return res.status(400).json(apiError(
          `Batch records already exist for: ${conflictBatchNumbers}`
        ));
      }
    }

    // Duplicate barcode check — both against existing products and within
    // the incoming batch itself (two rows in the same upload sharing one code).
    const incomingBarcodes: string[] = products
      .map((p: any) => p.barcode)
      .filter((b: any) => typeof b === 'string' && b.trim() !== '');

    if (incomingBarcodes.length > 0) {
      const seen = new Set<string>();
      const withinBatchDupes = new Set<string>();
      for (const b of incomingBarcodes) {
        if (seen.has(b)) withinBatchDupes.add(b);
        seen.add(b);
      }
      if (withinBatchDupes.size > 0) {
        return res.status(400).json(apiError(
          `Duplicate barcode(s) within the upload: ${[...withinBatchDupes].join(', ')}`
        ));
      }

      const existingBarcodeProducts = await prisma.product.findMany({
        where: {
          organizationId,
          barcode: { in: incomingBarcodes },
          deletedAt: null,
        },
        select: { barcode: true, name: true },
      });

      if (existingBarcodeProducts.length > 0) {
        const duplicates = existingBarcodeProducts.map(p => `${p.barcode} (${p.name})`).join(', ');
        return res.status(400).json(apiError(
          `Barcode(s) already in use: ${duplicates}`
        ));
      }
    }

    // Use transaction to ensure all products, batches, and ledger entries are atomic.
    // itemCd sequence numbers are allocated as one contiguous block (base count
    // + row index) inside the same transaction as the createMany, so a whole
    // retry of the transaction on conflict re-allocates a fresh block — same
    // conflict-retry pattern as createProduct/openShift.
    let result: any
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = await prisma.$transaction(async (tx) => {
          const itemCdBase = await allocateItemCdBlock(organizationId!, products.length, tx);

          await tx.product.createMany({
            data: products.map((product: any, index: number) => {
              const isService = product.itemType === 'SERVICE';
              const resolvedItemType = (isService ? 'SERVICE' : (product.itemType || 'PRODUCT')) as 'PRODUCT' | 'SERVICE'
              const resolvedQtyUnitCd = product.qtyUnitCd || deriveQtyUnitCd(product.measurementUnit)
              return {
                name: product.name,
                batchNumber: isService ? null : product.batchNumber,
                quantity: isService ? 0 : (product.quantity || 0),
                unitPrice: product.unitPrice,
                purchasePrice: isService ? null : (product.purchasePrice != null && product.purchasePrice !== '' ? product.purchasePrice : null),
                category: product.category || (isService ? 'Services' : undefined),
                description: product.description,
                imageUrl: product.imageUrl,
                minStock: isService ? 0 : (product.minStock || 10),
                organizationId: organizationId!,
                expiryDate: isService ? null : (product.expiryDate ? new Date(product.expiryDate) : null),
                sku: product.sku,
                taxCategory: product.taxCategory || 'STANDARD',
                taxCode: product.taxCode,
                measurementUnit: product.measurementUnit || 'OTHER',
                itemType: product.itemType || 'PRODUCT',
                barcode: isService ? null : product.barcode,
                pkgUnitCd: isService ? null : (product.pkgUnitCd || null),
                qtyUnitCd: resolvedQtyUnitCd,
                packagingQty: isService ? null : (product.packagingQty != null && product.packagingQty !== '' ? product.packagingQty : null),
                itemCd: buildItemCd(resolvedItemType, product.pkgUnitCd, resolvedQtyUnitCd, itemCdBase + index + 1),
              };
            }),
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

          // Create batch records and initial ledger entries for each product
          // Skip batch/ledger for SERVICE items — no inventory tracking
          for (const product of createdProducts) {
            if (product.itemType === 'SERVICE') continue;

            const batchUnitCost = product.purchasePrice != null
              ? Number(product.purchasePrice)
              : (product.unitPrice ? Number(product.unitPrice) : 0);
            const batchName = product.batchNumber || `DEFAULT-${product.id}`;
            await tx.batch.upsert({
              where: {
                productId_batchNumber_branchId: {
                  productId: product.id,
                  batchNumber: batchName,
                  branchId,
                }
              },
              update: {
                quantity: { increment: product.quantity || 0 },
                unitCost: batchUnitCost,
                expiryDate: product.expiryDate || null,
                isActive: true,
              },
              create: {
                productId: product.id,
                organizationId: organizationId!,
                branchId,
                batchNumber: batchName,
                quantity: product.quantity || 0,
                unitCost: batchUnitCost,
                expiryDate: product.expiryDate || null,
                isActive: true,
              },
            });

            if (product.quantity > 0) {
              await ledgerAddStock({
                organizationId: organizationId!,
                productId: product.id,
                userId,
                quantity: product.quantity,
                movementType: 'INITIAL_STOCK',
                branchId,
                reference: `INIT-${product.id}`,
                referenceType: 'INITIAL_STOCK',
                note: 'Initial stock from bulk import',
                batchNumber: product.batchNumber || undefined,
                expiryDate: product.expiryDate || undefined,
                tx,
              });
            }
          }

          return createdProducts;
        });
        break
      } catch (err) {
        if (!isItemCdConflict(err) || attempt === 4) {
          throw err
        }
        // Conflict on itemCd — loop again to re-allocate the sequence block.
      }
    }

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

    for (const created of result) {
      syncProductToRraAsync(created.id, userId)
    }

    res.status(201).json(success(result))
  } catch (error: any) {
    // Distinguish validation errors from server errors
    if (error.message && (error.message.includes('already exists') || error.message.includes('already exist'))) {
      return res.status(400).json(apiError(error.message))
    }
    console.error("[Create Products Error]:", error)
    res.status(500).json(apiError("Failed to create products"))
  }
}

export const updateProduct = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { name, batchNumber, quantity, unitPrice, purchasePrice, imageUrl, expiryDate, category, description, minStock, sku, barcode, taxCode, measurementUnit, itemType, pkgUnitCd, qtyUnitCd, packagingQty, itemClsCd, itemStandardName, origin, useInsurance, additionalInfo, l1SalePrice, l2SalePrice, l3SalePrice, l4SalePrice, l5SalePrice } = req.body
    const userId = parseInt((req as any).user?.userId as string)

    const existingProduct = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!existingProduct) {
      return res.status(404).json(apiError("Product not found"))
    }

    if (expiryDate && new Date(expiryDate) < new Date()) {
      return res.status(400).json(apiError("Expiry date cannot be in the past"))
    }

    // Duplicate barcode check — exclude this product itself.
    if (barcode) {
      const existingBarcode = await prisma.product.findFirst({
        where: {
          organizationId,
          barcode,
          deletedAt: null,
          id: { not: id },
        },
        select: { id: true, name: true },
      });

      if (existingBarcode) {
        return res.status(400).json(apiError(
          `Product with barcode "${barcode}" already exists (${existingBarcode.name})`
        ));
      }
    }

    const data: any = {}
    if (name !== undefined) data.name = name
    if (batchNumber !== undefined) data.batchNumber = batchNumber
    if (quantity !== undefined) data.quantity = quantity
    if (unitPrice !== undefined) data.unitPrice = unitPrice
    if (purchasePrice !== undefined) data.purchasePrice = purchasePrice === '' ? null : purchasePrice
    if (category !== undefined) data.category = category
    if (description !== undefined) data.description = description
    if (minStock !== undefined) data.minStock = minStock
    if (sku !== undefined) data.sku = sku
    if (barcode !== undefined) data.barcode = barcode === '' ? null : barcode
    if (taxCode !== undefined) {
      const normalizedTaxCode = String(taxCode).toUpperCase();
      if (!TaxService.ALLOWED_TAX_CODES.has(normalizedTaxCode as any)) {
        return res.status(400).json(apiError(
          `Invalid tax category "${taxCode}". Must be one of A, B, C or D.`
        ));
      }
      data.taxCode = normalizedTaxCode;
      data.taxCategory = TaxService.getTaxCategory(normalizedTaxCode as any);
    }
    if (measurementUnit !== undefined) data.measurementUnit = measurementUnit
    if (pkgUnitCd !== undefined) data.pkgUnitCd = pkgUnitCd === '' ? null : pkgUnitCd
    // qtyUnitCd isn't collected directly by the UI — keep it derived from
    // measurementUnit unless a caller explicitly overrides it.
    if (qtyUnitCd !== undefined) {
      data.qtyUnitCd = qtyUnitCd === '' ? null : qtyUnitCd
    } else if (measurementUnit !== undefined) {
      data.qtyUnitCd = deriveQtyUnitCd(measurementUnit)
    }
    if (packagingQty !== undefined) data.packagingQty = packagingQty === '' ? null : packagingQty
    if (itemType !== undefined) data.itemType = itemType
    data.expiryDate = expiryDate ? new Date(expiryDate) : null
    if (imageUrl !== undefined) data.imageUrl = imageUrl
    if (itemClsCd !== undefined) data.itemClsCd = itemClsCd === '' ? null : itemClsCd
    if (itemStandardName !== undefined) data.itemStandardName = itemStandardName === '' ? null : itemStandardName
    if (origin !== undefined) data.origin = origin || 'RW'
    if (useInsurance !== undefined) data.useInsurance = !!useInsurance
    if (additionalInfo !== undefined) data.additionalInfo = additionalInfo === '' ? null : additionalInfo
    if (l1SalePrice !== undefined) data.l1SalePrice = l1SalePrice === '' ? null : l1SalePrice
    if (l2SalePrice !== undefined) data.l2SalePrice = l2SalePrice === '' ? null : l2SalePrice
    if (l3SalePrice !== undefined) data.l3SalePrice = l3SalePrice === '' ? null : l3SalePrice
    if (l4SalePrice !== undefined) data.l4SalePrice = l4SalePrice === '' ? null : l4SalePrice
    if (l5SalePrice !== undefined) data.l5SalePrice = l5SalePrice === '' ? null : l5SalePrice

    // Auto-propagate edits back to RRA. syncProductToRra() skips an item whose
    // ebmSyncStatus is already SYNCED, so a rename (or any other field that
    // appears in the /items/saveItems payload) would never reach the VSDC.
    // When one of those fields actually changes on a registered item, clear the
    // skip-guard so the async sync below re-registers it. /items/saveItems is an
    // upsert on itemCd, so this updates the existing RRA record in place.
    const RRA_SYNCED_FIELDS = [
      'name', 'itemClsCd', 'itemType', 'itemStandardName', 'origin',
      'pkgUnitCd', 'qtyUnitCd', 'taxCode', 'batchNumber', 'barcode', 'unitPrice',
      'l1SalePrice', 'l2SalePrice', 'l3SalePrice', 'l4SalePrice', 'l5SalePrice',
      'additionalInfo', 'minStock', 'useInsurance',
    ] as const
    const valueChanged = (next: unknown, prev: unknown) => {
      const n = next != null && typeof (next as any).toNumber === 'function' ? (next as any).toNumber() : next
      const p = prev != null && typeof (prev as any).toNumber === 'function' ? (prev as any).toNumber() : prev
      const nf = typeof n === 'number' || typeof n === 'string' ? Number(n) : NaN
      const pf = typeof p === 'number' || typeof p === 'string' ? Number(p) : NaN
      if (!Number.isNaN(nf) && !Number.isNaN(pf)) return nf !== pf
      return (n ?? null) !== (p ?? null)
    }
    const rraFieldChanged = RRA_SYNCED_FIELDS.some(
      (f) => f in data && valueChanged((data as any)[f], (existingProduct as any)[f]),
    )
    if (rraFieldChanged && existingProduct.itemCd && existingProduct.ebmSyncStatus === 'SYNCED') {
      data.ebmSyncStatus = 'PENDING'
    }

    // itemCd is generated once and then permanent (it's the identifier RRA
    // knows the item by) — only backfill it for legacy rows that never got
    // one; never regenerate an itemCd that's already registered.
    let product: any
    if (!existingProduct.itemCd) {
      const resolvedItemType = (data.itemType ?? existingProduct.itemType) as 'PRODUCT' | 'SERVICE'
      const resolvedPkgUnitCd = data.pkgUnitCd !== undefined ? data.pkgUnitCd : existingProduct.pkgUnitCd
      const resolvedQtyUnitCd = data.qtyUnitCd ?? existingProduct.qtyUnitCd ?? deriveQtyUnitCd(existingProduct.measurementUnit)
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          product = await prisma.$transaction(async (tx) => {
            // Allocated inside the same transaction as the update so a
            // sequence number is only consumed if the update actually commits.
            const itemCd = await allocateItemCd(organizationId, resolvedItemType, resolvedPkgUnitCd, resolvedQtyUnitCd, tx)
            return tx.product.update({
              where: { id },
              data: { ...data, itemCd },
            })
          })
          break
        } catch (err) {
          if (!isItemCdConflict(err) || attempt === 4) {
            throw err
          }
        }
      }
    } else {
      product = await prisma.product.update({
        where: { id },
        data,
      })
    }

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

    syncProductToRraAsync(product.id, userId);

    res.json(success(product))
  } catch (error: any) {
    console.error("[Update Product Error]:", error)
    res.status(500).json(apiError("Failed to update product"))
  }
}

export const updateProductImage = async (req: BranchAuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    const existingProduct = await prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!existingProduct) {
      return res.status(404).json(apiError("Product not found"))
    }

    let imageUrl: string | null = existingProduct.imageUrl

    // Handle image removal
    if (req.body.removeImage === 'true' || req.body.removeImage === true) {
      imageUrl = null
      if (existingProduct.imageUrl) {
        try {
          const { deleteFromCloudinary } = await import("../config/cloudinary")
          await deleteFromCloudinary(existingProduct.imageUrl)
        } catch (e) {
          console.warn("Failed to delete old image from cloudinary:", e)
        }
      }
    }

    // Handle file upload
    if (req.file) {
      try {
        // Delete old image if exists
        if (existingProduct.imageUrl) {
          const { deleteFromCloudinary } = await import("../config/cloudinary")
          await deleteFromCloudinary(existingProduct.imageUrl)
        }

        const { uploadToCloudinary } = await import("../config/cloudinary")
        const result: any = await uploadToCloudinary(req.file)
        imageUrl = result.secure_url || result.url
      } catch (uploadError) {
        console.error("Failed to upload image:", uploadError)
        return res.status(500).json(apiError("Failed to upload image"))
      }
    }

    if (!req.file && !req.body.removeImage) {
      return res.status(400).json(apiError("No image provided"))
    }

    const product = await prisma.product.update({
      where: { id },
      data: { imageUrl },
    })

    res.json(success(product))
  } catch (error: any) {
    console.error("[Update Product Image Error]:", error)
    res.status(500).json(apiError("Failed to update product image"))
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
      itemType: 'PRODUCT',
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
        orderBy: getOrderBy(req.query, {
          id: { id: '$direction' },
          name: { name: '$direction' },
          batchNumber: { batchNumber: '$direction' },
          expiryDate: { expiryDate: '$direction' },
          quantity: { quantity: '$direction' },
          sellingPrice: { sellingPrice: '$direction' },
        }, 'expiryDate', 'asc'),
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
      itemType: 'PRODUCT',
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
        orderBy: getOrderBy(req.query, {
          id: { id: '$direction' },
          name: { name: '$direction' },
          batchNumber: { batchNumber: '$direction' },
          expiryDate: { expiryDate: '$direction' },
          quantity: { quantity: '$direction' },
          sellingPrice: { sellingPrice: '$direction' },
        }, 'expiryDate', 'desc'),
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

    // Org-wide fallback threshold for products that don't set their own minStock.
    const orgSettings = await getOrganizationSettings(organizationId)
    const overrideThreshold = orgSettings.preferences.lowStockThresholdOverride

    const branchId: number | undefined =
      req.selectedBranchId !== null && req.selectedBranchId !== undefined
        ? req.selectedBranchId
        : undefined

    const searchVal = search && typeof search === 'string' ? search.trim() : ''
    const statusVal = status && typeof status === 'string' ? status.toLowerCase() : ''
    const skip = (Number.parseInt(page as string) - 1) * Number.parseInt(limit as string)
    const take = Number.parseInt(limit as string)

    // Build ORM where clause (avoids $queryRaw BigInt/Decimal serialization issues)
    const where: any = {
      organizationId,
      isActive: true,
      deletedAt: null,
      itemType: { not: 'SERVICE' },
      // When an org-wide fallback threshold is configured, also consider
      // products that haven't set their own minStock (0/unset).
      ...(overrideThreshold && overrideThreshold > 0 ? {} : { minStock: { gt: 0 } }),
    }
    if (searchVal) {
      where.OR = [
        { name: { contains: searchVal, mode: 'insensitive' } },
        { sku: { contains: searchVal, mode: 'insensitive' } },
        { barcode: { contains: searchVal, mode: 'insensitive' } },
        { batchNumber: { contains: searchVal, mode: 'insensitive' } },
      ]
    }

    // Fetch candidates — include branch batches only when branchId is set
    const candidates = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        batchNumber: true,
        unitPrice: true,
        minStock: true,
        category: true,
        expiryDate: true,
        measurementUnit: true,
        imageUrl: true,
        quantity: true,
        batches: branchId !== undefined
          ? { where: { branchId, isActive: true }, select: { quantity: true } }
          : false,
      },
    })

    // Compute effective stock and apply low-stock + status filters in JS
    // (Prisma can't express column-to-column comparisons in where clauses)
    type Candidate = typeof candidates[number] & { effectiveStock: number; effectiveMinStock: number }

    let filtered: Candidate[] = candidates
      .map(p => {
        const effectiveStock = branchId !== undefined
          ? ((p as any).batches as Array<{ quantity: number }>).reduce((s, b) => s + b.quantity, 0)
          : p.quantity
        const effectiveMinStock = p.minStock > 0 ? p.minStock : (overrideThreshold ?? 0)
        return { ...p, effectiveStock, effectiveMinStock }
      })
      .filter(p => p.effectiveMinStock > 0 && p.effectiveStock <= p.effectiveMinStock) as Candidate[]

    if (statusVal === 'critical') {
      filtered = filtered.filter(p => p.effectiveStock <= p.effectiveMinStock * 0.25)
    } else if (statusVal === 'low') {
      filtered = filtered.filter(p => p.effectiveStock > p.effectiveMinStock * 0.25 && p.effectiveStock <= p.effectiveMinStock * 0.50)
    } else if (statusVal === 'warning') {
      filtered = filtered.filter(p => p.effectiveStock > p.effectiveMinStock * 0.50)
    }

    filtered.sort((a, b) => a.effectiveStock - b.effectiveStock)

    const totalCount = filtered.length
    const page_products = filtered.slice(skip, skip + take)

    const products = page_products.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      batchNumber: p.batchNumber,
      unitPrice: Number(p.unitPrice),   // Prisma Decimal → plain number
      minStock: p.effectiveMinStock,
      category: p.category,
      expiryDate: p.expiryDate,
      measurementUnit: p.measurementUnit,
      imageUrl: p.imageUrl,
      quantity: p.effectiveStock,
    }))

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
      quantity: quantity,
      branchId,
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
      branchId,
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
      branchId,
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

export const getTaxCodes = async (_req: Request, res: Response) => {
  const codes = [
    { code: 'A', label: 'A — VAT Exempt (0%)', rate: 0, category: 'EXEMPT' },
    { code: 'B', label: 'B — Standard VAT (18%)', rate: 18, category: 'STANDARD' },
    { code: 'C', label: 'C — Export / Zero-rated (0%)', rate: 0, category: 'ZERO_RATED' },
    { code: 'D', label: 'D — Not VAT Registered (0%)', rate: 0, category: 'NON_TAXABLE' },
  ];
  res.json(codes);
};
