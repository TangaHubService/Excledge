import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  TrendingUp, DollarSign, Package, AlertTriangle, Calendar,
  ArrowUpRight, ArrowDownRight, Shield, Users, ExternalLink,
  ShoppingCart, Building, Store,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { apiClient } from '../lib/api-client'
import { DashboardSkeleton } from '../components/ui/DashboardSkeleton'
import { DateFilterBar, type DateFilterValue, type DatePreset } from '../components/dashboard/DateFilterBar'
import { BranchKPICard, BranchCardSkeleton, type BranchData } from '../components/dashboard/BranchKPICard'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'

const DEFAULT_FILTER: DateFilterValue = {
  preset: 'today',
  label: 'Today',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-RW', {
    style: 'currency', currency: 'RWF',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

export const Dashboard = () => {
  const { t } = useTranslation()
  const { isSystemOwner } = useAuth()
  const { selectedBranchId, canAccessAllBranches } = useBranch()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Date filter state (synced to URL search params) ──────────────
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(() => {
    const preset = searchParams.get('preset')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (preset && preset !== 'custom') {
      return { preset: preset as DatePreset, label: preset }
    }
    if (startDate && endDate) {
      return { preset: 'custom', startDate, endDate, label: `${startDate} – ${endDate}` }
    }
    return DEFAULT_FILTER
  })

  // ── Query: per-branch dashboard stats ────────────────────────────
  const branchStatsQuery = useQuery({
    queryKey: ['branch-dashboard-stats', dateFilter.preset, dateFilter.startDate, dateFilter.endDate],
    queryFn: () => apiClient.getBranchDashboardStats({
      preset: dateFilter.preset !== 'custom' ? dateFilter.preset as DatePreset : undefined,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
    }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  // ── Query: system owner stats (separate, not on dashboard) ──────
  const systemOwnerQuery = useQuery({
    queryKey: ['system-owner-dashboard-stats'],
    queryFn: () => apiClient.getSystemOwnerDashboardStats(),
    enabled: isSystemOwner(),
    staleTime: 60_000,
  })

  const handleDateFilterChange = useCallback((filter: DateFilterValue) => {
    setDateFilter(filter)
    const next: Record<string, string> = {}
    if (filter.preset !== 'custom') {
      next.preset = filter.preset
    } else if (filter.startDate && filter.endDate) {
      next.startDate = filter.startDate
      next.endDate = filter.endDate
    }
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  // ── Loading / error states ──────────────────────────────────────
  const isLoading = branchStatsQuery.isLoading && !branchStatsQuery.data
  const isFetching = branchStatsQuery.isFetching
  const error = branchStatsQuery.error

  const branchStats: BranchData[] = branchStatsQuery.data?.branches ?? []
  const dateLabel = branchStatsQuery.data?.dateRange?.preset ?? dateFilter.label

  if (isLoading) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-lg">Failed to load dashboard data</div>
      </div>
    )
  }

  const systemOwnerStats = systemOwnerQuery.data

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              {isSystemOwner() ? t('dashboard.systemOwnerDashboard') : t('dashboard.overview')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {format(new Date(), 'EEEE, MMMM do, yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date filter */}
            <DateFilterBar value={dateFilter} onChange={handleDateFilterChange} />

            {isSystemOwner() && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200/50 dark:border-blue-700/50">
                <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t('users.role')}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── System Owner Stats ──────────────────────────────────── */}
        {isSystemOwner() && systemOwnerStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Building, label: t('dashboard.totalOrganizations'), value: systemOwnerStats.totalOrganizations, color: 'blue' },
              { icon: Users, label: t('dashboard.totalUsers'), value: systemOwnerStats.totalUsers, color: 'emerald' },
              { icon: TrendingUp, label: t('dashboard.activeSubscriptions'), value: systemOwnerStats.activeSubscriptions, color: 'green' },
              { icon: DollarSign, label: t('dashboard.totalRevenue'), value: formatCurrency(systemOwnerStats.totalRevenue), color: 'purple' },
            ].map((item, i) => (
              <StatCard key={i} icon={item.icon} label={item.label} value={item.value} color={item.color} />
            ))}
          </div>
        )}

        {/* ── Period summary bar ──────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Store className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Branch Performance
            </h2>
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
            )}>
              {dateLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            {isFetching && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                Updating...
              </div>
            )}
            <span className="tabular-nums">{branchStats.length} branch{branchStats.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>

        {/* ── Branch KPI Cards Grid ───────────────────────────────── */}
        {!branchStatsQuery.isPlaceholderData && branchStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Store className="h-12 w-12 mb-3" />
            <p className="text-lg font-medium">No active branches found</p>
            <p className="text-sm mt-1">Create a branch to get started with operational tracking</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {branchStatsQuery.isPlaceholderData
              ? Array.from({ length: 3 }).map((_, i) => <BranchCardSkeleton key={i} />)
              : branchStats.map(branch => (
                  <BranchKPICard key={branch.branchId} branch={branch} />
                ))
            }
          </div>
        )}

        {/* ── Summary row (org-wide aggregate) ────────────────────── */}
        {branchStats.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {(() => {
                const totals = branchStats.reduce(
                  (acc, b) => ({
                    sales: acc.sales + b.metrics.totalSales,
                    txns: acc.txns + b.metrics.transactionCount,
                    expenses: acc.expenses + b.metrics.totalExpenses,
                    alerts: acc.alerts + b.metrics.lowStockCount + b.metrics.expiringSoonCount,
                  }),
                  { sales: 0, txns: 0, expenses: 0, alerts: 0 },
                )
                return (
                  <>
                    <SummaryStat label="Total Sales" value={formatCurrency(totals.sales)} color="text-blue-600 dark:text-blue-400" />
                    <SummaryStat label="Transactions" value={String(totals.txns)} color="text-emerald-600 dark:text-emerald-400" />
                    <SummaryStat label="Total Expenses" value={formatCurrency(totals.expenses)} color="text-red-600 dark:text-red-400" />
                    <SummaryStat label="Total Alerts" value={String(totals.alerts)} color="text-orange-600 dark:text-orange-400" />
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* ── Existing charts / recent activity (unchanged) ───────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{/* Sales trend, top products stay */}</div>
        <div>{/* Recent transactions table stays */}</div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string | number; color: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  }
  return (
    <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 group">
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon size={52} />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('p-2 rounded-lg group-hover:scale-105 transition-transform duration-300', colorMap[color])}>
            <Icon size={18} />
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        </div>
        <h3 className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</h3>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className={cn('text-lg font-bold tabular-nums', color)}>{value}</p>
    </div>
  )
}
