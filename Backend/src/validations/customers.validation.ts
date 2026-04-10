import { z } from 'zod';

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Customer name required').max(255, 'Customer name too long'),
    phone: z.string().min(7, 'Phone number too short').max(15, 'Phone number too long'),
    email: z.string().email('Invalid email address').optional(),
    address: z.string().optional(),
    customerType: z.enum(['INDIVIDUAL', 'CORPORATE']).default('INDIVIDUAL'),
    TIN: z.string().min(3, 'TIN too short').optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
  }),
});

export const updateCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Customer name required').max(255, 'Customer name too long').optional(),
    phone: z.string().min(7, 'Phone number too short').max(15, 'Phone number too long').optional(),
    email: z.string().email('Invalid email address').optional(),
    address: z.string().optional(),
    customerType: z.enum(['INDIVIDUAL', 'CORPORATE']).optional(),
    TIN: z.string().min(3, 'TIN too short').optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    id: z.coerce.number().positive('Customer ID required'),
  }),
});

export const recordDebtPaymentSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive('Amount must be positive'),
    paymentDate: z.string().datetime().optional(),
    paymentMethod: z.string().default('CASH'),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    saleId: z.coerce.number().positive('Sale ID required'),
  }),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type RecordDebtPaymentInput = z.infer<typeof recordDebtPaymentSchema>;
