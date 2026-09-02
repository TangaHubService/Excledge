import { describe, it, expect } from 'vitest';
import { TaxService } from '../src/services/tax.service';
import { parseVsdcResponse, parseVsdcStatusCode } from '../src/services/vsdc-api.service';
import { parseGatewayResponse, gatewayErrorMessage, buildRraSendReceiptPayload, type SaleWithRelations } from '../src/services/rra-ebm.service';
import { validateVsdcEnvelope } from '../src/services/vsdc-api.service';
import { taxGroups, documentIndicator, isFormalNoticeIndicator } from '../src/services/invoice-pdf.service';
import type { RenderInvoicePayload, RenderInvoiceLineItem } from '../src/services/invoice-render.service';
import { RraTaxCode, TaxCategory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Module 1: Global Setup & Security — Tax Code Mapping & Rate Enforcement
// ============================================================================
describe('RRA TAX CODE MAPPING (TAX_A / B / C / D)', () => {
  describe('getTaxCode — maps TaxCategory to RraTaxCode', () => {
    it('maps STANDARD → B (18% Taxable)', () => {
      expect(TaxService.getTaxCode('STANDARD' as TaxCategory)).toBe(RraTaxCode.B);
    });

    it('maps ZERO_RATED → C (0% Export)', () => {
      expect(TaxService.getTaxCode('ZERO_RATED' as TaxCategory)).toBe(RraTaxCode.C);
    });

    it('maps EXEMPT → A (0% Exempted)', () => {
      expect(TaxService.getTaxCode('EXEMPT' as TaxCategory)).toBe(RraTaxCode.A);
    });

    it('maps NON_TAXABLE → D (0% Non-Taxable)', () => {
      expect(TaxService.getTaxCode('NON_TAXABLE' as TaxCategory)).toBe(RraTaxCode.D);
    });
  });

  describe('getExpectedTaxRate — enforces RRA spec rates', () => {
    it('TAX_A expects 0%', () => {
      expect(TaxService.getExpectedTaxRate(RraTaxCode.A)).toBe(0);
    });

    it('TAX_B expects 18%', () => {
      expect(TaxService.getExpectedTaxRate(RraTaxCode.B)).toBe(18);
    });

    it('TAX_C expects 0%', () => {
      expect(TaxService.getExpectedTaxRate(RraTaxCode.C)).toBe(0);
    });

    it('TAX_D expects 0%', () => {
      expect(TaxService.getExpectedTaxRate(RraTaxCode.D)).toBe(0);
    });
  });

  describe('validateTaxRate — rejects invalid rates', () => {
    it('accepts TAX_B with rate 18', () => {
      const result = TaxService.validateTaxRate(RraTaxCode.B, 18);
      expect(result.valid).toBe(true);
      expect(result.expectedRate).toBe(18);
    });

    it('rejects TAX_B with rate 15', () => {
      const result = TaxService.validateTaxRate(RraTaxCode.B, 15);
      expect(result.valid).toBe(false);
    });

    it('rejects TAX_B with rate 5', () => {
      const result = TaxService.validateTaxRate(RraTaxCode.B, 5);
      expect(result.valid).toBe(false);
    });

    it('accepts TAX_A with rate 0', () => {
      expect(TaxService.validateTaxRate(RraTaxCode.A, 0).valid).toBe(true);
    });

    it('rejects TAX_A with rate 18', () => {
      expect(TaxService.validateTaxRate(RraTaxCode.A, 18).valid).toBe(false);
    });

    it('accepts TAX_C with rate 0', () => {
      expect(TaxService.validateTaxRate(RraTaxCode.C, 0).valid).toBe(true);
    });

    it('accepts TAX_D with rate 0', () => {
      expect(TaxService.validateTaxRate(RraTaxCode.D, 0).valid).toBe(true);
    });
  });

  describe('ALLOWED_TAX_CODES — only A, B, C, D are allowed', () => {
    it('includes A', () => expect(TaxService.ALLOWED_TAX_CODES.has(RraTaxCode.A)).toBe(true));
    it('includes B', () => expect(TaxService.ALLOWED_TAX_CODES.has(RraTaxCode.B)).toBe(true));
    it('includes C', () => expect(TaxService.ALLOWED_TAX_CODES.has(RraTaxCode.C)).toBe(true));
    it('includes D', () => expect(TaxService.ALLOWED_TAX_CODES.has(RraTaxCode.D)).toBe(true));
    it('excludes E (internal use only)', () => expect(TaxService.ALLOWED_TAX_CODES.has(RraTaxCode.E)).toBe(false));
  });

  describe('resolveProductTaxCode — VAT-registration and tax-exemption precedence', () => {
    it('VAT-registered, not exempt: uses the product category code', () => {
      expect(TaxService.resolveProductTaxCode(null, 'STANDARD', true, false)).toBe(RraTaxCode.B);
      expect(TaxService.resolveProductTaxCode(null, 'EXEMPT', true, false)).toBe(RraTaxCode.A);
      expect(TaxService.resolveProductTaxCode(null, 'ZERO_RATED', true, false)).toBe(RraTaxCode.C);
    });

    it('not VAT-registered: forces code D regardless of product category', () => {
      expect(TaxService.resolveProductTaxCode(null, 'STANDARD', false, false)).toBe(RraTaxCode.D);
      expect(TaxService.resolveProductTaxCode(RraTaxCode.B, 'STANDARD', false, false)).toBe(RraTaxCode.D);
    });

    it('tax-exempt entity: forces code A regardless of VAT-registration or product category', () => {
      expect(TaxService.resolveProductTaxCode(RraTaxCode.B, 'STANDARD', true, true)).toBe(RraTaxCode.A);
      expect(TaxService.resolveProductTaxCode(RraTaxCode.B, 'STANDARD', false, true)).toBe(RraTaxCode.A);
    });

    it('a non-VAT-registered account is never silently treated as VAT registered', () => {
      // Even an explicit product-level standard tax code must not survive when the org isn't VAT registered.
      expect(TaxService.resolveProductTaxCode(RraTaxCode.B, 'STANDARD', false)).not.toBe(RraTaxCode.B);
    });
  });
});

// ============================================================================
// Module 2: INVOICE — Response Parsing (RRA VSDC API v1.0.5 §3.3.6.1)
// ============================================================================
describe('INVOICE — parseVsdcResponse (/trnsSales/saveSales response)', () => {
  it('parses a successful sales-transaction response', () => {
    const vsdcResponse = {
      resultCd: '000',
      resultMsg: 'It is succeeded',
      resultDt: '20211027162114',
      data: {
        rcptNo: 27,
        intrlData: 'GZGGIZLYTJSSD7YLYLGIIG6FCY',
        rcptSign: 'TQZMKL57AGBMSTPO',
        totRcptNo: 32,
        vsdcRcptPbctDate: '20211027162114',
        sdcId: 'SDC010000005',
        mrcNo: 'WIS01006230',
      },
    };

    const result = parseVsdcResponse(vsdcResponse);

    expect(result.rcptNo).toBe('27');
    expect(result.intrlData).toBe('GZGGIZLYTJSSD7YLYLGIIG6FCY');
    expect(result.vsdcSignature).toBe('TQZMKL57AGBMSTPO');
    expect(result.totRcptNo).toBe('32');
    expect(result.sdcId).toBe('SDC010000005');
    expect(result.sdcDateTime).toBe('2021-10-27T16:21:14');
  });

  it('returns empty fallback when response is null', () => {
    const result = parseVsdcResponse(null);
    expect(result.rcptNo).toBe('');
    expect(result.intrlData).toBe('');
    expect(result.vsdcSignature).toBe('');
    expect(result.totRcptNo).toBe('');
    expect(result.sdcId).toBe('');
    expect(result.sdcDateTime).toBe('');
  });

  it('returns empty fallback when response is not an object', () => {
    const result = parseVsdcResponse('invalid');
    expect(result.rcptNo).toBe('');
  });
});

describe('parseVsdcStatusCode (§4.14 API Response Code)', () => {
  it('resultCd "000" is success, not an error', () => {
    const status = parseVsdcStatusCode({ resultCd: '000', resultMsg: 'It is succeeded' });
    expect(status.isError).toBe(false);
    expect(status.code).toBe('000');
  });

  it('any other resultCd is an error, using resultMsg verbatim', () => {
    const status = parseVsdcStatusCode({ resultCd: '910', resultMsg: 'Request parameter error' });
    expect(status.isError).toBe(true);
    expect(status.message).toBe('Request parameter error');
  });

  it('falls back to the §4.14 table when resultMsg is absent', () => {
    const status = parseVsdcStatusCode({ resultCd: '881' });
    expect(status.isError).toBe(true);
    expect(status.message).toBe('Purchase is mandatory');
  });
});

// ============================================================================
// Module 3: REFUND — Gateway Error Parsing
// ============================================================================
describe('REFUND — error response parsing', () => {
  it('parseGatewayResponse extracts qrPayload from RRA nested structure', () => {
    const raw = {
      RESPONSE: {
        MESSAGE: {
          num: 'SAP12320t001',
          ysdcregsig: 'HLTC-GCDF-PJEI-U7F4',
        },
        STATUS: 'SUCCESS',
        QR_CODE: '?DATA=TEST123',
      },
    };

    const result = parseGatewayResponse(raw);
    expect(result.receiptQrPayload).toBe('?DATA=TEST123');
  });

  it('parseGatewayResponse returns empty object for non-object', () => {
    expect(parseGatewayResponse(null)).toEqual({});
  });
});

// ============================================================================
// Module 4: Error Message Extraction
// ============================================================================
describe('gatewayErrorMessage', () => {
  it('extracts message from HTTP JSON body', () => {
    const http = { json: { message: 'Total amount is different' }, status: 400 };
    expect(gatewayErrorMessage(http, 'fallback')).toBe('Total amount is different');
  });

  it('falls back when message is empty', () => {
    const http = { json: { message: '' }, status: 400 };
    expect(gatewayErrorMessage(http, 'fallback')).toBe('fallback');
  });

  it('falls back when json is null', () => {
    const http = { json: null, status: 400 };
    expect(gatewayErrorMessage(http, 'fallback')).toBe('fallback');
  });
});

// ============================================================================
// Module 5: INVENTORY / ITEMS — Edge Cases
// ============================================================================
describe('INVENTORY — response parsing edge cases', () => {
  it('parses RRA inventory error response (empty reference)', () => {
    const errorResponse = {
      errors: ['Please provide inventory document Id'],
      timestamp: '2023-11-03 10:24:24',
      status: 400,
    };

    const result = parseGatewayResponse(errorResponse);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Module 6: Calculation Precision — Item Tax Calculation
// ============================================================================
describe('TAX CALCULATION — decimal precision and resilience', () => {
  describe('calculateItemTax', () => {
    const standardRate = new Decimal(18);

    it('calculates inclusive TAX_B correctly (unitPrice includes VAT)', () => {
      const result = TaxService.calculateItemTax(
        118, 1, 'STANDARD' as TaxCategory, standardRate,
      );
      expect(Number(result.totalAmount)).toBe(118);
      expect(Number(result.taxableAmount)).toBeCloseTo(100, 2);
      expect(Number(result.taxAmount)).toBeCloseTo(18, 2);
      expect(result.taxCode).toBe(RraTaxCode.B);
    });

    it('TAX_A (EXEMPT) has zero VAT', () => {
      const result = TaxService.calculateItemTax(
        100, 1, 'EXEMPT' as TaxCategory, standardRate,
      );
      expect(Number(result.taxAmount)).toBe(0);
      expect(Number(result.taxableAmount)).toBe(100);
      expect(result.taxCode).toBe(RraTaxCode.A);
    });

    it('TAX_C (ZERO_RATED / Export) has zero VAT', () => {
      const result = TaxService.calculateItemTax(
        200, 5, 'ZERO_RATED' as TaxCategory, standardRate,
      );
      expect(Number(result.taxAmount)).toBe(0);
      expect(Number(result.totalAmount)).toBe(1000);
      expect(result.taxCode).toBe(RraTaxCode.C);
    });

    it('TAX_D (NON_TAXABLE) has zero VAT', () => {
      const result = TaxService.calculateItemTax(
        50, 3, 'NON_TAXABLE' as TaxCategory, standardRate,
      );
      expect(Number(result.taxAmount)).toBe(0);
      expect(Number(result.totalAmount)).toBe(150);
      expect(result.taxCode).toBe(RraTaxCode.D);
    });

    it('handles fractional quantities without floating-point error', () => {
      const result = TaxService.calculateItemTax(
        100.50, 2.5, 'STANDARD' as TaxCategory, standardRate,
      );
      expect(Number(result.totalAmount)).toBeCloseTo(251.25, 2);
      expect(Number(result.taxAmount)).toBeCloseTo(38.33, 2);
    });

    it('handles large quantities without overflow', () => {
      const result = TaxService.calculateItemTax(
        999999.99, 9999, 'STANDARD' as TaxCategory, standardRate,
      );
      expect(Number(result.totalAmount)).toBeCloseTo(999999.99 * 9999, 2);
    });
  });

  describe('calculateSaleTax — aggregates across items', () => {
    it.skip('sums multiple items with mixed tax codes (requires DB)', async () => {
      const summary = await TaxService.calculateSaleTax(1, [
        { productId: 1, quantity: 1, unitPrice: 118 },
        { productId: 2, quantity: 2, unitPrice: 50 },
        { productId: 3, quantity: 1, unitPrice: 200 },
      ]);

      expect(Number(summary.vatAmount)).toBeCloseTo(18, 2);
      expect(summary.items).toHaveLength(3);
      expect(summary.items[0].taxCode).toBe(RraTaxCode.B);
      expect(summary.items[1].taxCode).toBe(RraTaxCode.A);
      expect(summary.items[2].taxCode).toBe(RraTaxCode.C);
    });
  });
});

// ============================================================================
// Module 7: RECEIPT RENDERING — shared helpers used by all three renderers
// (invoice-pdf.service, invoice-render.service, invoice-receipt-pdf.service)
// ============================================================================

function makeItem(overrides: Partial<RenderInvoiceLineItem> = {}): RenderInvoiceLineItem {
  return {
    line: 1,
    code: 'ITEM-1',
    description: 'Test item',
    quantity: 1,
    unit: 'PCS',
    unitPrice: 100,
    discountPct: 0,
    discountAmt: 0,
    taxCode: 'A',
    vatPct: 0,
    taxAmount: 0,
    subtotal: 100,
    net: 100,
    total: 100,
    ...overrides,
  };
}

function makePayload(overrides: {
  items?: RenderInvoiceLineItem[]
  invoice?: Partial<RenderInvoicePayload['invoice']>
  certification?: Partial<RenderInvoicePayload['certification']>
} = {}): RenderInvoicePayload {
  return {
    company: { name: 'Test Co', ebmLinked: true },
    customer: { name: 'Walk-in' },
    invoice: {
      invoiceNumber: 'INV-1',
      receiptNumber: 'INV-1',
      invoiceDate: new Date().toISOString(),
      time: '10:00:00',
      paymentMethod: 'CASH',
      cashier: 'Cashier',
      status: 'COMPLETED',
      isProforma: false,
      isCopy: false,
      currency: 'RWF',
      ...overrides.invoice,
    },
    items: overrides.items ?? [makeItem()],
    totals: { subtotal: 100, discount: 0, taxable: 100, vat: 0, tax: 0, shipping: 0, paid: 100, balance: 0, grandTotal: 100 },
    charges: { vatAmount: 0, taxableAmount: 100, discountAmount: 0, cashAmount: 100, insuranceAmount: 0, debtAmount: 0, totalAmount: 100, shipping: 0 },
    payment: {},
    sdcInformation: {},
    certification: { isCertified: true, ...overrides.certification },
    verification: {},
    branding: {},
  };
}

describe('taxGroups — RRA checklist §46/§48/§49 (A/B/C/D tax label printing)', () => {
  it('§48: tax code B always appears at the statutory rate, even with zero sales', () => {
    const groups = taxGroups(makePayload({ items: [makeItem({ taxCode: 'A', vatPct: 0 })] }));
    const bGroup = groups.find((g) => g.code === 'B');
    expect(bGroup).toBeDefined();
    expect(bGroup!.rate).toBe(18);
    expect(bGroup!.total).toBe(0);
    expect(bGroup!.tax).toBe(0);
  });

  it('§49: tax codes A/C/D only appear when a line item actually used them', () => {
    const groups = taxGroups(makePayload({ items: [makeItem({ taxCode: 'B', vatPct: 18, taxAmount: 18 })] }));
    expect(groups.find((g) => g.code === 'A')).toBeUndefined();
    expect(groups.find((g) => g.code === 'C')).toBeUndefined();
    expect(groups.find((g) => g.code === 'D')).toBeUndefined();
  });

  it('§46: a used code accumulates totals from its line items, on top of the forced B row', () => {
    const groups = taxGroups(makePayload({
      items: [
        makeItem({ taxCode: 'A', vatPct: 0, total: 50, taxAmount: 0 }),
        makeItem({ taxCode: 'A', vatPct: 0, total: 30, taxAmount: 0 }),
      ],
    }));
    const aGroup = groups.find((g) => g.code === 'A');
    expect(aGroup!.total).toBe(80);
    expect(groups.find((g) => g.code === 'B')).toBeDefined();
  });
});

// ============================================================================
// REFUND fiscalisation — RRA checklist §9/§56 (a refund mirrors the original
// with the correct tax code and every amount negated)
// ============================================================================

function makeRefundSale(): SaleWithRelations {
  return {
    id: 2,
    saleNumber: 'REFUND-SALE-1-123',
    invoiceNumber: 'INV-1000-B1-2026-000002',
    vsdcInvcNo: 2,
    rcptLabel: 'NR',
    createdAt: new Date('2026-08-30T09:00:00.000Z'),
    status: 'REFUNDED',
    paymentType: 'CASH',
    cashAmount: new Decimal(-1180),
    debtAmount: new Decimal(0),
    insuranceAmount: new Decimal(0),
    totalAmount: new Decimal(-1180),
    taxableAmount: new Decimal(-1000),
    vatAmount: new Decimal(-180),
    branchId: 1,
    branch: { id: 1, name: 'Main', code: 'M', bhfId: '00', ebmDeviceId: 'SDC1', ebmSerialNo: 'MRC1' },
    customer: { id: 5, name: 'Client', phone: '0788000000', TIN: '100000000', customerType: 'INDIVIDUAL', email: null },
    user: { id: 1, name: 'Cashier' },
    saleItems: [
      {
        productId: 10,
        quantity: -1,
        unitPrice: new Decimal(1180),
        totalPrice: new Decimal(-1180),
        taxRate: new Decimal(18),
        taxAmount: new Decimal(-180),
        taxCode: 'B',
        dcRate: new Decimal(0),
        dcAmt: new Decimal(0),
        product: { name: 'Widget', itemCd: 'RW2CTU0000001', itemClsCd: null, pkgUnitCd: 'CT', qtyUnitCd: 'U', packagingQty: null },
      },
    ],
  };
}

describe('buildRraSendReceiptPayload — refund tax mirroring (§9/§56)', () => {
  it('submits the original tax code B and a positive extracted VAT on a refund', () => {
    const payload = buildRraSendReceiptPayload(
      makeRefundSale(),
      { TIN: '100000000', name: 'Seller', address: 'Kigali' },
      { orgInvcNo: 1, rfdDt: new Date('2026-08-30T09:00:00.000Z'), rfdRsnCd: '06' },
    ) as any;

    expect(payload.rcptTyCd).toBe('R');
    expect(payload.salesSttsCd).toBe('05');
    expect(payload.itemList[0].taxTyCd).toBe('B');
    expect(payload.itemList[0].taxAmt).toBe(180);
    expect(payload.taxAmtB).toBe(180);
    expect(payload.taxblAmtB).toBe(1180);
    expect(payload.totTaxAmt).toBe(180);
  });
});

describe('validateVsdcEnvelope — RRA checklist §22 (device connectivity/TIN preconditions)', () => {
  const base = { bhfId: '00', sdcId: 'SDC1', mrcNo: 'MRC1', dvcSrlNo: 'MRC1', env: 'sandbox' };
  it('passes a well-formed 9-digit TIN with a configured serial', () => {
    expect(validateVsdcEnvelope({ ...base, tin: '100000000' })).toBeNull();
  });
  it('rejects a missing or malformed TIN', () => {
    expect(validateVsdcEnvelope({ ...base, tin: '' })).toMatch(/TIN/);
    expect(validateVsdcEnvelope({ ...base, tin: '12345' })).toMatch(/TIN/);
  });
  it('rejects a missing device serial', () => {
    expect(validateVsdcEnvelope({ ...base, tin: '100000000', mrcNo: '', dvcSrlNo: '' })).toMatch(/device serial/);
  });
});

describe('documentIndicator / isFormalNoticeIndicator — RRA checklist §55', () => {
  it('a normal, certified sale has no watermark and no "not official" notice', () => {
    const data = makePayload();
    expect(documentIndicator(data)).toBe('');
    expect(isFormalNoticeIndicator(documentIndicator(data)) || !data.certification.isCertified).toBe(false);
  });

  it('proforma is watermarked PROFORMA and always carries the notice', () => {
    const data = makePayload({ invoice: { isProforma: true } });
    expect(documentIndicator(data)).toBe('PROFORMA');
    expect(isFormalNoticeIndicator(documentIndicator(data))).toBe(true);
  });

  it('copy is watermarked COPY and always carries the notice', () => {
    const data = makePayload({ invoice: { isCopy: true } });
    expect(documentIndicator(data)).toBe('COPY');
    expect(isFormalNoticeIndicator(documentIndicator(data))).toBe(true);
  });

  it('a sale not yet certified by VSDC falls back to the notice even without a watermark', () => {
    const data = makePayload({ certification: { isCertified: false } });
    expect(documentIndicator(data)).toBe('');
    expect(isFormalNoticeIndicator(documentIndicator(data)) || !data.certification.isCertified).toBe(true);
  });
});
