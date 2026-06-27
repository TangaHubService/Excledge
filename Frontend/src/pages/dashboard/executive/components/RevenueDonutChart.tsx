import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { BranchRow } from '../types'

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899']

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { pct: number } }>
  currency: string
}

function CustomTooltip({ active, payload, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div className="bg-[#0F172A] text-white text-xs rounded-lg px-3 py-2 shadow-xl">
      <p className="font-semibold mb-0.5">{name}</p>
      <p className="tabular-nums">{fmtCurrency(value, currency)}</p>
      <p className="text-slate-300">{p.pct}% of total</p>
    </div>
  )
}

interface Props {
  rows: BranchRow[]
  currency?: string
}

export function RevenueDonutChart({ rows, currency = 'RWF' }: Props) {
  const total = rows.reduce((s, r) => s + r.revenue, 0)

  const data = rows
    .filter(r => r.revenue > 0)
    .map((r, i) => ({
      name: r.branchName,
      value: r.revenue,
      pct: total > 0 ? Math.round((r.revenue / total) * 100) : 0,
      color: COLORS[i % COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-[#64748B]">No revenue data for this period</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 flex flex-col">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[#0F172A]">Revenue by Branch</h3>
        <p className="text-xs text-[#64748B] mt-0.5">Share of total {fmtCurrency(total, currency)}</p>
      </div>
      <div className="flex-1 min-h-[240px]">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="truncate text-[#0F172A] font-medium">{d.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-2">
              <span className="tabular-nums text-[#64748B]">{d.pct}%</span>
              <span className="tabular-nums font-semibold text-[#0F172A]">{fmtCurrency(d.value, currency)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DonutChartSkeleton() {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
      <div className="h-48 w-full bg-gray-100 rounded-full mx-auto" style={{ maxWidth: 200 }} />
    </div>
  )
}
