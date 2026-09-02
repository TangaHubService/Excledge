import { z } from 'zod';

// A phone always comes out of the frontend's PhoneInputWithCountryCode as
// "+<countrycode><digits>"; a bulk-imported/legacy number may be the plain
// local "0XXXXXXXX(X)" form — but neither shape overlaps a bare 9-digit TIN,
// so a value that got put in the wrong field is rejected instead of silently
// stored (and later sent to the RRA VSDC as the wrong one of custTin/custMblNo).
export const PHONE_PATTERN = /^(\+\d{9,15}|0\d{8,9})$/;
// RRA TIN: exactly 9 digits — same shape the RRA-taxpayer-lookup endpoint requires.
export const TIN_PATTERN = /^\d{9}$/;

export const isValidCustomerPhone = (value: string): boolean => PHONE_PATTERN.test(value);
export const isValidCustomerTin = (value: string): boolean => TIN_PATTERN.test(value);

// Both fields are optional in the UI, and the form always submits '' rather
// than omitting the key — treat blank the same as "not provided" so walk-in
// customers without a phone/TIN aren't rejected, while any non-blank value
// still has to match the real shape.
const phoneField = z.union([z.literal(''), z.string().regex(PHONE_PATTERN, 'Invalid phone number — expected +<country code><digits> or 0XXXXXXXXX')]).optional().nullable();
const tinField = z.union([z.literal(''), z.string().regex(TIN_PATTERN, 'TIN must be exactly 9 digits')]).optional().nullable();

// The controller accepts the TIN under either casing (`TIN` from the public
// API contract, `tin` — what the customer form actually sends); validate
// whichever is present so neither path skips the format/swap check.
const tinNotPhone = (data: { phone?: string | null; TIN?: string | null; tin?: string | null }) => {
  const tinValue = data.TIN ?? data.tin;
  return !data.phone || !tinValue || data.phone !== tinValue;
};
const tinNotPhoneIssue = {
  message: 'Phone number and TIN cannot be the same value',
  path: ['TIN'],
};

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Customer name required').max(255, 'Customer name too long'),
    phone: phoneField,
    email: z.string().email('Invalid email address').optional(),
    address: z.string().optional(),
    customerType: z.enum(['INDIVIDUAL', 'CORPORATE']).default('INDIVIDUAL'),
    TIN: tinField,
    tin: tinField,
    prcOrdCd: z.string().min(1, 'Purchase order code too short').optional(),
  }).refine(tinNotPhone, tinNotPhoneIssue),
  params: z.object({
    organizationId: z.coerce.number().positive('Organization ID required'),
  }),
});

export const updateCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Customer name required').max(255, 'Customer name too long').optional(),
    phone: phoneField,
    email: z.string().email('Invalid email address').optional(),
    address: z.string().optional(),
    customerType: z.enum(['INDIVIDUAL', 'CORPORATE']).optional(),
    TIN: tinField,
    tin: tinField,
    prcOrdCd: z.string().optional(),
  }).refine(tinNotPhone, tinNotPhoneIssue),
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
