import { memo } from 'react'
import {
  TrendingUp, DollarSign, ShoppingCart, AlertTriangle, Clock,
  ArrowUpRight, ArrowDownRight, AlertCircle, Store,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export interface BranchMetrics {
  totalSales: number
  transactionCount: number
  cashAmount: number
  debtAmount: number
  insuranceAmount: number
  totalExpenses: number
  lowStockCount: number
  expiringSoonCount: number
}

export interface BranchData {
  branchId: number
  branchName: string
  branchCode: string
  location?: string | null
  metrics: BranchMetrics
}

// ── Skeleton ──────────────────────────────────────────────────────────────
export function BranchCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-28 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      </div>
      <div className="h-8 w-36 bg-muted rounded" />
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────
export function BranchCardEmpty() {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <div className="h-12 w-12 rounded-full bg-surface-subtle flex items-center justify-center mb-3">
          <Store className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">No activity for this period</p>
        <p className="text-xs mt-1 text-muted-foreground">No sales or transactions recorded</p>
      </div>
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────
export function BranchCardError({ message = 'Failed to load branch data' }: { message?: string }) {
  return (
    <div className="bg-card rounded-xl border border-danger/25 dark:border-red-900/50 p-5">
      <div className="flex flex-col items-center justify-center py-6">
        <div className="h-12 w-12 rounded-full bg-danger/10 dark:bg-danger/20 flex items-center justify-center mb-3">
          <AlertCircle className="h-6 w-6 text-danger" />
        </div>
        <p className="text-sm font-medium text-danger dark:text-red-400">{message}</p>
        <p className="text-xs mt-1 text-muted-foreground">Data may be incomplete or unavailable</p>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────
interface BranchKPICardProps {
  branch: BranchData
  currency?: string
  onClick?: () => void
  error?: string | null
}

function formatCurrency(amount: number, currency = 'RWF'): string {
  return new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function BranchKPICardInner({ branch, currency = 'RWF', onClick, error }: BranchKPICardProps) {
  if (error) return <BranchCardError message={error} />
  if (!branch) return <BranchCardSkeleton />

  const { metrics } = branch
  const netProfit = metrics.totalSales - metrics.totalExpenses
  const isProfitable = netProfit >= 0
  const hasActivity = metrics.transactionCount > 0 || metrics.totalSales > 0
  const totalAlerts = metrics.lowStockCount + metrics.expiringSoonCount

  if (!hasActivity) return <BranchCardEmpty />

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={cn(
        'bg-card rounded-xl border shadow-sm p-5',
        'transition-all duration-200',
        'border-border',
        onClick && [
          'cursor-pointer',
          'hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-primary/30',
        ],
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
            'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30',
          )}>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground truncate">
              {branch.branchName}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {branch.branchCode}{branch.location ? ` · ${branch.location}` : ''}
            </p>
          </div>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0',
          isProfitable
            ? 'bg-success/10 text-success dark:bg-success/30 dark:text-emerald-300'
            : 'bg-danger/10 text-danger dark:bg-danger/30 dark:text-red-300',
        )}>
          {isProfitable ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {isProfitable ? 'Profitable' : 'Loss'}
        </span>
      </div>

      {/* Primary metric */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-0.5">Total Sales</p>
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {formatCurrency(metrics.totalSales, currency)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {metrics.transactionCount} transaction{metrics.transactionCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Secondary metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-3 border-t border-border">
        <MetricRow
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Cash"
          value={formatCurrency(metrics.cashAmount, currency)}
          color="text-success dark:text-emerald-400"
        />
        <MetricRow
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Debt"
          value={formatCurrency(metrics.debtAmount, currency)}
          color="text-warning dark:text-amber-400"
        />
        <MetricRow
          icon={<ShoppingCart className="h-3.5 w-3.5" />}
          label="Expenses"
          value={formatCurrency(metrics.totalExpenses, currency)}
          color="text-danger dark:text-red-400"
        />
        <MetricRow
          icon={<AlertTriangle className={cn('h-3.5 w-3.5', totalAlerts > 5 && 'text-orange-500 animate-pulse')} />}
          label="Alerts"
          value={String(totalAlerts)}
          color={cn(
            totalAlerts === 0 && 'text-muted-foreground',
            totalAlerts > 0 && totalAlerts <= 5 && 'text-orange-600 dark:text-orange-400',
            totalAlerts > 5 && 'text-danger dark:text-red-400 font-bold',
          )}
          sub={totalAlerts > 0 ? `${metrics.lowStockCount} low · ${metrics.expiringSoonCount} expiring` : 'All clear'}
        />
      </div>
    </div>
  )
}

function MetricRow({ icon, label, value, color, sub }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={cn('flex-shrink-0', color)}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={cn('text-sm font-semibold tabular-nums truncate', color)}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  )
}

export const BranchKPICard = memo(BranchKPICardInner)
