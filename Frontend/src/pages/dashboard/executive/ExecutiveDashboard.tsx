import { useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { RefreshCw, ChevronDown, Calendar, Building2 } from 'lucide-react'
import { apiClient } from '../../../lib/api-client'
import { useOrganization } from '../../../context/OrganizationContext'
import { cn } from '../../../lib/utils'
import type { DateFilter, DatePreset, ExecutiveDashboardData } from './types'

import { KPICards, KPICardsSkeleton } from './components/KPICards'
import { BranchComparisonTable, BranchTableSkeleton } from './components/BranchComparisonTable'
import { RevenueDonutChart, DonutChartSkeleton } from './components/RevenueDonutChart'
import { SalesTrendChart, TrendChartSkeleton } from './components/SalesTrendChart'
import { RecentTransactionsFeed, TransactionsSkeleton } from './components/RecentTransactionsFeed'
import { AlertsPanel, AlertsSkeleton } from './components/AlertsPanel'

// ── Date filter helpers ──────────────────────────────────────────────────────

const PRESETS: Array<{ key: DatePreset; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
]

const DEFAULT_FILTER: DateFilter = { preset: 'today', label: 'Today' }

function buildQueryParams(f: DateFilter) {
  if (f.preset !== 'custom') return { preset: f.preset as 'today' | 'weekly' | 'monthly' }
  return { startDate: f.startDate, endDate: f.endDate }
}

// ── Branch multiselect ───────────────────────────────────────────────────────

interface Branch { id: number; name: string }

function BranchSelector({
  branches,
  selected,
  onToggle,
}: {
  branches: Branch[]
  selected: Set<number>
  onToggle: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const allSelected = selected.size === 0

  const label = allSelected
    ? 'All Branches'
    : selected.size === 1
    ? branches.find(b => selected.has(b.id))?.name ?? '1 branch'
    : `${selected.size} branches`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-sm text-white transition-colors"
      >
        <Building2 className="h-4 w-4 text-blue-200" />
        <span className="font-medium">{label}</span>
        <ChevronDown className={cn('h-4 w-4 text-blue-200 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-52 rounded-xl border border-gray-100 bg-white shadow-xl py-1">
          <button
            type="button"
            onClick={() => { onToggle(-1); setOpen(false) }}
            className={cn('w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors font-medium', allSelected ? 'text-[#2563EB]' : 'text-[#64748B]')}
          >
            All Branches
          </button>
          <div className="my-1 border-t border-gray-100" />
          {branches.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b.id)}
              className={cn('w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2', selected.has(b.id) ? 'text-[#2563EB] font-medium' : 'text-[#0F172A]')}
            >
              <span className={cn('h-2 w-2 rounded-full', selected.has(b.id) ? 'bg-[#2563EB]' : 'bg-gray-300')} />
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Custom date range picker ─────────────────────────────────────────────────

function CustomDateRange({
  onApply,
  onCancel,
}: {
  onApply: (start: string, end: string) => void
  onCancel: () => void
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5">
      <Calendar className="h-4 w-4 text-blue-200 shrink-0" />
      <input
        type="date"
        value={start}
        onChange={e => setStart(e.target.value)}
        className="bg-transparent text-sm text-white placeholder-blue-200 border-none outline-none w-32"
      />
      <span className="text-blue-200 text-sm">→</span>
      <input
        type="date"
        value={end}
        onChange={e => setEnd(e.target.value)}
        className="bg-transparent text-sm text-white placeholder-blue-200 border-none outline-none w-32"
      />
      <button
        type="button"
        disabled={!start || !end}
        onClick={() => start && end && onApply(start, end)}
        className="ml-1 rounded-md bg-white/20 hover:bg-white/30 disabled:opacity-40 px-2.5 py-1 text-xs font-semibold text-white transition-colors"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-blue-200 hover:text-white text-xs transition-colors"
      >
        ✕
      </button>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function ExecutiveDashboard() {
  const { organization } = useOrganization()
  const currency = (organization as any)?.currency ?? 'RWF'

  const [dateFilter, setDateFilter] = useState<DateFilter>(DEFAULT_FILTER)
  const [showCustom, setShowCustom] = useState(false)
  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const containerRef = useRef<HTMLDivElement>(null)

  const queryParams = buildQueryParams(dateFilter)

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<ExecutiveDashboardData>({
    queryKey: ['executive-dashboard', queryParams],
    queryFn: async () => {
      const res = await apiClient.getExecutiveDashboard(queryParams)
      setLastUpdated(new Date())
      return res
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: prev => prev,
    retry: 2,
  })

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handlePreset = useCallback((preset: DatePreset) => {
    const label = PRESETS.find(p => p.key === preset)?.label ?? preset
    setDateFilter({ preset, label })
    setShowCustom(false)
  }, [])

  const toggleBranch = useCallback((id: number) => {
    if (id === -1) { setSelectedBranches(new Set()); return }
    setSelectedBranches(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // Filter branch data by selected branches
  const filteredData = data ? {
    ...data,
    branchTable: selectedBranches.size > 0
      ? data.branchTable.filter(r => selectedBranches.has(r.branchId))
      : data.branchTable,
    branchTrends: selectedBranches.size > 0
      ? data.branchTrends.filter(r => selectedBranches.has(r.branchId))
      : data.branchTrends,
  } : null

  const allBranches: Branch[] = data?.branchTable.map(r => ({ id: r.branchId, name: r.branchName })) ?? []

  return (
    <div ref={containerRef} className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8 sm:-mt-6 min-h-screen bg-[#F8FAFC]">

      {/* ── Dark top bar ─────────────────────────────────────────────── */}
      <div className="bg-[#0F172A] px-4 py-5 sm:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto">
          {/* Row 1: title + refresh */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Executive Dashboard</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {organization?.name ?? 'Organization'} · {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isFetching && (
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Updating
                </span>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isFetching}
                className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 disabled:opacity-50 px-3 py-2 text-sm text-white transition-colors"
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Row 2: controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Preset date buttons */}
            <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 p-0.5">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePreset(p.key)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    dateFilter.preset === p.key
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10',
                  )}
                >
                  {p.label}
                </button>
              ))}
              {!showCustom && (
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    dateFilter.preset === 'custom'
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10',
                  )}
                >
                  Custom
                </button>
              )}
            </div>

            {/* Custom date range */}
            {showCustom && (
              <CustomDateRange
                onApply={(start, end) => {
                  setDateFilter({ preset: 'custom', startDate: start, endDate: end, label: `${start} – ${end}` })
                  setShowCustom(false)
                }}
                onCancel={() => setShowCustom(false)}
              />
            )}

            {/* Branch selector */}
            <BranchSelector
              branches={allBranches}
              selected={selectedBranches}
              onToggle={toggleBranch}
            />

            {/* Currency display (read-only, from org) */}
            <span className="ml-auto text-xs text-slate-400 border border-white/15 rounded-lg px-3 py-2">
              {currency}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">

        {/* Error state */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-[#EF4444] font-medium">Failed to load dashboard</p>
            <p className="text-sm text-[#64748B]">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button
              type="button"
              onClick={handleRefresh}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Row 1: KPI cards */}
        {isLoading && !data ? (
          <KPICardsSkeleton />
        ) : filteredData ? (
          <KPICards kpis={filteredData.kpis} currency={currency} />
        ) : null}

        {/* Row 2: Branch table + Donut chart */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3">
            {isLoading && !data ? (
              <BranchTableSkeleton />
            ) : filteredData ? (
              <BranchComparisonTable rows={filteredData.branchTable} currency={currency} />
            ) : null}
          </div>
          <div className="xl:col-span-2">
            {isLoading && !data ? (
              <DonutChartSkeleton />
            ) : filteredData ? (
              <RevenueDonutChart rows={filteredData.branchTable} currency={currency} />
            ) : null}
          </div>
        </div>

        {/* Row 3: Sales trend (full width) */}
        {isLoading && !data ? (
          <TrendChartSkeleton />
        ) : filteredData ? (
          <SalesTrendChart trends={filteredData.branchTrends} currency={currency} />
        ) : null}

        {/* Row 4: Recent transactions + Alerts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            {isLoading && !data ? (
              <TransactionsSkeleton />
            ) : filteredData ? (
              <RecentTransactionsFeed
                transactions={filteredData.recentTransactions}
                currency={currency}
                isFetching={isFetching}
                onRefresh={handleRefresh}
                lastUpdated={lastUpdated}
              />
            ) : null}
          </div>
          <div>
            {isLoading && !data ? (
              <AlertsSkeleton />
            ) : filteredData ? (
              <AlertsPanel alerts={filteredData.alerts} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
