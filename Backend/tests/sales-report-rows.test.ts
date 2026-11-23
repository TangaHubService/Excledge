import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

import { buildSalesReportBody, type SalesReportSale } from '../src/controllers/report-pdf.controller';

/**
 * RRA Sales report rows: every receipt type (NS, NR, TS, TR, PS) is listed, but only NS/NR add up
 * to "Total Sales" so the figure still matches RRA. Training and proforma get their own totals.
 */

let nextId = 1;
function sale(over: Partial<SalesReportSale> = {}): SalesReportSale {
  const id = nextId++;
  return {
    id,
    createdAt: new Date(`2026-11-20T08:${String(id).padStart(2, '0')}:00`),
    status: 'COMPLETED',
    isProforma: false,
    rcptLabel: 'NS',
    reprintCount: 1,
    paymentType: 'CASH',
    totalAmount: 1180,
    vatAmount: 180,
    invoiceNumber: `INV-${id}`,
    saleNumber: `S-${id}`,
    vsdcInvcNo: id,
    localReceiptSeq: null,
    customer: { name: 'Buyer', TIN: '100000000', phone: null },
    salePayments: [{ paymentMethod: 'CASH' }],
    saleItems: [{ quantity: 1, serviceName: null, product: { name: 'Widget' } }],
    ...over,
  };
}

const TYPE = 8;
const AMOUNT = 5;
const VAT = 7;
const PAYMENT = 9;

describe('buildSalesReportBody', () => {
  const ns = sale({ totalAmount: 1180, vatAmount: 180 });
  const nr = sale({ status: 'REFUNDED', rcptLabel: 'NR', totalAmount: 590, vatAmount: 90 });
  const ts = sale({ rcptLabel: 'TS', totalAmount: 2360, vatAmount: 360 });
  const tr = sale({ status: 'REFUNDED', rcptLabel: 'TR', totalAmount: 1180, vatAmount: 180 });
  const ps = sale({ isProforma: true, rcptLabel: 'PS', totalAmount: 4720, vatAmount: 720 });
  const converted = sale({ isProforma: true, rcptLabel: 'PS', status: 'CONVERTED', totalAmount: 1000, vatAmount: 0 });

  const result = buildSalesReportBody([ns, nr, ts, tr, ps, converted]);

  it('lists every receipt type, labelled, in date order', () => {
    expect(result.body.map((r) => r[TYPE])).toEqual([
      'Sale',
      'Refund',
      'Training Sale',
      'Training Refund',
      'Proforma',
      'Proforma',
    ]);
    expect(result.body.map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('shows refunds (NR and TR) as negative amounts', () => {
    expect(result.body[1][AMOUNT]).toBe(-590);
    expect(result.body[1][VAT]).toBe(-90);
    expect(result.body[3][AMOUNT]).toBe(-1180);
  });

  it('counts only NS/NR towards Total Sales', () => {
    expect(result.total).toBe(1180 - 590);
    expect(result.vat).toBe(180 - 90);
  });

  it('gives training and proforma their own totals', () => {
    expect(result.notes[0]).toBe('Training receipts: 2 receipts, total 1,180.00, VAT 180.00 (not included in Total Sales).');
    expect(result.notes[1]).toBe('Proforma receipts: 2 receipts, total 5,720.00, VAT 720.00 (not included in Total Sales).');
  });

  it('leaves the payment method blank for proformas', () => {
    expect(result.body[4][PAYMENT]).toBe('');
    expect(result.body[0][PAYMENT]).not.toBe('');
  });

  it('treats an isProforma sale as PS even without the PS label', () => {
    const r = buildSalesReportBody([sale({ isProforma: true, rcptLabel: null })]);
    expect(r.body[0][TYPE]).toBe('Proforma');
    expect(r.total).toBe(0);
  });

  it('reports zero training/proforma when there are none', () => {
    const r = buildSalesReportBody([sale()]);
    expect(r.notes).toEqual([
      'Training receipts: 0 receipts, total 0.00, VAT 0.00 (not included in Total Sales).',
      'Proforma receipts: 0 receipts, total 0.00, VAT 0.00 (not included in Total Sales).',
    ]);
  });
});
