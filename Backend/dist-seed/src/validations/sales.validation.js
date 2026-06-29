"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelSaleSchema = exports.createSaleSchema = exports.saleItemSchema = void 0;
const zod_1 = require("zod");
exports.saleItemSchema = zod_1.z.object({
    productId: zod_1.z.coerce.number().positive('Product ID must be positive').optional(),
    quantity: zod_1.z.coerce.number().positive('Quantity must be positive'),
    unitPrice: zod_1.z.coerce.number().positive('Unit price must be positive'),
    discount: zod_1.z.coerce.number().nonnegative('Discount cannot be negative').optional(),
    itemType: zod_1.z.enum(['PRODUCT', 'SERVICE']).default('PRODUCT'),
    serviceName: zod_1.z.string().optional(),
    serviceDescription: zod_1.z.string().optional(),
}).refine((data) => {
    if (data.itemType === 'PRODUCT' && !data.productId) {
        return false;
    }
    return true;
}, { message: 'productId is required for PRODUCT items', path: ['productId'] });
exports.createSaleSchema = zod_1.z.object({
    body: zod_1.z.object({
        customerId: zod_1.z.coerce.number().positive('Customer ID required'),
        items: zod_1.z.array(exports.saleItemSchema).min(1, 'Sale must have at least one item'),
        paymentType: zod_1.z.enum(['CASH', 'DEBT', 'INSURANCE', 'MIXED', 'MOBILE_MONEY', 'CREDIT_CARD']),
        cashAmount: zod_1.z.coerce.number().nonnegative('Cash amount cannot be negative').optional(),
        debtAmount: zod_1.z.coerce.number().nonnegative('Debt amount cannot be negative').optional(),
        insuranceAmount: zod_1.z.coerce.number().nonnegative('Insurance amount cannot be negative').optional(),
        notes: zod_1.z.string().optional(),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
    }),
});
exports.cancelSaleSchema = zod_1.z.object({
    body: zod_1.z.object({
        reason: zod_1.z.string().min(5, 'Cancellation reason must be at least 5 characters'),
    }),
    params: zod_1.z.object({
        organizationId: zod_1.z.coerce.number().positive('Organization ID required'),
        saleId: zod_1.z.coerce.number().positive('Sale ID required'),
    }),
});
