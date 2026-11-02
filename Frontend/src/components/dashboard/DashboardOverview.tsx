import React, { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ShoppingBag, Receipt, Wallet, Bell, Calendar, ChevronRight,
  AlertTriangle, PackageX, CalendarX2, ArrowUpRight, ArrowDownRight,
  BarChart3, RefreshCw, UserPlus, Boxes, Store, Minus,
} from 'lucide-react'
import type { OverviewDashboardData } from '../../lib/api-client'
import { cn } from '../../lib/utils'

interface DashboardOverviewProps {
  data: OverviewDashboardData
  datePreset: string
  onDatePresetChange: (preset: string) => void
  userDisplayName?: string
  isFetching?: boolean
  startDate?: string
  endDate?: string
  onDateRangeChange?: (start: string, end: string) => void
}

const PRESET_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
] as const

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Smooth cubic path through points; shared by sparklines and the main chart.
const buildCurve = (pts: Array<{ x: number; y: number }>) => {
  if (pts.length === 0) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const cpX = (pts[i].x + pts[i + 1].x) / 2
    d += ` C ${cpX} ${pts[i].y}, ${cpX} ${pts[i + 1].y}, ${pts[i + 1].x} ${pts[i + 1].y}`
  }
  return d
}

const compact = (n: number) =>
  Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  data,
  datePreset,
  onDatePresetChange,
  userDisplayName = 'Demo Admin',
  isFetching,
  startDate,
  endDate,
  onDateRangeChange,
}) => {
  const navigate = useNavigate()
  const [customRangeOpen, setCustomRangeOpen] = useState(false)
  const [customStart, setCustomStart] = useState(startDate || format(new Date(), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd] = useState(endDate || format(new Date(), 'yyyy-MM-dd'))

  const isCustomRange = datePreset === 'custom' && !!startDate && !!endDate
  const rangeLabel = isCustomRange
    ? `${format(new Date(startDate!), 'MMM d')} – ${format(new Date(endDate!), 'MMM d, yyyy')}`
    : PRESET_OPTIONS.find(o => o.id === datePreset)?.label ?? 'Today'

  const money = (amount: number) => `${data.currency || 'RF'} ${amount.toLocaleString()}`

  const openCustomRange = () => {
    setCustomStart(startDate || format(new Date(), 'yyyy-MM-dd'))
    setCustomEnd(endDate || format(new Date(), 'yyyy-MM-dd'))
    setCustomRangeOpen(open => !open)
  }

  const { kpis } = data

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            {getGreeting()}, {userDisplayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s how the business is doing — {rangeLabel.toLowerCase()}.
          </p>
        </div>

        <div className="relative flex items-center gap-2">
          {isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Refreshing" />}
          <div className="flex max-w-full overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border border-border/80 bg-card p-1 shadow-card">
            {PRESET_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onDatePresetChange(opt.id); setCustomRangeOpen(false) }}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  datePreset === opt.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={openCustomRange}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                isCustomRange
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              {isCustomRange ? rangeLabel : 'Custom'}
            </button>
          </div>

          {customRangeOpen && (
            <div className="panel absolute right-0 top-full z-30 mt-2 w-72 p-4 shadow-dropdown">
              <p className="panel-title mb-3">Custom range</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={!customStart || !customEnd}
                  onClick={() => {
                    onDateRangeChange?.(customStart, customEnd)
                    setCustomRangeOpen(false)
                  }}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setCustomRangeOpen(false)}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Total sales"
          value={money(kpis.totalSales.value)}
          changePct={kpis.totalSales.changePercentage}
          icon={ShoppingBag}
          tone="sales"
          sparkline={kpis.totalSales.sparkline}
          onClick={() => navigate('/dashboard/sales')}
        />
        <KPICard
          title="Transactions"
          value={kpis.transactions.value.toLocaleString()}
          changePct={kpis.transactions.changePercentage}
          icon={Receipt}
          tone="success"
          sparkline={kpis.transactions.sparkline}
          onClick={() => navigate('/dashboard/sales')}
        />
        <KPICard
          title="Total expenses"
          value={money(kpis.totalExpenses.value)}
          changePct={kpis.totalExpenses.changePercentage}
          icon={Wallet}
          tone="expenses"
          higherIsWorse
          sparkline={kpis.totalExpenses.sparkline}
          onClick={() => navigate('/dashboard/expenses')}
        />
        <KPICard
          title="Stock alerts"
          value={kpis.totalAlerts.value.toLocaleString()}
          changePct={kpis.totalAlerts.changePercentage}
          icon={Bell}
          tone="warning"
          higherIsWorse
          sparkline={kpis.totalAlerts.sparkline}
          onClick={() => navigate('/dashboard/low-stock')}
        />
      </div>

      {/* ── Sales overview + branches ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel panel-pad lg:col-span-8">
          <SalesOverview items={data.salesOverview || []} money={money} />
        </section>

        <section className="panel panel-pad flex flex-col lg:col-span-4">
          <PanelHeader title="Branch performance" subtitle={rangeLabel} />
          {!data.branchPerformance.hasActivity || data.branchPerformance.branches.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No activity yet"
              body="No sales or transactions recorded for this period."
              action={{ label: 'View reports', onClick: () => navigate('/dashboard/sales-reports') }}
            />
          ) : (
            <BranchList branches={data.branchPerformance.branches} money={money} />
          )}
        </section>
      </div>

      {/* ── Products · Alerts · Activity ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="panel panel-pad">
          <PanelHeader title="Top selling products" subtitle={rangeLabel} />
          {data.topSellingProducts.length === 0 ? (
            <EmptyState icon={Boxes} title="No product sales" body="Sold products will rank here." />
          ) : (
            <ol className="space-y-3.5">
              {data.topSellingProducts.map((prod, i) => (
                <li key={prod.id} className="flex items-center gap-3">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{prod.name}</p>
                      <span className="num shrink-0 text-xs text-muted-foreground">{prod.sold.toLocaleString()} sold</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-sales transition-all duration-500"
                        style={{ width: `${Math.max(prod.percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel panel-pad">
          <PanelHeader title="Stock health" action={{ label: 'View all', onClick: () => navigate('/dashboard/low-stock') }} />
          <div className="divide-y divide-border/70">
            <AlertRow
              icon={AlertTriangle}
              tone="warning"
              label="Low stock"
              hint="Below reorder level"
              count={data.stockAlerts.lowStock.count}
              onClick={() => navigate('/dashboard/low-stock')}
            />
            <AlertRow
              icon={CalendarX2}
              tone="danger"
              label="Expired"
              hint="Past expiry date"
              count={data.stockAlerts.expired.count}
              onClick={() => navigate('/dashboard/expired')}
            />
            <AlertRow
              icon={PackageX}
              tone="muted"
              label="Out of stock"
              hint="Zero quantity on hand"
              count={data.stockAlerts.outOfStock.count}
              onClick={() => navigate('/dashboard/inventory-all')}
            />
          </div>
        </section>

        <section className="panel panel-pad md:col-span-2 xl:col-span-1">
          <PanelHeader title="Recent activity" action={{ label: 'View all', onClick: () => navigate('/dashboard/activity-logs') }} />
          {data.recentActivities.length === 0 ? (
            <EmptyState icon={BarChart3} title="Nothing yet" body="Sales, payments and stock moves appear here." />
          ) : (
            <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
              {data.recentActivities.map(act => {
                const Icon = { sale: Receipt, payment: RefreshCw, stock: Boxes, user: UserPlus }[act.type] ?? UserPlus
                return (
                  <li key={act.id} className="relative flex items-start gap-3">
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{act.title}</p>
                        <time className="shrink-0 text-[11px] text-muted-foreground">{act.timeFormatted}</time>
                      </div>
                      {act.subtext && <p className="mt-0.5 truncate text-xs text-muted-foreground">{act.subtext}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

// ── Building blocks ───────────────────────────────────────────────────

const TONES = {
  sales: { chip: 'bg-chart-sales/10 text-chart-sales', stroke: 'hsl(var(--chart-sales))' },
  expenses: { chip: 'bg-chart-expenses/10 text-chart-expenses', stroke: 'hsl(var(--chart-expenses))' },
  success: { chip: 'bg-success/10 text-success', stroke: 'hsl(var(--success))' },
  warning: { chip: 'bg-warning/10 text-warning', stroke: 'hsl(var(--warning))' },
  danger: { chip: 'bg-danger/10 text-danger', stroke: 'hsl(var(--danger))' },
  muted: { chip: 'bg-muted text-muted-foreground', stroke: 'hsl(var(--muted-foreground))' },
} as const
type Tone = keyof typeof TONES

const PanelHeader: React.FC<{
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
}> = ({ title, subtitle, action }) => (
  <div className="mb-5 flex items-center justify-between gap-3">
    <h3 className="panel-title">{title}</h3>
    {action ? (
      <button
        type="button"
        onClick={action.onClick}
        className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
      >
        {action.label}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    ) : subtitle ? (
      <span className="chip">{subtitle}</span>
    ) : null}
  </div>
)

const EmptyState: React.FC<{
  icon: React.ElementType
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}> = ({ icon: Icon, title, body, action }) => (
  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
    <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-subtle text-muted-foreground">
      <Icon className="h-5 w-5" />
    </span>
    <p className="text-sm font-medium text-foreground">{title}</p>
    <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">{body}</p>
    {action && (
      <button
        type="button"
        onClick={action.onClick}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        {action.label}
      </button>
    )}
  </div>
)

interface KPICardProps {
  title: string
  value: string
  changePct: number
  icon: React.ElementType
  tone: Tone
  sparkline: number[]
  /** Expenses and alerts going up is bad news — flip the delta colour. */
  higherIsWorse?: boolean
  onClick: () => void
}

const KPICard: React.FC<KPICardProps> = ({
  title, value, changePct, icon: Icon, tone, sparkline, higherIsWorse, onClick,
}) => {
  const gradId = useId().replace(/:/g, '')
  const { chip, stroke } = TONES[tone]

  const flat = !changePct
  const good = higherIsWorse ? changePct < 0 : changePct > 0
  const DeltaIcon = flat ? Minus : changePct > 0 ? ArrowUpRight : ArrowDownRight

  const w = 200, h = 44
  const vals = sparkline?.length ? sparkline : [0, 0]
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const pts = vals.map((v, i) => ({
    x: vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w,
    y: h - ((v - min) / range) * (h - 10) - 5,
  }))
  const line = buildCurve(pts)
  const area = `${line} L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`

  return (
    <button
      type="button"
      onClick={onClick}
      className="panel group relative flex flex-col overflow-hidden p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', chip)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <p className="num mt-4 text-[1.625rem] font-semibold leading-none tracking-tight text-foreground">{value}</p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span
          className={cn(
            'num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
            flat ? 'bg-muted text-muted-foreground' : good ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          <DeltaIcon className="h-3 w-3" />
          {Math.abs(changePct)}%
        </span>
        <span className="text-muted-foreground">vs previous period</span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="-mx-5 -mb-5 mt-4 h-11 w-[calc(100%+2.5rem)]" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: stroke, stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" style={{ stroke }} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </button>
  )
}

const SalesOverview: React.FC<{
  items: OverviewDashboardData['salesOverview']
  money: (n: number) => string
}> = ({ items, money }) => {
  const [hover, setHover] = useState<number | null>(null)
  const salesGrad = useId().replace(/:/g, '')

  const totalSales = items.reduce((s, i) => s + i.sales, 0)
  const totalExp = items.reduce((s, i) => s + i.expenses, 0)
  const net = totalSales - totalExp

  const W = 640, H = 220, padL = 44, padR = 12, padT = 12, padB = 28
  const innerW = W - padL - padR, innerH = H - padT - padB
  // Floor at 1,000 so an empty period shows 0–1K instead of fractional ticks.
  const peak = Math.max(...items.flatMap(i => [i.sales, i.expenses]), 1000)
  // Round the axis up to a tidy number so gridlines land on readable values.
  const mag = 10 ** Math.floor(Math.log10(peak))
  const maxVal = Math.ceil(peak / mag) * mag

  const xAt = (i: number) => padL + (items.length === 1 ? innerW / 2 : (i / (items.length - 1)) * innerW)
  const yAt = (v: number) => padT + innerH - (v / maxVal) * innerH
  const salesPts = items.map((it, i) => ({ x: xAt(i), y: yAt(it.sales) }))
  const expPts = items.map((it, i) => ({ x: xAt(i), y: yAt(it.expenses) }))
  const salesLine = buildCurve(salesPts)
  const expLine = buildCurve(expPts)
  const salesArea = salesPts.length
    ? `${salesLine} L ${salesPts[salesPts.length - 1].x} ${padT + innerH} L ${salesPts[0].x} ${padT + innerH} Z`
    : ''

  const hovered = hover !== null ? items[hover] : null

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="panel-title">Sales overview</h3>
          <p className="panel-subtitle mt-0.5">Sales against expenses over the period</p>
        </div>
        <dl className="flex gap-6">
          <Stat label="Sales" value={money(totalSales)} dot="bg-chart-sales" />
          <Stat label="Expenses" value={money(totalExp)} dot="bg-chart-expenses" />
          <Stat label="Net" value={money(net)} valueClass={net >= 0 ? 'text-success' : 'text-danger'} />
        </dl>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data for this period" body="Record a sale to see the trend." />
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full overflow-visible text-[10px]"
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label="Sales and expenses chart"
          >
            <defs>
              <linearGradient id={salesGrad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'hsl(var(--chart-sales))', stopOpacity: 0.18 }} />
                <stop offset="100%" style={{ stopColor: 'hsl(var(--chart-sales))', stopOpacity: 0 }} />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map(p => (
              <g key={p}>
                <line
                  x1={padL} x2={W - padR} y1={yAt(p * maxVal)} y2={yAt(p * maxVal)}
                  style={{ stroke: 'hsl(var(--chart-grid))' }}
                  strokeDasharray={p === 0 ? undefined : '3 4'}
                />
                <text x={padL - 8} y={yAt(p * maxVal) + 3} textAnchor="end" className="fill-muted-foreground num">
                  {compact(p * maxVal)}
                </text>
              </g>
            ))}

            {hover !== null && (
              <line
                x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT + innerH}
                style={{ stroke: 'hsl(var(--muted-foreground))' }} strokeOpacity={0.35}
              />
            )}

            <path d={salesArea} fill={`url(#${salesGrad})`} />
            <path d={expLine} fill="none" style={{ stroke: 'hsl(var(--chart-expenses))' }} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
            <path d={salesLine} fill="none" style={{ stroke: 'hsl(var(--chart-sales))' }} strokeWidth="2.5" strokeLinecap="round" />

            {hover !== null && (
              <>
                <circle cx={expPts[hover].x} cy={expPts[hover].y} r="4" className="fill-card" style={{ stroke: 'hsl(var(--chart-expenses))' }} strokeWidth="2" />
                <circle cx={salesPts[hover].x} cy={salesPts[hover].y} r="4.5" className="fill-card" style={{ stroke: 'hsl(var(--chart-sales))' }} strokeWidth="2.5" />
              </>
            )}

            {items.map((it, i) => (
              <text key={i} x={xAt(i)} y={H - 6} textAnchor="middle" className={cn('fill-muted-foreground', hover === i && 'fill-foreground font-semibold')}>
                {it.label}
              </text>
            ))}

            {/* Invisible hit areas, one per column */}
            {items.map((_, i) => {
              const step = items.length === 1 ? innerW : innerW / (items.length - 1)
              return (
                <rect
                  key={i}
                  x={xAt(i) - step / 2} y={padT} width={step} height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              )
            })}
          </svg>

          {hovered && hover !== null && (
            <div
              className="panel pointer-events-none absolute top-0 z-10 min-w-[10rem] -translate-x-1/2 px-3 py-2 text-xs shadow-dropdown"
              style={{ left: `${(xAt(hover) / W) * 100}%` }}
            >
              <p className="mb-1 font-semibold text-foreground">{hovered.label}</p>
              <p className="num flex justify-between gap-4 text-muted-foreground">
                Sales <span className="font-medium text-foreground">{money(hovered.sales)}</span>
              </p>
              <p className="num flex justify-between gap-4 text-muted-foreground">
                Expenses <span className="font-medium text-foreground">{money(hovered.expenses)}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}

const Stat: React.FC<{ label: string; value: string; dot?: string; valueClass?: string }> = ({ label, value, dot, valueClass }) => (
  <div>
    <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      {dot && <span className={cn('h-2 w-2 rounded-full', dot)} />}
      {label}
    </dt>
    <dd className={cn('num mt-0.5 text-sm font-semibold text-foreground', valueClass)}>{value}</dd>
  </div>
)

const BranchList: React.FC<{
  branches: OverviewDashboardData['branchPerformance']['branches']
  money: (n: number) => string
}> = ({ branches, money }) => {
  const sorted = [...branches].sort((a, b) => b.sales - a.sales)
  const top = Math.max(sorted[0]?.sales ?? 0, 1)
  return (
    <ul className="space-y-4">
      {sorted.map(b => (
        <li key={b.branchId}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">{b.name}</p>
            <p className="num shrink-0 text-sm font-semibold text-foreground">{money(b.sales)}</p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-chart-sales" style={{ width: `${Math.max((b.sales / top) * 100, 3)}%` }} />
          </div>
          <p className="num mt-1.5 text-[11px] text-muted-foreground">
            {b.transactions.toLocaleString()} transactions · {money(b.expenses)} expenses
          </p>
        </li>
      ))}
    </ul>
  )
}

const AlertRow: React.FC<{
  icon: React.ElementType
  tone: Tone
  label: string
  hint: string
  count: number
  onClick: () => void
}> = ({ icon: Icon, tone, label, hint, count, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0"
  >
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONES[tone].chip)}>
      <Icon className="h-4 w-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </span>
    <span className={cn('num text-lg font-semibold', count > 0 ? 'text-foreground' : 'text-muted-foreground/60')}>
      {count}
    </span>
    <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
  </button>
)
