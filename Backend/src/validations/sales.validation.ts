import { z } from 'zod';

export const saleItemSchema = z.object({
  productId: z.coerce.number().positive('Product ID must be positive').optional(),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().positive('Unit price must be positive'),
  discount: z.coerce.number().nonnegative('Discount cannot be negative').optional(),
  itemType: z.enum(['PRODUCT', 'RAW_MATERIAL', 'SERVICE']).default('PRODUCT'),
  serviceName: z.string().optional(),
  serviceDescription: z.string().optional(),
}).refine(
  (data) => {
    if (data.itemType !== 'SERVICE' && !data.productId) {
      return false;
    }
    return true;
  },
  { message: 'productId is required for stock-tracked items', path: ['productId'] }
);

const salePaymentSchema = z.object({
  paymentMethod: z.enum(['CASH', 'BANK', 'BANK_CHECK', 'CARD', 'PAYPACK', 'MTN_MOMO', 'AIRTEL_MONEY', 'WALLET', 'GIFT_CARD', 'STORE_CREDIT']),
  amount: z.coerce.number().positive('Payment amount must be positive'),
  reference: z.string().max(200).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createSaleSchema = z.object({
  body: z.object({
    customerId: z.coerce.number().positive('Customer ID required'),
    items: z.array(saleItemSchema).min(1, 'Sale must have at least one item'),
    // Optional: a PROFORMA quote collects no payment, so the frontend sends
    // debtAmount/cashAmount/insuranceAmount without a paymentType — the
    // controller derives finalPaymentType from those amounts when omitted.
    paymentType: z.enum(['CASH', 'DEBT', 'INSURANCE', 'MIXED', 'MOBILE_MONEY', 'CREDIT_CARD', 'BANK_CHECK']).optional(),
    cashAmount: z.coerce.number().nonnegative('Cash amount cannot be negative').optional(),
    debtAmount: z.coerce.number().nonnegative('Debt amount cannot be negative').optional(),
    insuranceAmount: z.coerce.number().nonnegative('Insurance amount cannot be negative').optional(),
    notes: z.string().optional(),
    shiftId: z.coerce.number().positive().optional(),
    branchId: z.coerce.number().positive().optional(),
    payments: z.array(salePaymentSchema).optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
  }),
});

export const updateProformaSchema = z.object({
  body: z.object({
    customerId: z.coerce.number().positive().optional(),
    items: z.array(saleItemSchema).min(1, 'A proforma must have at least one item'),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    saleId: z.coerce.number().positive('Sale ID required'),
  }),
});

export const convertProformaSchema = z.object({
  body: z.object({
    customerId: z.coerce.number().positive().optional(),
    items: z.array(saleItemSchema).min(1).optional(),
    paymentType: z.enum(['CASH', 'DEBT', 'INSURANCE', 'MIXED', 'MOBILE_MONEY', 'CREDIT_CARD', 'BANK_CHECK']).optional(),
    cashAmount: z.coerce.number().nonnegative().optional(),
    debtAmount: z.coerce.number().nonnegative().optional(),
    insuranceAmount: z.coerce.number().nonnegative().optional(),
    shiftId: z.coerce.number().positive().optional(),
    payments: z.array(salePaymentSchema).optional(),
  }),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
    saleId: z.coerce.number().positive('Sale ID required'),
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

export const refundSaleSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Refund reason is required').max(500).optional(),
    // RRA refund reason code (VSDC code class 32, sent as rfdRsnCd). Optional
    // for backwards compatibility — the controller defaults it to '06 Refund'.
    rfdRsnCd: z.string().regex(/^\d{2}$/, 'Refund reason code must be two digits').optional(),
    items: z.array(z.object({
      saleItemId: z.coerce.number().positive().optional(),
      quantity: z.coerce.number().positive().optional(),
    })).optional(),
  }),
  params: z.object({
    id: z.coerce.number().positive('Sale ID required'),
    organizationId: z.coerce.number().positive('Organization ID required'),
  }),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
export type RefundSaleInput = z.infer<typeof refundSaleSchema>;
export type UpdateProformaInput = z.infer<typeof updateProformaSchema>;
export type ConvertProformaInput = z.infer<typeof convertProformaSchema>;
