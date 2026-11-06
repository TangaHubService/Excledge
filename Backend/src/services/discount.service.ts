import { round2, toDecimal, type MoneyInput } from './money.service';

/**
 * Line discounts for RRA CIS/VSDC.
 *
 * RRA has no sale-level discount: CIS Art. 13 and VSDC TrnsSalesSaveWrReq carry a discount per item
 * (`dcRt`, `dcAmt`), with `prc`/`splyAmt` at the list price and `taxblAmt`/`totAmt` net of it.
 */

/** VSDC CustomValidationService.AMOUNT_TOLERANCE (rraVsdcSandbox 3.0.2). */
const VSDC_AMOUNT_TOLERANCE = 0.1;
/** Allowance for a percentage that moves slightly once the unit price is rounded to cents. */
const RATE_ROUNDING_ALLOWANCE = 0.01;
/** A manual price change below catalog of at most this much is treated as rounding, not a discount. */
const PRICE_ROUNDING_ALLOWANCE = 0.01;
/** Roles that grant discounts above the organization's limit (the "manager override"). */
const DISCOUNT_LIMIT_EXEMPT_ROLES = new Set(['SYSTEM_OWNER', 'ADMIN', 'BRANCH_MANAGER']);

export interface LineDiscountInput {
  quantity: MoneyInput;
  /** Tax-inclusive unit price the customer actually pays. */
  chargedUnit: MoneyInput;
  /** Client-claimed line discount. Only trusted when the line has no catalog price. */
  claimedDiscount?: MoneyInput | null;
  catalogUnit?: MoneyInput | null;
}

export interface LineDiscount {
  /** List unit price, stored as SaleItem.unitPrice and sent to VSDC as `prc`. */
  listUnit: number;
  /** Discount amount, always round2(qty x list) - round2(qty x charged) so net equals the line total. */
  dcAmt: number;
  dcRate: number;
}

/**
 * Works out a line's discount. The catalog price is authoritative: the discount on a catalog line
 * is always the gap between catalog and charged price, so a below-catalog sale can't reach RRA
 * without a discount, and a client can't invent one on a line sold at catalog price.
 */
export function resolveLineDiscount(input: LineDiscountInput): LineDiscount {
  const quantity = toDecimal(input.quantity);
  const charged = toDecimal(input.chargedUnit);
  const catalog = toDecimal(input.catalogUnit);
  const claimed = toDecimal(input.claimedDiscount);

  let list = charged;
  if (catalog.gt(0)) {
    if (charged.lt(catalog)) list = catalog;
  } else if (claimed.gt(0) && quantity.gt(0)) {
    list = toDecimal(round2(charged.plus(claimed.div(quantity))));
  }

  const gross = round2(quantity.mul(list));
  const net = round2(quantity.mul(charged));
  const dcAmt = round2(toDecimal(gross).minus(net));
  if (dcAmt <= 0 || gross <= 0) {
    return { listUnit: round2(charged), dcAmt: 0, dcRate: 0 };
  }
  return {
    listUnit: round2(list),
    dcAmt,
    dcRate: Math.min(100, round2(toDecimal(dcAmt).div(gross).mul(100))),
  };
}

/** Unit price the customer pays on a stored line, whose `unitPrice` is the list price. */
export function chargedUnitFromSaleLine(line: {
  quantity: MoneyInput;
  unitPrice: MoneyInput;
  dcAmt?: MoneyInput | null;
}): number {
  const quantity = toDecimal(line.quantity);
  const unit = toDecimal(line.unitPrice);
  if (quantity.isZero()) return unit.toNumber();
  return unit.minus(toDecimal(line.dcAmt).abs().div(quantity.abs())).toNumber();
}

/**
 * The `dcRt` to send to VSDC. The validator rejects a line when dcRt > 0 and
 * dcRt x splyAmt / 100 is more than 0.1 from dcAmt, and skips that check when dcRt is 0. With only
 * two decimals a rate can't always reproduce the amount (7000 at 6000 is 14.29%, which gives
 * 1000.30), so such a line sends 0 and relies on the exact dcAmt.
 */
export function vsdcDiscountRate(splyAmt: number, dcAmt: number, storedRate: MoneyInput): number {
  if (splyAmt <= 0 || dcAmt <= 0) return 0;
  const reproduces = (rate: number) =>
    rate > 0 && rate <= 100 && Math.abs(round2((rate * splyAmt) / 100) - dcAmt) <= VSDC_AMOUNT_TOLERANCE;
  const stored = round2(toDecimal(storedRate).abs());
  if (reproduces(stored)) return stored;
  const recomputed = round2((dcAmt / splyAmt) * 100);
  return reproduces(recomputed) ? recomputed : 0;
}

export interface DiscountPolicyLine extends LineDiscount {
  name: string;
  /** The item's saved discount, already approved by a manager. Selling at it breaks no rule. */
  approvedRate?: number;
}

/** Saved item discounts bypass the seller limit, so only managers may set them. */
export function canManageItemDiscounts(role: string | null | undefined): boolean {
  return Boolean(role && DISCOUNT_LIMIT_EXEMPT_ROLES.has(role));
}

/** Why these lines can't be sold under the organization's discount rules, or null when they can. */
export function findDiscountPolicyViolation(params: {
  lines: DiscountPolicyLine[];
  chargedUnits: number[];
  allowManualDiscounts: boolean;
  maxDiscountPercent?: number | null;
  role?: string | null;
}): string | null {
  const { lines, chargedUnits, allowManualDiscounts, maxDiscountPercent, role } = params;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.dcAmt <= 0 || line.dcRate <= (line.approvedRate ?? 0) + RATE_ROUNDING_ALLOWANCE) continue;
    if (!allowManualDiscounts && line.listUnit - chargedUnits[i] > PRICE_ROUNDING_ALLOWANCE) {
      return `Manual price overrides are disabled for this organization. "${line.name}" must be sold at ${line.listUnit}.`;
    }
    if (
      maxDiscountPercent != null &&
      !canManageItemDiscounts(role) &&
      line.dcRate > maxDiscountPercent + RATE_ROUNDING_ALLOWANCE
    ) {
      return `The ${line.dcRate}% discount on "${line.name}" is above your ${maxDiscountPercent}% limit. Ask a manager to complete this sale.`;
    }
  }
  return null;
}

/** Validates the maxDiscountPercent setting. Returns an error message, or null when valid. */
export function maxDiscountPercentError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    return 'The maximum discount must be between 0 and 100 percent';
  }
  return null;
}
