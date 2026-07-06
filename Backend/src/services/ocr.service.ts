export interface ExtractedProduct {
  productName: string;
  description?: string;
  sku?: string;
  barcode?: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity: number;
  unitPrice: number;
  sellingPrice?: number;
  totalPrice?: number;
  taxRate?: number;
  category?: string;
  manufacturer?: string;
  confidence: number;
}

export interface ExtractedInvoiceData {
  supplierName?: string;
  supplierAddress?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  discount?: number;
  totalAmount?: number;
  products: ExtractedProduct[];
  rawText?: string;
  confidence: number;
  provider: string;
  processingMs: number;
}

// DB columns for these fields are Decimal(10,2) / Decimal(5,2) — clamp so a bad
// OCR read (e.g. a barcode misread as a price) can never overflow the column.
const MAX_MONEY = 99_999_999.99;
const MAX_TAX_RATE = 999.99;

export function clampMoney(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_MONEY);
}

export function clampTaxRate(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_TAX_RATE);
}

// Invoice scanning runs client-side in the browser (see Frontend/src/lib/invoiceOcr.ts).
// This module only defines the shared data shape the controller validates/stores.
export function normalizeExtractedData(raw: any): ExtractedInvoiceData {
  const products: ExtractedProduct[] = Array.isArray(raw?.products)
    ? raw.products.map((p: any) => ({
        productName: String(p.productName || 'Unknown Product').trim(),
        description: p.description || undefined,
        sku: p.sku || undefined,
        barcode: p.barcode || undefined,
        batchNumber: p.batchNumber || undefined,
        expiryDate: p.expiryDate || undefined,
        quantity: Math.max(1, Number(p.quantity) || 1),
        unitPrice: clampMoney(Number(p.unitPrice)),
        sellingPrice: p.sellingPrice ? clampMoney(Number(p.sellingPrice)) : undefined,
        totalPrice: p.totalPrice ? clampMoney(Number(p.totalPrice)) : undefined,
        taxRate: p.taxRate ? clampTaxRate(Number(p.taxRate)) : undefined,
        category: p.category || undefined,
        manufacturer: p.manufacturer || undefined,
        confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0)),
      }))
    : [];

  return {
    supplierName: raw?.supplierName || undefined,
    supplierAddress: raw?.supplierAddress || undefined,
    invoiceNumber: raw?.invoiceNumber || undefined,
    invoiceDate: raw?.invoiceDate || undefined,
    currency: raw?.currency || 'RWF',
    subtotal: raw?.subtotal ? clampMoney(Number(raw.subtotal)) : undefined,
    taxAmount: raw?.taxAmount ? clampMoney(Number(raw.taxAmount)) : undefined,
    discount: raw?.discount ? clampMoney(Number(raw.discount)) : undefined,
    totalAmount: raw?.totalAmount ? clampMoney(Number(raw.totalAmount)) : undefined,
    products,
    confidence: Math.min(1, Math.max(0, Number(raw?.confidence) || 0)),
    provider: raw?.provider || 'client',
    processingMs: Number(raw?.processingMs) || 0,
  };
}
