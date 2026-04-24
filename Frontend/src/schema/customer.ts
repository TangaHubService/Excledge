import { z } from 'zod';

export const customerTypeEnum = z.enum(['INDIVIDUAL', 'CORPORATE', 'INSURANCE']);

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name required').max(255, 'Customer name too long'),
  phone: z.string().min(7, 'Phone number too short').max(15, 'Phone number too long'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  customerType: customerTypeEnum.default('INDIVIDUAL'),
  TIN: z.string().min(3, 'TIN too short').optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name required').max(255, 'Customer name too long').optional(),
  phone: z.string().min(7, 'Phone number too short').max(15, 'Phone number too long').optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
  customerType: customerTypeEnum.optional(),
  TIN: z.string().min(3, 'TIN too short').optional(),
  isActive: z.boolean().optional(),
});

export const recordDebtPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().default('CASH'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type RecordDebtPaymentInput = z.infer<typeof recordDebtPaymentSchema>;
export type CustomerType = z.infer<typeof customerTypeEnum>;