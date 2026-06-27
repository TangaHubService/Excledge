import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { cn } from '../../../../lib/utils'
import type { BranchTrend } from '../types'

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899']

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const fmtYAxis = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  currency: string
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="bg-[#0F172A] text-white text-xs rounded-lg px-3 py-2.5 shadow-xl min-w-[160px]">
      <p className="text-slate-300 mb-1.5 font-medium">{format(parseISO(label), 'MMM d, yyyy')}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-300 truncate max-w-[80px]">{p.name}</span>
          </span>
          <span className="tabular-nums font-semibold">{fmtCurrency(p.value, currency)}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  trends: BranchTrend[]
  currency?: string
}

export function SalesTrendChart({ trends, currency = 'RWF' }: Props) {
  const [hidden, setHidden] = useState<Set<number>>(new Set())

  const toggleBranch = (id: number) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Merge all trends into one flat dataset keyed by date
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>()
    for (const t of trends) {
      for (const d of t.data) {
        if (!dateMap.has(d.date)) dateMap.set(d.date, {})
        dateMap.get(d.date)![String(t.branchId)] = d.amount
      }
    }
    return [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }))
  }, [trends])

  // Find best day per branch for highlight dot
  const peakPoints = useMemo(() => {
    return trends.map(t => {
      const best = t.data.reduce((max, d) => (d.amount > max.amount ? d : max), { date: '', amount: 0 })
      return { branchId: t.branchId, branchName: t.branchName, ...best }
    }).filter(p => p.amount > 0)
  }, [trends])

  if (chartData.length === 0 || trends.length === 0) {
    return (
      <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 flex items-center justify-center min-h-[280px]">
        <p className="text-sm text-[#64748B]">No trend data for this period</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#0F172A]">Sales Trend by Branch</h3>
          <p className="text-xs text-[#64748B] mt-0.5">Daily revenue per branch — click legend to hide/show</p>
        </div>
      </div>

      {/* Custom legend as toggle buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {trends.map((t, i) => {
          const isHidden = hidden.has(t.branchId)
          return (
            <button
              key={t.branchId}
              type="button"
              onClick={() => toggleBranch(t.branchId)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all',
                isHidden
                  ? 'border-gray-200 bg-white text-[#64748B]'
                  : 'border-transparent text-white',
              )}
              style={isHidden ? {} : { background: COLORS[i % COLORS.length] }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: isHidden ? '#CBD5E1' : 'rgba(255,255,255,0.7)' }}
              />
              {t.branchName}
            </button>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis
            dataKey="date"
            tickFormatter={d => format(parseISO(d), chartData.length > 14 ? 'MMM d' : 'd MMM')}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmtYAxis}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          {trends.map((t, i) => {
            if (hidden.has(t.branchId)) return null
            const color = COLORS[i % COLORS.length]
            return (
              <Line
                key={t.branchId}
                type="monotone"
                dataKey={String(t.branchId)}
                name={t.branchName}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            )
          })}
          {/* Peak dots rendered after lines so they appear on top */}
          {peakPoints.map((peak, i) => {
            if (hidden.has(peak.branchId)) return null
            const tIdx = trends.findIndex(t => t.branchId === peak.branchId)
            const color = COLORS[tIdx % COLORS.length]
            return (
              <ReferenceDot
                key={`peak-${peak.branchId}`}
                x={peak.date}
                y={peak.amount}
                r={5}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                label={{ value: fmtCurrency(peak.amount, currency), position: 'top', fontSize: 10, fill: color }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TrendChartSkeleton() {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 animate-pulse">
      <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
      <div className="h-[280px] w-full bg-gray-100 rounded" />
    </div>
  )
}
