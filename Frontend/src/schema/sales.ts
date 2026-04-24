import { z } from 'zod';

export const paymentTypeEnum = z.enum(['CASH', 'DEBT', 'INSURANCE', 'MIXED', 'MOBILE_MONEY', 'CREDIT_CARD']);

export const saleItemSchema = z.object({
  productId: z.number().positive('Product ID must be positive'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  discount: z.number().nonnegative('Discount cannot be negative').optional(),
});

export const createSaleSchema = z.object({
  customerId: z.number().positive('Customer ID required'),
  items: z.array(saleItemSchema).min(1, 'Sale must have at least one item'),
  paymentType: paymentTypeEnum,
  cashAmount: z.number().nonnegative('Cash amount cannot be negative').optional(),
  debtAmount: z.number().nonnegative('Debt amount cannot be negative').optional(),
  insuranceAmount: z.number().nonnegative('Insurance amount cannot be negative').optional(),
  purchaseOrderCode: z.string().max(50, 'Purchase order code too long').optional(),
  notes: z.string().optional(),
});

export const cancelSaleSchema = z.object({
  reason: z.string().min(5, 'Cancellation reason must be at least 5 characters'),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
export type SaleItemInput = z.infer<typeof saleItemSchema>;
export type PaymentType = z.infer<typeof paymentTypeEnum>;