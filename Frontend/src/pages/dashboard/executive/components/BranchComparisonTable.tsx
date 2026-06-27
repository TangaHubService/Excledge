import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BranchRow } from '../types'

type SortKey = keyof Pick<BranchRow, 'branchName' | 'orders' | 'revenue' | 'avgOrder' | 'vsLastPeriod'>
type SortDir = 'asc' | 'desc'

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

function StatusBadge({ status }: { status: BranchRow['status'] }) {
  const map = {
    ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    AT_RISK: { label: 'At Risk', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    BELOW_TARGET: { label: 'Below Target', cls: 'bg-red-50 text-red-700 ring-red-200' },
  }
  const { label, cls } = map[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', cls)}>
      {label}
    </span>
  )
}

function VsLastPeriod({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[#64748B] text-xs">—</span>
  const up = value >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', up ? 'text-[#10B981]' : 'text-[#EF4444]')}>
      {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {Math.abs(value)}%
    </span>
  )
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-gray-300" />
  return dir === 'asc' ? <ChevronUp className="h-3 w-3 text-[#2563EB]" /> : <ChevronDown className="h-3 w-3 text-[#2563EB]" />
}

interface Props {
  rows: BranchRow[]
  currency?: string
  onRowClick?: (branchId: number) => void
}

export function BranchComparisonTable({ rows, currency = 'RWF', onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th
      className={cn('cursor-pointer select-none whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748B] hover:text-[#0F172A]', align === 'right' ? 'text-right' : 'text-left')}
      onClick={() => toggleSort(key)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' ? 'justify-end' : 'justify-start')}>
        {label}
        <SortIcon col={key} active={sortKey === key} dir={sortDir} />
      </span>
    </th>
  )

  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
      <div className="px-5 pt-4 pb-2 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-[#0F172A]">Branch Comparison</h3>
        <p className="text-xs text-[#64748B] mt-0.5">{rows.length} active branch{rows.length !== 1 ? 'es' : ''}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-50">
              {th('branchName', 'Branch', 'left')}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748B] text-left">Location</th>
              {th('orders', 'Orders')}
              {th('revenue', 'Revenue')}
              {th('avgOrder', 'Avg Order')}
              {th('vsLastPeriod', 'vs Period')}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748B] text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-sm text-[#64748B]">No branch data for this period</td>
              </tr>
            ) : (
              sorted.map((row, idx) => (
                <tr
                  key={row.branchId}
                  className={cn(
                    'border-b border-gray-50 last:border-0 transition-colors',
                    onRowClick ? 'cursor-pointer hover:bg-[#F8FAFC]' : '',
                    idx % 2 === 0 ? '' : 'bg-gray-50/40',
                  )}
                  onClick={() => onRowClick?.(row.branchId)}
                >
                  <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{row.branchName}</td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{row.location || '—'}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-right text-[#0F172A]">{row.orders.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm tabular-nums font-medium text-right text-[#0F172A]">{fmtCurrency(row.revenue, currency)}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-right text-[#64748B]">{fmtCurrency(row.avgOrder, currency)}</td>
                  <td className="px-4 py-3 text-right"><VsLastPeriod value={row.vsLastPeriod} /></td>
                  <td className="px-4 py-3 text-right"><StatusBadge status={row.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BranchTableSkeleton() {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 animate-pulse space-y-3">
      <div className="h-4 w-40 bg-gray-200 rounded" />
      {[...Array(4)].map((_, i) => <div key={i} className="h-10 w-full bg-gray-100 rounded" />)}
    </div>
  )
}
