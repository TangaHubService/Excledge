import QRCode from 'qrcode';

/**
 * D1: RRA QR code utilities (CIS/VSDC spec §4.2)
 *
 * QR string format:
 *   ddmmyyyy#hhmmss#sdcnumber#sdc_receipt_number#internal_data#receipt_signature
 *
 * internalData and receiptSignature are displayed on the receipt with a dash every 4 chars.
 */

export function buildRraQrString(params: {
  sdcDateTime: string | Date;
  sdcId: string;
  sdcRcptNo: number | string;
  internalData: string;
  receiptSignature: string;
}): string {
  const dt = params.sdcDateTime instanceof Date ? params.sdcDateTime : new Date(params.sdcDateTime);
  const dd   = String(dt.getDate()).padStart(2, '0');
  const mm   = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = String(dt.getFullYear());
  const hh   = String(dt.getHours()).padStart(2, '0');
  const min  = String(dt.getMinutes()).padStart(2, '0');
  const ss   = String(dt.getSeconds()).padStart(2, '0');

  return [
    `${dd}${mm}${yyyy}`,
    `${hh}${min}${ss}`,
    params.sdcId,
    String(params.sdcRcptNo),
    params.internalData,
    params.receiptSignature,
  ].join('#');
}

/** Insert a dash every 4 characters for human-readable display on receipts. */
export function dashEvery4(str: string): string {
  return str.replace(/(.{4})(?!$)/g, '$1-');
}

/** Generate a QR code as a base64 PNG data URL from a raw string. */
export async function qrToDataUrl(qrString: string): Promise<string> {
  return QRCode.toDataURL(qrString, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 150,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
