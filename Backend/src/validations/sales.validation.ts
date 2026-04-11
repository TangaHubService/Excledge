import { z } from 'zod';

export const saleItemSchema = z.object({
  productId: z.coerce.number().positive('Product ID must be positive'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().positive('Unit price must be positive'),
  discount: z.coerce.number().nonnegative('Discount cannot be negative').optional(),
});

export const createSaleSchema = z.object({
  body: z.object({
    customerId: z.coerce.number().positive('Customer ID required'),
    items: z.array(saleItemSchema).min(1, 'Sale must have at least one item'),
    paymentType: z.enum(['CASH', 'DEBT', 'INSURANCE', 'MIXED', 'MOBILE_MONEY', 'CREDIT_CARD']),
    cashAmount: z.coerce.number().nonnegative('Cash amount cannot be negative').optional(),
    debtAmount: z.coerce.number().nonnegative('Debt amount cannot be negative').optional(),
    insuranceAmount: z.coerce.number().nonnegative('Insurance amount cannot be negative').optional(),
    purchaseOrderCode: z.string().max(50, 'Purchase order code too long').optional(),
    notes: z.string().optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
  }),
});

export const cancelSaleSchema = z.object({
  body: z.object({
    reason: z.string().min(5, 'Cancellation reason must be at least 5 characters'),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    saleId: z.coerce.number().positive('Sale ID required'),
  }),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
