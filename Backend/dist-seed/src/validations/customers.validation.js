"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordDebtPaymentSchema = exports.updateCustomerSchema = exports.createCustomerSchema = void 0;
const zod_1 = require("zod");
exports.createCustomerSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Customer name required').max(255, 'Customer name too long'),
        phone: zod_1.z.string().min(7, 'Phone number too short').max(15, 'Phone number too long').optional(),
        email: zod_1.z.string().email('Invalid email address').optional(),
        address: zod_1.z.string().optional(),
        customerType: zod_1.z.enum(['INDIVIDUAL', 'CORPORATE']).default('INDIVIDUAL'),
        TIN: zod_1.z.string().min(3, 'TIN too short').optional(),
        prcOrdCd: zod_1.z.string().min(1, 'Purchase order code too short').optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
    }),
});
exports.updateCustomerSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Customer name required').max(255, 'Customer name too long').optional(),
        phone: zod_1.z.string().min(7, 'Phone number too short').max(15, 'Phone number too long').optional(),
        email: zod_1.z.string().email('Invalid email address').optional(),
        address: zod_1.z.string().optional(),
        customerType: zod_1.z.enum(['INDIVIDUAL', 'CORPORATE']).optional(),
        TIN: zod_1.z.string().min(3, 'TIN too short').optional(),
        prcOrdCd: zod_1.z.string().optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
        id: zod_1.z.coerce.number().positive('Customer ID required'),
    }),
});
exports.recordDebtPaymentSchema = zod_1.z.object({
    body: zod_1.z.object({
        amount: zod_1.z.coerce.number().positive('Amount must be positive'),
        paymentDate: zod_1.z.string().datetime().optional(),
        paymentMethod: zod_1.z.string().default('CASH'),
        reference: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
        saleId: zod_1.z.coerce.number().positive('Sale ID required'),
    }),
});
