import { config } from '../config';

/** RRA spec §2.1 MRC: BBBCCNNNNNN — 3 developer + 2 certificate + 6 serial digits. */
export const MRC_PATTERN = /^[A-Z0-9]{3}[A-Z0-9]{2}[0-9]{6}$/;

export const MRC_FORMAT_ERROR =
  'Invalid MRC number format. Must be BBBCCNNNNNN (3 developer + 2 certificate + 6 serial digits).';
export const MRC_FORMAT_ERROR_CODE = 'INVALID_MRC_FORMAT';

export class MrcFormatError extends Error {
  readonly statusCode = 400;
  readonly code = MRC_FORMAT_ERROR_CODE;
  constructor() {
    super(MRC_FORMAT_ERROR);
    this.name = 'MrcFormatError';
  }
}

/** RRA test-issued device serials don't follow the production format. */
export function isMrcValidationRelaxed(): boolean {
  return config.ebm.environment === 'sandbox' || config.ebm.useMock;
}

export type MrcCheckResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string; code: typeof MRC_FORMAT_ERROR_CODE };

export interface MrcCheckOptions {
  /** Defaults to `isMrcValidationRelaxed()`. */
  relaxed?: boolean;
  /**
   * Values already stored (e.g. written by VSDC init). Clients resubmit the
   * whole form, so an unchanged stored value must not block unrelated edits.
   */
  current?: Array<string | null | undefined>;
}

/**
 * Normalizes (trim + uppercase) and format-checks a configured MRC.
 * `undefined` = field not supplied; `null`/blank = clear the MRC.
 */
export function checkMrc(value: unknown, opts: MrcCheckOptions = {}): MrcCheckResult {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  const normalized = String(value).trim().toUpperCase();
  if (normalized === '') return { ok: true, value: null };
  const relaxed = opts.relaxed ?? isMrcValidationRelaxed();
  const unchanged = (opts.current ?? []).some((c) => c != null && c.trim().toUpperCase() === normalized);
  if (!relaxed && !unchanged && !MRC_PATTERN.test(normalized)) {
    return { ok: false, error: MRC_FORMAT_ERROR, code: MRC_FORMAT_ERROR_CODE };
  }
  return { ok: true, value: normalized };
}

/** Same as `checkMrc` but throws `MrcFormatError` (statusCode 400) on bad input. */
export function normalizeMrcOrThrow(value: unknown, opts?: MrcCheckOptions): string | null | undefined {
  const result = checkMrc(value, opts);
  if (!result.ok) throw new MrcFormatError();
  return result.value;
}

function initInfoMrc(ebmInitInfo: unknown): string | null {
  if (!ebmInitInfo || typeof ebmInitInfo !== 'object' || Array.isArray(ebmInitInfo)) return null;
  const mrc = (ebmInitInfo as Record<string, unknown>).mrcNo;
  return typeof mrc === 'string' && mrc.trim() ? mrc.trim() : null;
}

/**
 * MRC to print on fiscal reports: the VSDC-returned value from device init
 * wins over the configured serials (branch, then organization).
 */
export function resolveReportMrc(
  branch?: { ebmInitInfo?: unknown; ebmSerialNo?: string | null } | null,
  org?: { ebmSerialNo?: string | null } | null,
): string | null {
  return initInfoMrc(branch?.ebmInitInfo) || branch?.ebmSerialNo || org?.ebmSerialNo || null;
}
