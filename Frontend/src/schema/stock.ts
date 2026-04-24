import { z } from 'zod';

export const stockTransferItemSchema = z.object({
  productId: z.number().positive('Product ID must be positive'),
  quantity: z.number().positive('Quantity must be positive').int('Quantity must be integer'),
});

export const createStockTransferSchema = z.object({
  fromBranchId: z.number().positive('From branch ID required'),
  toBranchId: z.number().positive('To branch ID required'),
  notes: z.string().optional(),
  items: z.array(stockTransferItemSchema).min(1, 'Transfer must have at least one item'),
});

export const stockTransferStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED']);

export const approveStockTransferSchema = z.object({});

export const rejectStockTransferSchema = z.object({});

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type StockTransferItemInput = z.infer<typeof stockTransferItemSchema>;
export type StockTransferStatus = z.infer<typeof stockTransferStatusEnum>;