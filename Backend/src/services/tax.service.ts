import { prisma } from '../lib/prisma';
import { TaxCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface TaxCalculationResult {
    taxableAmount: number;
    taxAmount: number;
    totalAmount: number;
    taxRate: number;
    taxCode: string;
}

export interface SaleTaxSummary {
    taxableAmount: number;
    vatAmount: number;
    items: Array<{
        productId: number;
        taxRate: number;
        taxAmount: number;
        taxCode: string;
        taxableAmount: number;
    }>;
}

export class TaxService {
    /**
     * Get RRA Tax Code for a category
     */
    static getTaxCode(category: TaxCategory): string {
        switch (category) {
            case 'STANDARD':
                return 'A';
            case 'ZERO_RATED':
                return 'B';
            case 'EXEMPT':
                return 'D';
            default:
                return 'A';
        }
    }

    /**
     * Get current VAT rate for an organization
     */
    static async getVatRate(organizationId: number): Promise<number> {
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

        return config ? Number(config.vatRate) : 18.0; // Default to 18%
    }

    /**
     * Calculate tax for an item
     */
    static calculateItemTax(
        unitPrice: number,
        quantity: number,
        category: TaxCategory,
        standardVatRate: number
    ): TaxCalculationResult {
        const total = unitPrice * quantity;
        let rate = 0;
        const code = this.getTaxCode(category);

        if (category === 'STANDARD') {
            rate = standardVatRate;
        } else if (category === 'ZERO_RATED') {
            rate = 0;
        } else if (category === 'EXEMPT') {
            rate = 0;
        }

        // Amount = Taxable + Tax
        // Total = Taxable * (1 + rate/100)
        // Taxable = Total / (1 + rate/100)

        // BUT usually in retail, unitPrice is TAX INCLUSIVE.
        // Let's assume unitPrice is Tax Inclusive as per most POS systems.

        const taxableAmount = total / (1 + rate / 100);
        const taxAmount = total - taxableAmount;

        return {
            taxableAmount: Number(taxableAmount.toFixed(2)),
            taxAmount: Number(taxAmount.toFixed(2)),
            totalAmount: total,
            taxRate: rate,
            taxCode: code,
        };
    }

    /**
     * Generate tax summary for a sale
     */
    static async calculateSaleTax(
        organizationId: number,
        items: Array<{ productId: number; quantity: number; unitPrice: number }>
    ): Promise<SaleTaxSummary> {
        const standardRate = await this.getVatRate(organizationId);

        const productIds = items.map(i => i.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, taxCategory: true }
        });

        const productMap = new Map(products.map(p => [p.id, p.taxCategory]));

        let totalTaxable = 0;
        let totalVat = 0;
        const itemSummaries = [];

        for (const item of items) {
            const category = productMap.get(item.productId) || 'STANDARD';
            const result = this.calculateItemTax(item.unitPrice, item.quantity, category, standardRate);

            totalTaxable += result.taxableAmount;
            totalVat += result.taxAmount;

            itemSummaries.push({
                productId: item.productId,
                taxRate: result.taxRate,
                taxAmount: result.taxAmount,
                taxCode: result.taxCode,
                taxableAmount: result.taxableAmount,
            });
        }

        return {
            taxableAmount: Number(totalTaxable.toFixed(2)),
            vatAmount: Number(totalVat.toFixed(2)),
            items: itemSummaries,
        };
    }
}
