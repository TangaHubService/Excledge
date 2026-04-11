import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Product name required').max(255, 'Product name too long'),
    sku: z.string().min(1, 'SKU required').max(50, 'SKU too long').optional(),
    itemCode: z.string().max(50, 'Item code too long').optional(),
    itemClassCode: z.string().max(50, 'Item classification code too long').optional(),
    packageUnitCode: z.string().max(10, 'Package unit code too long').optional(),
    quantityUnitCode: z.string().max(10, 'Quantity unit code too long').optional(),
    quantity: z.coerce.number().nonnegative('Quantity cannot be negative'),
    unitPrice: z.coerce.number().positive('Unit price must be positive'),
    category: z.string().optional(),
    description: z.string().optional(),
    minStock: z.coerce.number().nonnegative('Minimum stock cannot be negative').default(10),
    taxCategory: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT']).default('STANDARD'),
    expiryDate: z.string().datetime().optional(),
    barcode: z.string().optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Product name required').max(255, 'Product name too long').optional(),
    sku: z.string().min(1, 'SKU required').max(50, 'SKU too long').optional(),
    itemCode: z.string().max(50, 'Item code too long').optional(),
    itemClassCode: z.string().max(50, 'Item classification code too long').optional(),
    packageUnitCode: z.string().max(10, 'Package unit code too long').optional(),
    quantityUnitCode: z.string().max(10, 'Quantity unit code too long').optional(),
    unitPrice: z.coerce.number().positive('Unit price must be positive').optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    minStock: z.coerce.number().nonnegative('Minimum stock cannot be negative').optional(),
    taxCategory: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT']).optional(),
    expiryDate: z.string().datetime().optional().nullable(),
    barcode: z.string().optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    id: z.coerce.number().positive('Product ID required'),
  }),
});

export const adjustStockSchema = z.object({
  body: z.object({
    quantity: z.coerce.number().int('Quantity must be integer'),
    reason: z.string().min(3, 'Reason must be at least 3 characters'),
    reference: z.string().optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    id: z.coerce.number().positive('Product ID required'),
  }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
