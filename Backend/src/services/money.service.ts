import { Decimal } from '@prisma/client/runtime/library';

/**
 * Central money + tax arithmetic for RRA CIS/VSDC totals (spec §R4/R11).
 *
 * Every receipt, VSDC payload and fiscal report MUST derive its amounts from
 * this module so the three can never disagree. Policy (chosen for R11):
 *
 *  1. Prices are tax-INCLUSIVE. Tax is extracted, never added on top:
 *       tax     = net − net / (1 + rate/100)
 *       taxable = net − tax
 *     where net = qty × unitPrice − discount (the DISCOUNTED amount is what
 *     goes into the totals).
 *  2. Exactness first: per-line math stays in exact `Decimal` arithmetic.
 *     Rounding (half-up, 2 dp) happens ONCE per tax-rate bucket and once for
 *     the receipt totals — never per line — so rounding drift cannot break
 *     the R11 invariants.
 *  3. Receipt totals are DEFINED as the sum of the rounded bands, so these
 *     hold by construction:
 *       TOTAL      = Σ band sales (incl. exempt)
 *       TOTAL TAX  = Σ band taxes
 *
 * Input price contract: `unitPrice` is the LIST (pre-discount) unit price and
 * `discount` the absolute tax-inclusive line discount. Callers that already
 * hold post-discount (charged) prices pass `discount: 0`. The POS sends
 * charged prices + a separate discount; `commitSale` reconstructs the list
 * price for storage while tax stays computed on the charged (net) leg.
 */

export type FiscalBandCode = 'A' | 'B' | 'C' | 'D';

export const FISCAL_BAND_CODES: readonly FiscalBandCode[] = ['A', 'B', 'C', 'D'];

export type MoneyInput = number | string | Decimal;

export interface FiscalLineInput {
  /** Fractional quantities allowed (kg, litres…) — Decimal(15,3) in storage. */
  quantity: MoneyInput;
  /** LIST unit price, tax-inclusive, pre-discount. */
  unitPrice: MoneyInput;
  /** Absolute tax-inclusive line discount. Defaults to 0 (already-charged prices). */
  discount?: MoneyInput;
  taxCode: FiscalBandCode;
  /** Percent, e.g. 18 for 18%. Non-positive rates carry zero tax. */
  taxRate: MoneyInput;
}

export interface FiscalLineResult {
  /** qty × unitPrice, exact. */
  gross: Decimal;
  /** gross − discount, exact — the amount that enters the totals. */
  net: Decimal;
  /** net − tax, exact. */
  taxable: Decimal;
  /** net × rate/(100+rate) extracted from the inclusive net, exact. */
  tax: Decimal;
  taxCode: FiscalBandCode;
  rate: Decimal;
}

export interface FiscalBandResult {
  code: FiscalBandCode;
  /** Statutory rate for the band (percent). Informational — not derived. */
  rate: number;
  /** Rounded band sales (incl. tax). */
  sales: number;
  /** Rounded band taxable amount. */
  taxable: number;
  /** Rounded band tax amount. */
  tax: number;
}

export interface FiscalTotalsResult {
  bands: FiscalBandResult;
  /** Σ rounded band sales — the TOTAL to print and submit. */
  total: number;
  /** Σ rounded band taxable amounts. */
  totalTaxable: number;
  /** Σ rounded band taxes — the TOTAL TAX to print and submit. */
  totalTax: number;
}

function toDecimal(value: MoneyInput | undefined | null, fallback = 0): Decimal {
  if (value === undefined || value === null) return new Decimal(fallback);
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Round half-up to 2 decimals, returned as a JS number (e.g. 814.58). */
export function round2(value: MoneyInput): number {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function computeFiscalLine(line: FiscalLineInput): FiscalLineResult {
  const qty = toDecimal(line.quantity);
  const price = toDecimal(line.unitPrice);
  const discount = Decimal.max(0, toDecimal(line.discount, 0));
  const rate = toDecimal(line.taxRate, 0);

  const gross = qty.mul(price);
  const net = gross.minus(discount);
  let taxable = net;
  let tax = new Decimal(0);
  if (rate.gt(0)) {
    const divisor = new Decimal(1).plus(rate.div(100));
    taxable = net.div(divisor);
    tax = net.minus(taxable);
  }
  return { gross, net, taxable, tax, taxCode: line.taxCode, rate };
}

const BAND_INDEX: Record<FiscalBandCode, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * Aggregate exact per-line results into rounded per-rate bands.
 * `bandRates` carries the statutory percent per slot (informational only).
 */
export function computeFiscalTotals(
  lines: FiscalLineInput[],
  bandRates: [number, number, number, number] = [0, 18, 0, 0],
): FiscalTotalsResult {
  const exact: Array<{ sales: Decimal; taxable: Decimal; tax: Decimal }> = FISCAL_BAND_CODES.map(() => ({
    sales: new Decimal(0),
    taxable: new Decimal(0),
    tax: new Decimal(0),
  }));

  for (const line of lines) {
    const r = computeFiscalLine(line);
    const slot = exact[BAND_INDEX[r.taxCode]];
    slot.sales = slot.sales.plus(r.net);
    slot.taxable = slot.taxable.plus(r.taxable);
    slot.tax = slot.tax.plus(r.tax);
  }

  const bands = Object.fromEntries(
    FISCAL_BAND_CODES.map((code, i) => [
      code,
      {
        code,
        rate: bandRates[i],
        sales: round2(exact[i].sales),
        taxable: round2(exact[i].taxable),
        tax: round2(exact[i].tax),
      } as FiscalBandResult,
    ]),
  ) as FiscalTotalsResult['bands'];

  // Totals are the sum of the ROUNDED bands, so R11 holds by construction.
  const total = round2(FISCAL_BAND_CODES.reduce((s, c) => s + bands[c].sales, 0));
  const totalTaxable = round2(FISCAL_BAND_CODES.reduce((s, c) => s + bands[c].taxable, 0));
  const totalTax = round2(FISCAL_BAND_CODES.reduce((s, c) => s + bands[c].tax, 0));

  return { bands, total, totalTaxable, totalTax };
}
