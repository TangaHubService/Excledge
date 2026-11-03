import { createElement } from 'react';
import { toast, type ToastOptions } from 'react-toastify';

/**
 * Turns technical errors (VSDC/RRA result codes, network failures, HTTP statuses, database errors)
 * into short sentences a shop user can understand and act on. The raw text is kept for support:
 * it is logged to the console, never shown as the headline.
 */

export interface FriendlyError {
  /** What the user was trying to do, e.g. "Could not send the Z report". */
  title?: string;
  /** Plain-language reason and what to do next. */
  reason: string;
  /** The original technical text, for the console / support. */
  detail?: string;
}

const TRY_AGAIN = 'Please try again. If it keeps happening, contact support.';
const VSDC = 'the RRA tax device (VSDC)';

/** VSDC §4.14 result codes → what the user should know and do. */
const VSDC_REASONS: Record<string, string> = {
  '001': 'RRA has no records for this request yet.',
  '881': 'A purchase code is required for this sale. Ask the customer for their purchase code.',
  '882': 'The purchase code is not valid. Check the code with the customer and try again.',
  '883': 'This purchase code was already used. Ask the customer for a new purchase code.',
  '884': "The customer's TIN is not valid. Check the TIN number and try again.",
  '891': `${capitalize(VSDC)} could not prepare the request. ${TRY_AGAIN}`,
  '892': `${capitalize(VSDC)} could not prepare the request. ${TRY_AGAIN}`,
  '893': `${capitalize(VSDC)} could not prepare the request. ${TRY_AGAIN}`,
  '894': `${capitalize(VSDC)} could not reach RRA's servers. Check its internet connection and try again.`,
  '895': `${capitalize(VSDC)} refused the request. ${TRY_AGAIN}`,
  '896': `${capitalize(VSDC)} refused the request. ${TRY_AGAIN}`,
  '899': `${capitalize(VSDC)} reported a problem with this request. Try again later; if it keeps happening, contact support.`,
  '900': 'This device is not registered with RRA. Check the TIN, branch and device serial number in Organization settings.',
  '901': 'This device is not registered with RRA. Check the TIN, branch and device serial number in Organization settings.',
  '902': 'This device is already registered with RRA.',
  '903': 'Only a registered VSDC device can do this. Check the device settings in Organization settings.',
  '910': 'RRA did not accept some of the information sent. Check the details and try again; if it keeps happening, contact support.',
  '911': `${capitalize(VSDC)} received an empty request. ${TRY_AGAIN}`,
  '912': `${capitalize(VSDC)} refused the request. ${TRY_AGAIN}`,
  '921': 'RRA already received this sale, so it cannot be sent again.',
  '922': 'RRA needs the sale first. Send the sale, then try again.',
  '924': 'RRA already has this invoice number.',
  '990': 'Too many requests were sent to RRA. Wait a few minutes and try again.',
  '991': `RRA could not save this record. ${TRY_AGAIN}`,
  '992': `RRA could not update this record. ${TRY_AGAIN}`,
  '993': `RRA could not delete this record. ${TRY_AGAIN}`,
  '994': 'RRA already has this record.',
  '995': 'RRA has no file ready to download yet. Try again later.',
  '999': `RRA reported an unexpected problem. Try again later; if it keeps happening, contact support.`,
};

