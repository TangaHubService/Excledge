import { TaxService } from '../src/services/tax.service';
import { parseVsdcResponse } from '../src/services/vsdc-api.service';
import { parseGatewayResponse, gatewayErrorMessage } from '../src/services/rra-ebm.service';
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
});

// ============================================================================
// Module 2: INVOICE — Response Parsing (RRA canonical fields)
// ============================================================================
describe('INVOICE — parseVsdcResponse (RRA canonical response)', () => {
  it('parses RRA success response with RESPONSE.MESSAGE structure', () => {
    const rraResponse = {
      RESPONSE: {
        DISTRIBUTOR_TIN: 999000025,
        MESSAGE: {
          flag: 'INVOICE',
          ysdcrecnum: '2/2 NS ISH:2',
          num: 'SAP12320t001',
          ysdcid: 'SDC009000057',
          ysdcintdata: 'S5AU-274J-FLNW-I4E5-6QG5-7DVE-EQ',
          ysdcmrc: 'VALG01VNA08',
          ysdcitems: 1,
          ysdcmrctim: '2024-03-21 16:21:36.944',
          ysdcregsig: 'HLTC-GCDF-PJEI-U7F4',
          ysdctime: '2024-03-21 16:21:36.944',
        },
        STATUS: 'SUCCESS',
        QR_CODE: '?DATA=S5QjrxaYnotNVt20BTA91QkNtMc6BieExFBNChbniZy1zDq7GXV+go2mJ1Krd5LtFwD7XIn+uwcqX4Lg9YADIen8U04X5iA+8ewNbSdakIsdnr/ETW9VQdtw4+rK2ejA2XQo3fJrmOW/DUGQRv9qwex31yxUAme4+DD83qOoGEZ08DTEenNAT0/+z0XtAgjLOhwW2UdG976cTfUmHP2IsEdKZ33D7PfO9gECcCqxmE4C5hV2rA4OjeDoZlbp+mCZXhfzdSAQG3VhjShLXJOArA==',
      },
    };

    const result = parseVsdcResponse(rraResponse);

    expect(result.rcptNo).toBe('SAP12320t001');
    expect(result.intrlData).toBe('S5AU-274J-FLNW-I4E5-6QG5-7DVE-EQ');
    expect(result.vsdcSignature).toBe('HLTC-GCDF-PJEI-U7F4');
    expect(result.qrPayload).toContain('?DATA=');
    expect(result.sdcDateTime).toBe('2024-03-21 16:21:36.944');
  });

  it('parses RRA refund response correctly', () => {
    const refundResponse = {
      RESPONSE: {
        DISTRIBUTOR_TIN: 'C000652902X',
        MESSAGE: {
          flag: 'REFUND',
          ysdcrecnum: '3307/3208 NR ISH:3208',
          num: 'SAP12320t01',
          ysdcid: 'VATES0000614',
          ysdcintdata: '3HW5-R74P-FY2H-J5YD-GZC6-B7BL-NE',
          ysdcmrc: 'VALG01CAP01',
          ysdcitems: 1,
          ysdcmrctim: '2023-11-03 10:11:40',
          ysdcregsig: 'VSWE-XNBG-JXPR-EJ7I',
          ysdctime: '2023-11-03 10:11:40',
        },
        STATUS: 'SUCCESS',
        QR_CODE: 'https://verify.url?DATA=ABC123',
      },
    };

    const result = parseVsdcResponse(refundResponse);

    expect(result.rcptNo).toBe('SAP12320t01');
    expect(result.vsdcSignature).toBe('VSWE-XNBG-JXPR-EJ7I');
    expect(result.intrlData).toBe('3HW5-R74P-FY2H-J5YD-GZC6-B7BL-NE');
    expect(result.qrPayload).toBe('https://verify.url?DATA=ABC123');
  });

  it('parses RRA purchase response (no QR_CODE for purchases)', () => {
    const purchaseResponse = {
      RESPONSE: {
        DISTRIBUTOR_TIN: 'C000652902X',
        MESSAGE: {
          flag: 'PURCHASE',
          ysdcrecnum: '',
          num: '1225299-ZR00134',
          ysdcid: 'VATES0000614',
          ysdcintdata: '',
          ysdcmrc: 'VALG01CAP01',
          ysdcitems: 1,
          ysdcmrctim: '2023-11-03 10:17:57',
          ysdcregsig: '',
          ysdctime: '2023-11-03 10:17:57',
        },
        STATUS: 'SUCCESS',
        QR_CODE: '',
      },
    };

    const result = parseVsdcResponse(purchaseResponse);

    expect(result.rcptNo).toBe('1225299-ZR00134');
    expect(result.qrPayload).toBe('');
    expect(result.vsdcSignature).toBe('');
  });

  it('returns empty fallback when response is null', () => {
    const result = parseVsdcResponse(null);
    expect(result.rcptNo).toBe('');
    expect(result.intrlData).toBe('');
    expect(result.vsdcSignature).toBe('');
    expect(result.qrPayload).toBe('');
    expect(result.sdcDateTime).toBe('');
  });

  it('returns empty fallback when response is not an object', () => {
    const result = parseVsdcResponse('invalid');
    expect(result.rcptNo).toBe('');
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
