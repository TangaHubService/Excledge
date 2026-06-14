export enum RraTaxCode {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
}

export const RRA_TAX_CODE_LABELS: Record<RraTaxCode, string> = {
  [RraTaxCode.A]: 'A — Standard 18%',
  [RraTaxCode.B]: 'B — Zero Rated 0%',
  [RraTaxCode.C]: 'C — Exempt',
  [RraTaxCode.D]: 'D — Zero Rated (alt)',
  [RraTaxCode.E]: 'E — Other',
};

export const RRA_TAX_CODE_OPTIONS = Object.entries(RRA_TAX_CODE_LABELS).map(([value, label]) => ({
  value: value as RraTaxCode,
  label,
}));

export enum MeasurementUnit {
  PCS = 'PCS',
  KG = 'KG',
  LTR = 'LTR',
  MTR = 'MTR',
  BOX = 'BOX',
  PAIR = 'PAIR',
  DOZEN = 'DOZEN',
  GRAM = 'GRAM',
  ML = 'ML',
  OTHER = 'OTHER',
}

export const MEASUREMENT_UNIT_LABELS: Record<MeasurementUnit, string> = {
  [MeasurementUnit.PCS]: 'Pieces',
  [MeasurementUnit.KG]: 'Kilograms',
  [MeasurementUnit.LTR]: 'Litres',
  [MeasurementUnit.MTR]: 'Mètres',
  [MeasurementUnit.BOX]: 'Boxes',
  [MeasurementUnit.PAIR]: 'Pairs',
  [MeasurementUnit.DOZEN]: 'Dozens',
  [MeasurementUnit.GRAM]: 'Grams',
  [MeasurementUnit.ML]: 'Millilitres',
  [MeasurementUnit.OTHER]: 'Other',
};

export const MEASUREMENT_UNIT_OPTIONS = Object.entries(MEASUREMENT_UNIT_LABELS).map(
  ([value, label]) => ({ value: value as MeasurementUnit, label }),
);

export type EbmOutboxStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'DEAD_LETTER';

export const OUTBOX_STATUS_CONFIG: Record<EbmOutboxStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pending (Offline)', color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' },
  PROCESSING: { label: 'Submitted', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  SUCCEEDED: { label: 'Fiscalized', color: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  FAILED: { label: 'Failed', color: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  DEAD_LETTER: { label: 'UN-FISCALIZED', color: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-800 font-bold' },
};

export interface EbmOutboxEntry {
  id: number;
  organizationId: number;
  saleId: number;
  operation: string;
  idempotencyKey: string;
  status: EbmOutboxStatus;
  retryCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  sdcDateTime: string | null;
  createdAt: string;
  sale?: {
    saleNumber: string;
    invoiceNumber: string | null;
    totalAmount: number;
    createdAt: string;
  };
}
