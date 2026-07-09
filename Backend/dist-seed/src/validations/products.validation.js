"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustStockSchema = exports.updateProductSchema = exports.createProductSchema = void 0;
const zod_1 = require("zod");
exports.createProductSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Product name required').max(255, 'Product name too long'),
        sku: zod_1.z.string().min(1, 'SKU required').max(50, 'SKU too long').optional(),
        quantity: zod_1.z.coerce.number().nonnegative('Quantity cannot be negative').default(0),
        unitPrice: zod_1.z.coerce.number().positive('Unit price must be positive'),
        category: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        minStock: zod_1.z.coerce.number().nonnegative('Minimum stock cannot be negative').default(10),
        taxCategory: zod_1.z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT']).default('STANDARD'),
        // E is reserved for RRA internal use only and must never be assignable to a product.
        taxCode: zod_1.z.enum(['A', 'B', 'C', 'D']).optional(),
        measurementUnit: zod_1.z.enum(['PCS', 'KG', 'LTR', 'MTR', 'BOX', 'PAIR', 'DOZEN', 'GRAM', 'ML', 'OTHER']).default('PCS'),
        itemType: zod_1.z.enum(['PRODUCT', 'SERVICE']).default('PRODUCT'),
        expiryDate: zod_1.z.string().datetime().optional(),
        barcode: zod_1.z.string().optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
    }),
});
exports.updateProductSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Product name required').max(255, 'Product name too long').optional(),
        sku: zod_1.z.string().min(1, 'SKU required').max(50, 'SKU too long').optional(),
        unitPrice: zod_1.z.coerce.number().positive('Unit price must be positive').optional(),
        category: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        minStock: zod_1.z.coerce.number().nonnegative('Minimum stock cannot be negative').optional(),
        taxCategory: zod_1.z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT']).optional(),
        // E is reserved for RRA internal use only and must never be assignable to a product.
        taxCode: zod_1.z.enum(['A', 'B', 'C', 'D']).optional(),
        measurementUnit: zod_1.z.enum(['PCS', 'KG', 'LTR', 'MTR', 'BOX', 'PAIR', 'DOZEN', 'GRAM', 'ML', 'OTHER']).optional(),
        itemType: zod_1.z.enum(['PRODUCT', 'SERVICE']).optional(),
        expiryDate: zod_1.z.string().datetime().optional().nullable(),
        barcode: zod_1.z.string().optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
        id: zod_1.z.coerce.number().positive('Product ID required'),
    }),
});
exports.adjustStockSchema = zod_1.z.object({
    body: zod_1.z.object({
        quantity: zod_1.z.coerce.number().int('Quantity must be integer'),
        reason: zod_1.z.string().min(3, 'Reason must be at least 3 characters'),
        reference: zod_1.z.string().optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
        id: zod_1.z.coerce.number().positive('Product ID required'),
    }),
});
