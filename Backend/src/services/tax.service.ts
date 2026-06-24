import { prisma } from '../lib/prisma';
import { TaxCategory, RraTaxCode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface TaxCalculationResult {
    taxableAmount: Decimal;
    taxAmount: Decimal;
    totalAmount: Decimal;
    taxRate: Decimal;
    taxCode: RraTaxCode;
}

export interface SaleTaxSummary {
    taxableAmount: Decimal;
    vatAmount: Decimal;
    items: Array<{
        productId: number;
        taxRate: Decimal;
        taxAmount: Decimal;
        taxCode: RraTaxCode;
        taxableAmount: Decimal;
    }>;
}

export class TaxService {
    static getTaxCode(category: TaxCategory): RraTaxCode {
        switch (category) {
            case 'STANDARD':
                return RraTaxCode.B;
            case 'ZERO_RATED':
                return RraTaxCode.C;
            case 'EXEMPT':
                return RraTaxCode.A;
            default:
                return RraTaxCode.A;
        }
    }

    static resolveTaxCode(category: TaxCategory, productTaxCode?: RraTaxCode | null): RraTaxCode {
        return productTaxCode ?? this.getTaxCode(category);
    }

    static async getVatRate(organizationId: number): Promise<Decimal> {
        const config = await prisma.taxConfiguration.findFirst({
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

        return config ? config.vatRate : new Decimal(18);
    }

    static calculateItemTax(
        unitPrice: number | Decimal,
        quantity: number | Decimal,
        category: TaxCategory,
        standardVatRate: Decimal,
        overrideTaxCode?: RraTaxCode | null
    ): TaxCalculationResult {
        const price = unitPrice instanceof Decimal ? unitPrice : new Decimal(unitPrice);
        const qty = quantity instanceof Decimal ? quantity : new Decimal(quantity);
        const total = price.mul(qty);
        const code = overrideTaxCode ?? this.getTaxCode(category);

        const isTaxable = code === RraTaxCode.B;
        const rate = isTaxable ? standardVatRate : new Decimal(0);

        if (isTaxable) {
            const divisor = new Decimal(1).plus(rate.div(100));
            const taxableAmount = total.div(divisor);
            const taxAmount = total.minus(taxableAmount);
            return { taxableAmount, taxAmount, totalAmount: total, taxRate: rate, taxCode: code };
        }

        return {
            taxableAmount: total,
            taxAmount: new Decimal(0),
            totalAmount: total,
            taxRate: rate,
            taxCode: code,
        };
    }

    static async calculateSaleTax(
        organizationId: number,
        items: Array<{ productId: number; quantity: number; unitPrice: number }>
    ): Promise<SaleTaxSummary> {
        const standardRate = await this.getVatRate(organizationId);

        const productIds = items.map(i => i.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, taxCategory: true, taxCode: true }
        });

        const productMap = new Map(products.map(p => [p.id, { taxCategory: p.taxCategory, taxCode: p.taxCode }]));

        let totalTaxable = new Decimal(0);
        let totalVat = new Decimal(0);
        const itemSummaries: SaleTaxSummary['items'] = [];

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
