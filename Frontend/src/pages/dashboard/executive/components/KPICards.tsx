import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Minus, DollarSign, ShoppingCart, BarChart2, Award } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { KPIData } from '../types'

const fmt = (n: number, isCurrency: boolean, currency: string) =>
  isCurrency
    ? new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat('en').format(Math.round(n))

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sg-${color.replace('#', '')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-[#64748B]">No prior data</span>
  const up = change >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', up ? 'text-[#10B981]' : 'text-[#EF4444]')}>
      <Icon className="h-3 w-3" />
      {Math.abs(change)}%
    </span>
  )
}

interface KPICardProps {
  label: string
  kpi: KPIData
  isCurrency?: boolean
  currency?: string
  sparkColor?: string
  icon: React.ReactNode
}

function KPICard({ label, kpi, isCurrency = true, currency = 'RWF', sparkColor = '#2563EB', icon }: KPICardProps) {
  return (
    <div className="bg-white rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#2563EB]">
            {icon}
          </div>
          <span className="text-xs font-medium text-[#64748B] uppercase tracking-wide">{label}</span>
        </div>
        <ChangeBadge change={kpi.change} />
      </div>
      <p className="text-2xl font-bold tabular-nums text-[#0F172A] leading-none">
        {fmt(kpi.value, isCurrency, currency)}
      </p>
      <Sparkline data={kpi.sparkline} color={sparkColor} />
      <p className="text-[11px] text-[#64748B]">
        vs prev period: <span className="font-medium">{fmt(kpi.prevValue, isCurrency, currency)}</span>
      </p>
    </div>
  )
}

interface TopBranchCardProps {
  topBranch: { name: string; revenue: number } | null
  currency?: string
}

function TopBranchCard({ topBranch, currency = 'RWF' }: TopBranchCardProps) {
  return (
    <div className="bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
          <Award className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-blue-100 uppercase tracking-wide">Top Branch</span>
      </div>
      {topBranch ? (
        <>
          <p className="text-xl font-bold text-white leading-tight">{topBranch.name}</p>
          <p className="text-2xl font-bold tabular-nums text-white">
            {new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(topBranch.revenue)}
          </p>
        </>
      ) : (
        <p className="text-blue-200 text-sm">No data for period</p>
      )}
      <div className="flex items-center gap-1 text-blue-100 text-[11px]">
        <Minus className="h-3 w-3" />
        Highest revenue this period
      </div>
    </div>
  )
}

export function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-[12px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 animate-pulse">
          <div className="h-4 w-24 bg-gray-200 rounded mb-4" />
          <div className="h-8 w-32 bg-gray-200 rounded mb-3" />
          <div className="h-10 w-full bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

interface KPICardsProps {
  kpis: {
    totalRevenue: KPIData
    totalOrders: KPIData
    avgOrderValue: KPIData
    topBranch: { name: string; revenue: number } | null
  }
  currency?: string
}

export function KPICards({ kpis, currency = 'RWF' }: KPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <KPICard label="Total Revenue" kpi={kpis.totalRevenue} isCurrency currency={currency} sparkColor="#2563EB" icon={<DollarSign className="h-4 w-4" />} />
      <KPICard label="Total Orders" kpi={kpis.totalOrders} isCurrency={false} sparkColor="#10B981" icon={<ShoppingCart className="h-4 w-4" />} />
      <KPICard label="Avg Order Value" kpi={kpis.avgOrderValue} isCurrency currency={currency} sparkColor="#F59E0B" icon={<BarChart2 className="h-4 w-4" />} />
      <TopBranchCard topBranch={kpis.topBranch} currency={currency} />
    </div>
  )
}
