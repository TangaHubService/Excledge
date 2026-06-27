import { toRraDate, toRraTime, fix2 } from './rra-ebm.service';
import type { SaleWithRelations } from './rra-ebm.service';

export interface SdcData {
  sdcId: string;
  mrcNo: string;
  sdcRcptNo: number;
  internalData: string;
  receiptSignature: string;
  sdcDateTime: Date;
}

/**
 * C8: Build the EJ_DATA text block sent to VSDC after every fiscal sale.
 * Format follows RRA CIS/VSDC spec §5 (Electronic Journal).
 */
export function buildElectronicJournal(
  sale: SaleWithRelations,
  rcptLabel: string,
  sdc: SdcData,
): string {
  const now = sdc.sdcDateTime;
  const lines: string[] = [];

  lines.push(`EJ_DATA`);
  lines.push(`DATE:${toRraDate(now)} TIME:${toRraTime(now)}`);
  lines.push(`SDC_ID:${sdc.sdcId} MRC:${sdc.mrcNo}`);
  lines.push(`RCPT_NO:${sdc.sdcRcptNo} TYPE:${rcptLabel}`);
  lines.push(`INVC:${sale.invoiceNumber ?? sale.saleNumber}`);
  lines.push(`CUST_TIN:${sale.customer.TIN ?? ''} PHONE:${sale.customer.phone ?? ''}`);
  lines.push(`---ITEMS---`);

  for (const si of sale.saleItems) {
    const name = si.product?.name ?? 'Item';
    const qty = si.quantity;
    const price = fix2(si.unitPrice.toNumber());
    const total = fix2(si.totalPrice.toNumber());
    const tax = fix2(si.taxAmount.toNumber());
    const code = (si.taxCode ?? 'A').toUpperCase();
    lines.push(`${name} x${qty} @${price} =${total} [${code}] TAX:${tax}`);
  }

  lines.push(`---TOTALS---`);
  lines.push(`TOTAL:${fix2(sale.totalAmount.toNumber())}`);
  lines.push(`INT_DATA:${sdc.internalData}`);
  lines.push(`SIGNATURE:${sdc.receiptSignature}`);
  lines.push(`EJ_END`);

  return lines.join('\n');
}