const STATUS_REASONS: Record<number, string> = {
  400: 'Some information is missing or not valid. Check the form and try again.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to do this. Ask your administrator for access.",
  404: 'We could not find this record. It may have been deleted — refresh the page and try again.',
  409: 'This conflicts with existing data. Refresh the page and check before trying again.',
  413: 'The file is too large. Choose a smaller file and try again.',
  422: 'Some information is missing or not valid. Check the form and try again.',
  429: 'Too many attempts. Wait a moment and try again.',
  502: `We could not reach ${VSDC} or another service. Check that it is running and connected, then try again.`,
  503: 'The service is temporarily unavailable. Try again in a few minutes.',
  504: 'The service took too long to answer. Try again in a few minutes.',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rawMessage(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  const e = err as any;
  const data = e?.response?.data;
  const fromData = typeof data === 'string' ? data : data?.error || data?.message;
  return String(e?.message || fromData || '').trim();
}

function httpStatus(err: unknown): number | undefined {
  const e = err as any;
  const s = Number(e?.response?.status ?? e?.status ?? e?.statusCode);
  return Number.isFinite(s) && s > 0 ? s : undefined;
}

/** The backend sometimes appends detail after the main message; only look at its first sentence for these. */
const GENERIC = /^(an error occurred|something went wrong|error|internal server error|request failed|failed|unknown error)\.?$/i;
const GENERIC_ACTION = /^(failed to|could not|couldn't|unable to|error (while |when )?)[^:]*\.?$/i;

/** Text that would confuse a shop user: code identifiers, stack traces, SQL, JSON, HTTP jargon. */
function looksTechnical(msg: string): boolean {
  return (
    msg.length > 220 ||
    /[<>{}[\]`]|=>|\bat \w+ \(|\n\s+at /.test(msg) ||
    /\b(prisma|sql|sqlstate|constraint|invocation|column|relation|undefined|null|NaN|TypeError|ReferenceError|SyntaxError|is not a function|cannot read propert|unexpected token|json|ECONN\w*|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket|stack|payload|endpoint|resultCd|statusCode|HTTP \d{3}|status code \d{3}|P\d{4})\b/i.test(msg) ||
    // camelCase or snake_case identifiers (rptDe, tin_no, bhfId…)
    /\b[a-z]+[A-Z][a-zA-Z]*\b|\b[a-z]+_[a-z_]+\b/.test(msg)
  );
}

function reasonFor(raw: string, status?: number): string | undefined {
  const vsdc = raw.match(/\bVSDC (?:error|resultCd)\s*(\d{3})\b/i) ?? raw.match(/\bresultCd\D{0,4}(\d{3})\b/i);
  if (vsdc) {
    // The Z-report route explains its own 899 in detail; keep that guidance in plain words.
    if (vsdc[1] === '899' && /z reports?/i.test(raw)) {
      return `${capitalize(VSDC)} installed here cannot save Z reports. Nothing was sent to RRA — ask RRA for an updated VSDC.`;
    }
    return VSDC_REASONS[vsdc[1]] ?? `${capitalize(VSDC)} could not complete the request. ${TRY_AGAIN}`;
  }
  if (/EBM_API_URL|VSDC .*not configured|not configured for VSDC/i.test(raw)) {
    return `${capitalize(VSDC)} is not set up for this business yet. Add the VSDC address in Organization settings.`;
  }
  if (/\bGateway HTTP\b|\bVSDC (is )?(unreachable|offline|down)\b|could not reach (the )?VSDC/i.test(raw)) {
    return `We could not reach ${VSDC}. Check that it is switched on and connected, then try again.`;
  }
  if (/VSDC resultCd 000 but|receipt fields are missing/i.test(raw)) {
    return `${capitalize(VSDC)} did not confirm this in time. Wait a moment and check again before retrying.`;
  }
  if (/failed to fetch|fetch failed|networkerror|network error|load failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ERR_NETWORK|ECONNRESET/i.test(raw)) {
    return "We can't reach the server. Check your internet connection and try again.";
  }
  if (/timed? ?out|timeout|ETIMEDOUT|AbortError|aborted/i.test(raw)) {
    return 'This is taking too long. Check your connection and try again.';
  }
  if (/session expired|jwt expired|invalid token|unauthori[sz]ed/i.test(raw)) return STATUS_REASONS[401];
  if (/unique constraint|already exists|duplicate|P2002/i.test(raw) && looksTechnical(raw)) {
    return 'A record with the same details already exists. Change the name, code or number and try again.';
  }
  if (/foreign key|P2003|P2014/i.test(raw)) {
    return 'This record is linked to other records, so it cannot be changed or deleted.';
  }
  if (/P2025|record to (update|delete) not found|not found/i.test(raw) && looksTechnical(raw)) return STATUS_REASONS[404];
  if (/prisma|invocation|P\d{4}\b/i.test(raw)) return `Something went wrong while saving. ${TRY_AGAIN}`;

  // A clear message from the backend ("Insufficient stock for Sugar") is the best reason we have.
  if (raw && !GENERIC.test(raw) && !GENERIC_ACTION.test(raw) && !looksTechnical(raw)) {
    return raw.endsWith('.') || raw.endsWith('!') || raw.endsWith('?') ? raw : `${raw}.`;
  }
  if (status && STATUS_REASONS[status]) return STATUS_REASONS[status];
  if (status && status >= 500) return `Something went wrong on our side. ${TRY_AGAIN}`;
  return undefined;
}

/**
 * Describe any error in plain words. `action` is the user's goal phrased as a failure,
 * e.g. "Could not save the product".
 */
export function friendlyError(err: unknown, action?: string): FriendlyError {
  const raw = rawMessage(err);
  const reason = reasonFor(raw, httpStatus(err)) ?? (action ? TRY_AGAIN : `Something went wrong. ${TRY_AGAIN}`);
  // Translated actions often end with "Please try again."; the reason already says what to do.
  const title = action?.replace(/[.!]?\s*(please )?try again( later)?\.?$/i, '').replace(/[.!]+$/, '').trim() || undefined;
  // A backend reason that repeats the action ("Failed to save branch") adds nothing.
  if (title && reason.replace(/\.$/, '').toLowerCase() === title.toLowerCase()) return { title, reason: TRY_AGAIN, detail: raw || undefined };
  return { title, reason, detail: raw || undefined };
}

/** A single sentence for places that need a string (form errors, inline banners, i18n templates). */
export function friendlyMessage(err: unknown, action?: string): string {
  const { title, reason } = friendlyError(err, action);
  return title ? `${title}. ${reason}` : reason;
}

/**
 * For a technical reason string inside an otherwise successful response (a warning, a per-item error).
 * Returns undefined when nothing useful can be said.
 */
export function friendlyReason(raw: unknown): string | undefined {
  const text = rawMessage(raw);
  return text ? reasonFor(text) ?? `${TRY_AGAIN}` : undefined;
}

function render(title: string | undefined, reason: string) {
  if (!title) return reason;
  return createElement(
    'div',
    null,
    createElement('div', { style: { fontWeight: 600 } }, title),
    createElement('div', { style: { fontSize: '0.9em', opacity: 0.95, marginTop: 2 } }, reason),
  );
}

function logDetail(level: 'error' | 'warn', title: string | undefined, detail: string | undefined, err: unknown) {
  if (!detail && !err) return;
  // Keep the technical text for support without showing it to the user.
  console[level](`[${title ?? 'error'}]`, detail ?? '', err instanceof Error ? err : '');
}

/** Show an error toast with a plain-language reason. */
export function toastError(err: unknown, action?: string, options?: ToastOptions) {
  const f = friendlyError(err, action);
  logDetail('error', f.title, f.detail, err);
  return toast.error(render(f.title, f.reason), { autoClose: 7000, ...options });
}

/** Show a warning toast; `raw` may be a technical reason that needs translating. */
export function toastWarning(title: string, raw?: unknown, options?: ToastOptions) {
  const reason = raw == null || raw === '' ? undefined : friendlyReason(raw);
  if (raw) logDetail('warn', title, rawMessage(raw), raw);
  return toast.warning(reason ? render(title, reason) : title, { autoClose: 8000, ...options });
}
