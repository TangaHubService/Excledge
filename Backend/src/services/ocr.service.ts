import fs from 'fs/promises';
import path from 'path';

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

interface OCRProvider {
  scanInvoice(filePath: string, mimeType: string): Promise<ExtractedInvoiceData>;
}

// ── OpenAI Vision Provider ────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an expert invoice parser. Extract ALL product information from this supplier invoice image.

Return ONLY a valid JSON object with this exact structure:
{
  "supplierName": "string or null",
  "supplierAddress": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "currency": "3-letter code e.g. RWF, USD or null",
  "subtotal": number or null,
  "taxAmount": number or null,
  "discount": number or null,
  "totalAmount": number or null,
  "products": [
    {
      "productName": "exact product name",
      "description": "additional description if any",
      "sku": "SKU code if present",
      "barcode": "barcode if present",
      "batchNumber": "batch/lot number if present",
      "expiryDate": "YYYY-MM-DD or null",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number or null,
      "taxRate": number (percentage) or null,
      "category": "infer category from product name",
      "manufacturer": "manufacturer name if present",
      "confidence": 0.0 to 1.0 (your confidence this row is correct)
    }
  ],
  "overallConfidence": 0.0 to 1.0
}

Important rules:
- Normalize all column headers (Medicine/Item/Product → productName, Qty/Units/Quantity → quantity, Cost/Price/Buying Price → unitPrice)
- All numeric values must be pure numbers without currency symbols
- If a field is not visible, use null
- Include EVERY product row from the invoice, even if data is partially missing
- For missing quantity, default to 1; for missing price, use 0
- Return ONLY the JSON, no markdown, no explanation`;

class OpenAIVisionProvider implements OCRProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async scanInvoice(filePath: string, mimeType: string): Promise<ExtractedInvoiceData> {
    const start = Date.now();

    const fileBuffer = await fs.readFile(filePath);
    const base64 = fileBuffer.toString('base64');

    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';

    let messages: any[];

    if (isImage) {
      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' },
            },
          ],
        },
      ];
    } else if (isPdf) {
      // GPT-4o supports PDF files as base64 in newer API versions
      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:application/pdf;base64,${base64}` },
            },
          ],
        },
      ];
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(err)}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const processingMs = Date.now() - start;

    return this.normalize(parsed, processingMs);
  }

  private normalize(raw: any, processingMs: number): ExtractedInvoiceData {
    const products: ExtractedProduct[] = (raw.products || []).map((p: any) => ({
      productName: String(p.productName || 'Unknown Product').trim(),
      description: p.description || undefined,
      sku: p.sku || undefined,
      barcode: p.barcode || undefined,
      batchNumber: p.batchNumber || undefined,
      expiryDate: p.expiryDate || undefined,
      quantity: Math.max(1, Number(p.quantity) || 1),
      unitPrice: Math.max(0, Number(p.unitPrice) || 0),
      sellingPrice: p.sellingPrice ? Number(p.sellingPrice) : undefined,
      totalPrice: p.totalPrice ? Number(p.totalPrice) : undefined,
      taxRate: p.taxRate ? Number(p.taxRate) : undefined,
      category: p.category || undefined,
      manufacturer: p.manufacturer || undefined,
      confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0.5)),
    }));

    return {
      supplierName: raw.supplierName || undefined,
      supplierAddress: raw.supplierAddress || undefined,
      invoiceNumber: raw.invoiceNumber || undefined,
      invoiceDate: raw.invoiceDate || undefined,
      currency: raw.currency || 'RWF',
      subtotal: raw.subtotal ? Number(raw.subtotal) : undefined,
      taxAmount: raw.taxAmount ? Number(raw.taxAmount) : undefined,
      discount: raw.discount ? Number(raw.discount) : undefined,
      totalAmount: raw.totalAmount ? Number(raw.totalAmount) : undefined,
      products,
      confidence: Math.min(1, Math.max(0, Number(raw.overallConfidence) || 0.5)),
      provider: 'openai',
      processingMs,
    };
  }
}

// ── Manual / No-OCR Provider (fallback) ──────────────────────────────────

class ManualProvider implements OCRProvider {
  async scanInvoice(_filePath: string, _mimeType: string): Promise<ExtractedInvoiceData> {
    return {
      products: [],
      confidence: 0,
      provider: 'manual',
      processingMs: 0,
    };
  }
}

// ── Provider factory ─────────────────────────────────────────────────────

export function createOCRProvider(): OCRProvider {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return new OpenAIVisionProvider(openaiKey);
  }
  return new ManualProvider();
}

export async function scanInvoiceFile(
  filePath: string,
  mimeType: string
): Promise<ExtractedInvoiceData> {
  const provider = createOCRProvider();
  return provider.scanInvoice(filePath, mimeType);
}
