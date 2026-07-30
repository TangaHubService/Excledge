import { describe, it, expect } from 'vitest';
import { TaxService } from '../src/services/tax.service';
import { parseVsdcResponse, parseVsdcStatusCode } from '../src/services/vsdc-api.service';
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
