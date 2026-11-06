import { describe, expect, it } from 'vitest';
import {
  chargedUnitFromSaleLine,
  findDiscountPolicyViolation,
  maxDiscountPercentError,
  resolveLineDiscount,
  vsdcDiscountRate,
} from '../src/services/discount.service';
import { planRefundLines } from '../src/services/refund-calculation.service';

describe('resolveLineDiscount', () => {
  it('reproduces the CIS Art. 13 sample: 33600 x 0.200, discount -25% -> 5040', () => {
    expect(resolveLineDiscount({ quantity: 0.2, chargedUnit: 25200, catalogUnit: 33600 })).toEqual({
      listUnit: 33600,
      dcAmt: 1680,
      dcRate: 25,
    });
  });

  it('reports a discount even when the client did not claim one', () => {
    const d = resolveLineDiscount({ quantity: 3, chargedUnit: 800, catalogUnit: 1000 });
    expect(d).toEqual({ listUnit: 1000, dcAmt: 600, dcRate: 20 });
  });

  it('ignores an invented discount on a line sold at catalog price', () => {
    const d = resolveLineDiscount({ quantity: 1, chargedUnit: 1000, claimedDiscount: 200, catalogUnit: 1000 });
    expect(d).toEqual({ listUnit: 1000, dcAmt: 0, dcRate: 0 });
  });

  it('records no discount for a price above catalog', () => {
    expect(resolveLineDiscount({ quantity: 2, chargedUnit: 1200, catalogUnit: 1000 })).toEqual({
      listUnit: 1200,
      dcAmt: 0,
      dcRate: 0,
    });
  });

  it('trusts the claimed discount only without a catalog price, and stays exact to the cent', () => {
    const d = resolveLineDiscount({ quantity: 3, chargedUnit: 100, claimedDiscount: 10 });
    expect(d.listUnit).toBe(103.33);
    expect(d.dcAmt).toBe(9.99);
    expect(Math.round((3 * d.listUnit - d.dcAmt) * 100) / 100).toBe(300);
  });

  it.each([
    [999, 665.93, 100],
    [33333.33, 24999.99, 0.333],
    [1234.56, 987.65, 7.125],
    [7000, 6000, 3],
  ])('gross - discount equals the charged total (list %s, charged %s, qty %s)', (list, charged, qty) => {
    const d = resolveLineDiscount({ quantity: qty, chargedUnit: charged, catalogUnit: list });
    const gross = Math.round(qty * d.listUnit * 100) / 100;
    const net = Math.round(qty * charged * 100) / 100;
    expect(Math.round((gross - d.dcAmt) * 100) / 100).toBe(net);
    expect(d.dcAmt).toBeLessThanOrEqual(gross);
  });
});

describe('vsdcDiscountRate (WAR CustomValidationService.validateItemAmounts)', () => {
  it('keeps a rate that reproduces the amount', () => {
    expect(vsdcDiscountRate(6720, 1680, 25)).toBe(25);
    expect(vsdcDiscountRate(620, 100, 16.13)).toBe(16.13);
  });

  it('sends 0 when a two-decimal rate cannot reproduce the amount within 0.1', () => {
    // 14.29% of 7000 is 1000.30, which the validator would reject against dcAmt 1000.
    expect(vsdcDiscountRate(7000, 1000, 14.29)).toBe(0);
  });

  it('replaces a wrong stored rate with one that works', () => {
    expect(vsdcDiscountRate(1000, 250, 20)).toBe(25);
  });

  it('sends 0 when there is no discount', () => {
    expect(vsdcDiscountRate(1000, 0, 0)).toBe(0);
  });
});

describe('chargedUnitFromSaleLine', () => {
  it('returns what the customer pays, not the stored list price', () => {
    expect(chargedUnitFromSaleLine({ quantity: 3, unitPrice: 1000, dcAmt: 600 })).toBe(800);
    expect(chargedUnitFromSaleLine({ quantity: 2, unitPrice: 500, dcAmt: 0 })).toBe(500);
  });
});

describe('findDiscountPolicyViolation', () => {
  const line = { name: 'Bread', listUnit: 1000, dcAmt: 300, dcRate: 30 };
  const base = { lines: [line], chargedUnits: [700], allowManualDiscounts: true };

  it('allows any discount when no limit is set (the default)', () => {
    expect(findDiscountPolicyViolation({ ...base, maxDiscountPercent: null, role: 'SELLER' })).toBeNull();
  });

  it('blocks a seller above the limit', () => {
    expect(findDiscountPolicyViolation({ ...base, maxDiscountPercent: 10, role: 'SELLER' })).toContain('10% limit');
  });

  it('allows a seller at the limit', () => {
    expect(findDiscountPolicyViolation({ ...base, maxDiscountPercent: 30, role: 'SELLER' })).toBeNull();
  });

  it.each(['ADMIN', 'BRANCH_MANAGER', 'SYSTEM_OWNER'])('exempts %s from the limit', (role) => {
    expect(findDiscountPolicyViolation({ ...base, maxDiscountPercent: 10, role })).toBeNull();
  });

  it("lets a seller sell at an item's saved discount, above their limit or with manual discounts off", () => {
    const saved = { ...line, approvedRate: 30 };
    expect(findDiscountPolicyViolation({ ...base, lines: [saved], maxDiscountPercent: 10, role: 'SELLER' })).toBeNull();
    expect(findDiscountPolicyViolation({ ...base, lines: [saved], allowManualDiscounts: false, role: 'SELLER' })).toBeNull();
  });

  it("still blocks a seller going beyond an item's saved discount", () => {
    const saved = { ...line, approvedRate: 20 };
    expect(findDiscountPolicyViolation({ ...base, lines: [saved], maxDiscountPercent: 10, role: 'SELLER' })).toContain('10% limit');
  });

  it('blocks every role when manual discounts are off', () => {
    const result = findDiscountPolicyViolation({ ...base, allowManualDiscounts: false, role: 'ADMIN' });
    expect(result).toContain('Manual price overrides are disabled');
  });
});

describe('partial refund of a discounted line', () => {
  it('keeps gross - discount equal to the refunded total when both round', () => {
    const line = {
      saleItemId: 1, productId: 1, serviceName: null, serviceDescription: null,
      quantity: 3, unitPrice: 33.33, totalPrice: 66.67, taxRate: 18, taxAmount: 10.17,
      taxCode: 'B', dcRate: 33.32, dcAmt: 33.32, measurementUnit: 'PCS', itemType: 'PRODUCT',
    };
    const [leg] = planRefundLines([line], [], [{ saleItemId: 1, quantity: 1 }]);
    const gross = Math.round(Math.abs(leg.quantity) * leg.unitPrice * 100) / 100;
    expect(Math.round((gross + leg.dcAmt) * 100) / 100).toBe(Math.abs(leg.totalPrice));
  });
});

describe('maxDiscountPercentError', () => {
  it('accepts no limit and values from 0 to 100', () => {
    for (const v of [null, undefined, 0, 12.5, 100]) expect(maxDiscountPercentError(v)).toBeNull();
  });
  it('rejects anything else', () => {
    for (const v of [-1, 101, '10', NaN]) expect(maxDiscountPercentError(v)).not.toBeNull();
  });
});
