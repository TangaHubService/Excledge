import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CartItem } from '../pages/dashboard/sales/pos';
import { useOrganization } from '../context/OrganizationContext';
import { buildRraQrString, dashEvery4, qrToDataUrl } from '../utils/qrCode';

// D2: extended EBM data returned from the sale API after VSDC fiscalization
export interface EbmReceiptData {
  sdcId?: string;
  mrcNo?: string;
  sdcRcptNo?: number;
  internalData?: string;
  receiptSignature?: string;
  sdcDateTime?: string;
  qrPayload?: string;
  rcptLabel?: string; // NS/NR/CS/CR/TS/TR/PS
}

interface TaxBandTotal {
  code: string;
  taxable: number;
  tax: number;
  total: number;
}

interface ReceiptProps {
  cart: CartItem[];
  total: number;
  subtotal: number;
  paymentMethod: string;
  receiptNumber: string;
  date: string;
  cashierName: string;
  customer: { name: string; phone: string; tin?: string };
  payed: number;
  unpaid: number;
  ebm?: EbmReceiptData;
}

const RCPT_LABEL_DISPLAY: Record<string, string> = {
  NS: 'Normal Sale',
  NR: 'Normal Refund',
  CS: 'Copy Sale',
  CR: 'Copy Refund',
  TS: 'Training Sale',
  TR: 'Training Refund',
  PS: 'Proforma Sale',
};

