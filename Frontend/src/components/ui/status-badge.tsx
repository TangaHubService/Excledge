import { cn } from '../../lib/utils'

// ── Palette map ───────────────────────────────────────────────────────────── ── Each key maps to
// a Tailwind className string for bg + text + border.

const STYLES: Record<string, string> = {
  // ── Sale / generic ─────────────────────────────────────────────────────────
  COMPLETED:          'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  PAID:               'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  SUCCESS:            'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  ACTIVE:             'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  SYNCED:             'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  ACCEPTED:           'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  DELIVERED:          'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',
  SUCCEEDED:          'bg-success/10 text-success border-success/25 dark:bg-success/20 dark:text-emerald-300 dark:border-emerald-700/40',

  PENDING:            'bg-primary/10 text-primary border-primary/30',
  DRAFT:              'bg-muted text-muted-foreground border-border',
  PROCESSING:         'bg-warning/10 text-warning border-warning/30 dark:bg-warning/20 dark:text-amber-300 dark:border-amber-700/40',
  TRIALING:           'bg-violet-500/10 text-violet-700 border-violet-500/25 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-700/40',
  APPROVED:           'bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-700/40',
  SUBMITTED:          'bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-700/40',
  SHIPPED:            'bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-700/40',

  REFUNDED:           'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700/40',
  PARTIALLY_REFUNDED: 'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700/40',
  PARTIALLY_FULFILLED:'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700/40',
  PAST_DUE:           'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700/40',
  RETRYING:           'bg-warning/10 text-warning border-warning/30 dark:bg-warning/20 dark:text-amber-300 dark:border-amber-700/40',

  CANCELLED:          'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  CANCELED:           'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  REJECTED:           'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  FAILED:             'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  EXPIRED:            'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  SUSPENDED:          'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  DEAD_LETTER:        'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',
  UNPAID:             'bg-danger/10 text-danger border-danger/25 dark:bg-danger/20 dark:text-red-300 dark:border-red-700/40',

  INACTIVE:           'bg-muted text-muted-foreground border-border',
  DECLINED:           'bg-muted text-muted-foreground border-border',

  FULFILLED:          'bg-teal-500/10 text-teal-700 border-teal-500/25 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-700/40',
}

const DISPLAY_LABELS: Record<string, string> = {
  COMPLETED:          'Completed',
  PAID:               'Paid',
  SUCCESS:            'Success',
  ACTIVE:             'Active',
  SYNCED:             'Synced',
  ACCEPTED:           'Accepted',
  DELIVERED:          'Delivered',
  SUCCEEDED:          'Succeeded',
  PENDING:            'Pending',
  DRAFT:              'Draft',
  PROCESSING:         'Processing',
  TRIALING:           'Trialing',
  APPROVED:           'Approved',
  SUBMITTED:          'Submitted',
  SHIPPED:            'Shipped',
  REFUNDED:           'Refunded',
  PARTIALLY_REFUNDED: 'Partial Refund',
  PARTIALLY_FULFILLED:'Partial',
  PAST_DUE:           'Past Due',
  RETRYING:           'Retrying',
  CANCELLED:          'Cancelled',
  CANCELED:           'Canceled',
  REJECTED:           'Rejected',
  FAILED:             'Failed',
  EXPIRED:            'Expired',
  SUSPENDED:          'Suspended',
  DEAD_LETTER:        'Dead Letter',
  UNPAID:             'Unpaid',
  INACTIVE:           'Inactive',
  DECLINED:           'Declined',
  FULFILLED:          'Fulfilled',
}

const FALLBACK = 'bg-muted text-muted-foreground border-border'

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, label, className, size = 'sm' }: StatusBadgeProps) {
  const key = (status ?? '').toUpperCase().trim()
  const style = STYLES[key] ?? FALLBACK
  const text = label ?? DISPLAY_LABELS[key] ?? key.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-badge border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        style,
        className,
      )}
    >
      {text}
    </span>
  )
}
