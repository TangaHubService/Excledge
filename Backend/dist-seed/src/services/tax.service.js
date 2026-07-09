"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxService = void 0;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const library_1 = require("@prisma/client/runtime/library");
class TaxService {
    static getTaxCode(category) {
        switch (category) {
            case 'STANDARD':
                return client_1.RraTaxCode.B;
            case 'ZERO_RATED':
                return client_1.RraTaxCode.C;
            case 'EXEMPT':
                return client_1.RraTaxCode.A;
            case 'NON_TAXABLE':
                return client_1.RraTaxCode.D;
            default:
                return client_1.RraTaxCode.A;
        }
    }
    /** RRA spec: TAX_A=0% (exempt), TAX_B=18% (standard VAT), TAX_C=0% (zero-rated), TAX_D=0% (non-taxable), TAX_E=0% (tourism/export) */
    static getExpectedTaxRate(taxCode) {
        switch (taxCode) {
            case client_1.RraTaxCode.B:
                return 18;
            case client_1.RraTaxCode.A:
            case client_1.RraTaxCode.C:
            case client_1.RraTaxCode.D:
            case client_1.RraTaxCode.E:
            default:
                return 0;
        }
    }
    static validateTaxRate(taxCode, taxRate) {
        const expectedRate = this.getExpectedTaxRate(taxCode);
        return { valid: taxRate === expectedRate, expectedRate };
    }
    static resolveTaxCode(category, productTaxCode) {
        return productTaxCode ?? this.getTaxCode(category);
    }
    static async getVatRate(organizationId) {
        const config = await prisma_1.prisma.taxConfiguration.findFirst({
            where: {
                organizationId,
                effectiveDate: {
                    lte: new Date(),
                },
            },
            orderBy: {
                effectiveDate: 'desc',
            },
        });
        return config ? config.vatRate : new library_1.Decimal(18);
    }
    static calculateItemTax(unitPrice, quantity, category, standardVatRate, overrideTaxCode) {
        const price = unitPrice instanceof library_1.Decimal ? unitPrice : new library_1.Decimal(unitPrice);
        const qty = quantity instanceof library_1.Decimal ? quantity : new library_1.Decimal(quantity);
        const total = price.mul(qty);
        const code = overrideTaxCode ?? this.getTaxCode(category);
        const isTaxable = code === client_1.RraTaxCode.B; // Only TAX_B (18%) is taxable
        const rate = isTaxable ? standardVatRate : new library_1.Decimal(0);
        if (isTaxable) {
            const divisor = new library_1.Decimal(1).plus(rate.div(100));
            const taxableAmount = total.div(divisor);
            const taxAmount = total.minus(taxableAmount);
            return { taxableAmount, taxAmount, totalAmount: total, taxRate: rate, taxCode: code };
        }
        return {
            taxableAmount: total,
            taxAmount: new library_1.Decimal(0),
            totalAmount: total,
            taxRate: rate,
            taxCode: code,
        };
    }
    static async calculateSaleTax(organizationId, items) {
        const standardRate = await this.getVatRate(organizationId);
        const productIds = items.map(i => i.productId);
        const products = await prisma_1.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, taxCategory: true, taxCode: true }
        });
        const productMap = new Map(products.map(p => [p.id, { taxCategory: p.taxCategory, taxCode: p.taxCode }]));
        let totalTaxable = new library_1.Decimal(0);
        let totalVat = new library_1.Decimal(0);
        const itemSummaries = [];
        for (const item of items) {
            const product = productMap.get(item.productId);
            const category = product?.taxCategory || 'STANDARD';
            const result = this.calculateItemTax(item.unitPrice, item.quantity, category, standardRate, product?.taxCode);
            totalTaxable = totalTaxable.plus(result.taxableAmount);
            totalVat = totalVat.plus(result.taxAmount);
            itemSummaries.push({
                productId: item.productId,
                taxRate: result.taxRate,
                taxAmount: result.taxAmount,
                taxCode: result.taxCode,
                taxableAmount: result.taxableAmount,
            });
        }
        return {
            taxableAmount: totalTaxable,
            vatAmount: totalVat,
            items: itemSummaries,
        };
    }
}
exports.TaxService = TaxService;
/** Allowed tax codes for line items. E is reserved for internal RRA use only
 *  and must never be assigned to a product or submitted on a sale. */
TaxService.ALLOWED_TAX_CODES = new Set([
    client_1.RraTaxCode.A, client_1.RraTaxCode.B, client_1.RraTaxCode.C, client_1.RraTaxCode.D,
]);