export const Receipt: React.FC<ReceiptProps> = ({
  cart,
  total,
  subtotal,
  paymentMethod,
  receiptNumber,
  date,
  cashierName,
  customer,
  payed,
  unpaid,
  ebm,
}) => {
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!ebm?.sdcId || !ebm.sdcRcptNo || !ebm.internalData || !ebm.receiptSignature) return;
    const qrStr = ebm.qrPayload ?? buildRraQrString({
      sdcDateTime: ebm.sdcDateTime ?? new Date().toISOString(),
      sdcId: ebm.sdcId,
      sdcRcptNo: ebm.sdcRcptNo,
      internalData: ebm.internalData,
      receiptSignature: ebm.receiptSignature,
    });
    qrToDataUrl(qrStr).then(setQrDataUrl).catch(() => {});
  }, [ebm]);

  // Compute per-tax-band totals from cart
  const taxBands: Record<string, TaxBandTotal> = {};
  for (const item of cart) {
    const code = (item.product.taxCode ?? 'A').toUpperCase();
    const itemTotal = item.quantity * item.unitPrice;
    const taxAmt = (item as any).taxAmount ?? 0;
    const taxable = itemTotal - taxAmt;
    if (!taxBands[code]) taxBands[code] = { code, taxable: 0, tax: 0, total: 0 };
    taxBands[code].taxable += taxable;
    taxBands[code].tax     += taxAmt;
    taxBands[code].total   += itemTotal;
  }

  const isCopy     = ebm?.rcptLabel === 'CS' || ebm?.rcptLabel === 'CR';
  const isTraining = ebm?.rcptLabel === 'TS' || ebm?.rcptLabel === 'TR';
  const isProforma = ebm?.rcptLabel === 'PS';

  return (
    <div className="p-4 max-w-xs mx-auto bg-white font-mono text-xs" id="receipt">
      {/* Watermarks */}
      {isCopy && (
        <div className="text-center font-bold text-lg border-2 border-black mb-2 py-1">COPY</div>
      )}
      {isTraining && (
        <div className="text-center font-bold text-lg border-2 border-red-500 text-red-500 mb-2 py-1">TRAINING — NOT FISCAL</div>
      )}
      {isProforma && (
        <div className="text-center font-bold text-lg border-2 border-blue-500 text-blue-500 mb-2 py-1">PROFORMA</div>
      )}

      {/* Header */}
      <div className="mb-3 text-center">
        {organization?.avatar && (
          <img src={organization.avatar} alt={organization?.name} className="h-16 w-16 mx-auto object-contain mb-1" />
        )}
        <p className="font-bold text-sm">{organization?.name || t('pos.yourBusinessName')}</p>
        {(organization as any)?.address && <p>{(organization as any).address}</p>}
        {(organization as any)?.phone  && <p>Tel: {(organization as any).phone}</p>}
        {(organization as any)?.email  && <p>Email: {(organization as any).email}</p>}
        {(organization as any)?.TIN    && <p>TIN: {(organization as any).TIN}</p>}
        {(organization as any)?.VRN    && <p>VRN: {(organization as any).VRN}</p>}
        {ebm?.mrcNo && <p className="text-xs">MRC: {ebm.mrcNo}</p>}
      </div>

      <div className="border-b border-dashed border-gray-400 my-2" />

      {/* Receipt type label */}
      {ebm?.rcptLabel && (
        <div className="text-center font-bold mb-1">
          {ebm.rcptLabel} — {RCPT_LABEL_DISPLAY[ebm.rcptLabel] ?? ebm.rcptLabel}
        </div>
      )}

      {/* Transaction info */}
      <div className="mb-2">
        <p><span className="font-bold">Receipt#:</span> {receiptNumber}</p>
        <p><span className="font-bold">Date:</span> {date}</p>
        <p><span className="font-bold">Cashier:</span> {cashierName}</p>
        <p><span className="font-bold">Customer:</span> {customer.name}</p>
        <p><span className="font-bold">Phone:</span> {customer.phone}</p>
        {customer.tin && <p><span className="font-bold">TIN:</span> {customer.tin}</p>}
      </div>

      <div className="border-b border-dashed border-gray-400 my-2" />

      {/* Items */}
      <div className="mb-2">
        {cart.map((item, index) => (
          <div key={index} className="flex justify-between py-0.5 border-b border-dashed border-gray-200">
            <div>
              <span className="font-medium">{item.product.name}</span>
              <span className="text-gray-500 ml-1">x{item.quantity}</span>
              <span className="text-gray-400 ml-1">[{(item.product.taxCode ?? 'A').toUpperCase()}]</span>
            </div>
            <span>{(item.quantity * item.unitPrice).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <p className="text-right text-xs text-gray-500 mb-1">Items: {cart.length}</p>

      <div className="border-b border-dashed border-gray-400 my-2" />

      {/* Tax breakdown per band */}
      {Object.values(taxBands).length > 0 && (
        <div className="mb-2">
          <p className="font-bold">Tax Summary:</p>
          {Object.values(taxBands).map(b => (
            <div key={b.code} className="flex justify-between">
              <span>{b.code}: Taxable {b.taxable.toFixed(2)}</span>
              <span>Tax {b.tax.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="mb-2">
        <div className="flex justify-between"><span>Subtotal:</span><span>{subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Tax:</span><span>{(total - subtotal).toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL:</span><span>{total.toFixed(2)} RWF</span></div>
        <div className="flex justify-between"><span>Paid:</span><span>{payed.toFixed(2)}</span></div>
        {unpaid > 0 && <div className="flex justify-between"><span>Balance:</span><span>{unpaid.toFixed(2)}</span></div>}
        <div className="flex justify-between"><span>Method:</span><span>{t(`pos.paymentMethods.${paymentMethod}`, { defaultValue: paymentMethod })}</span></div>
      </div>

      {/* SDC Block (only shown when fiscalized) */}
      {ebm?.sdcId && (
        <>
          <div className="border-b border-dashed border-gray-400 my-2" />
          <div className="mb-2">
            <p className="font-bold text-center">--- RRA FISCAL DATA ---</p>
            <p><span className="font-bold">SDC ID:</span> {ebm.sdcId}</p>
            <p><span className="font-bold">Receipt No:</span> {ebm.sdcRcptNo}</p>
            {ebm.sdcDateTime && <p><span className="font-bold">SDC Time:</span> {new Date(ebm.sdcDateTime).toLocaleString()}</p>}
            {ebm.internalData && (
              <p className="break-all"><span className="font-bold">Internal Data:</span> {dashEvery4(ebm.internalData)}</p>
            )}
            {ebm.receiptSignature && (
              <p className="break-all"><span className="font-bold">Signature:</span> {dashEvery4(ebm.receiptSignature)}</p>
            )}
            {qrDataUrl && (
              <div className="text-center mt-2">
                <img src={qrDataUrl} alt="RRA Fiscal QR" className="w-32 h-32 mx-auto" />
                <p className="text-xs text-gray-500">Scan to verify on RRA portal</p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="text-center mt-4 border-t border-dashed border-gray-400 pt-2">
        <p>{t('pos.receipt.thankYou')}</p>
        <p>{t('pos.receipt.comeAgain')}</p>
      </div>
      <p className="text-xs text-center mt-1 text-gray-400">{t('pos.receipt.poweredBy')}</p>
    </div>
  );
};
