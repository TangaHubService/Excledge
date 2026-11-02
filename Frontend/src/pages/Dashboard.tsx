import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiClient, type OverviewDashboardData } from '../lib/api-client'
import { DashboardSkeleton } from '../components/ui/DashboardSkeleton'
import { DashboardOverview } from '../components/dashboard/DashboardOverview'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

export const Dashboard = () => {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Date filter state ──────────────
  const [datePreset, setDatePreset] = useState<string>(() => {
    return searchParams.get('preset') || 'today'
  })

  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined

  // ── Query: Overview dashboard stats ──────────────────────────────
  const overviewQuery = useQuery<OverviewDashboardData>({
    queryKey: ['overview-dashboard-stats', datePreset, startDate, endDate],
    queryFn: () => apiClient.getOverviewDashboard({
      preset: datePreset,
      startDate,
      endDate,
    }),
    staleTime: 30_000,
    retry: 2,
    refetchInterval: false,
  })

  const handleDatePresetChange = useCallback((newPreset: string) => {
    setDatePreset(newPreset)
    const next: Record<string, string> = { preset: newPreset }
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  const handleDateRangeChange = useCallback((start: string, end: string) => {
    setDatePreset('custom')
    const next: Record<string, string> = { startDate: start, endDate: end }
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  const isLoading = overviewQuery.isLoading && !overviewQuery.data
  const isFetching = overviewQuery.isFetching
  const error = overviewQuery.error
  const queryError = overviewQuery.isError

  if (isLoading) return <DashboardSkeleton />

  if (queryError || !overviewQuery.data) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="panel flex max-w-md flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10">
            <RefreshCw className="h-6 w-6 text-danger" />
          </div>
          <div>
            <h2 className="mb-1 text-base font-semibold text-foreground">Failed to load dashboard</h2>
            <p className="text-sm text-muted-foreground">{getErrorMessage(error)}</p>
          </div>
          <button
            type="button"
            onClick={() => overviewQuery.refetch()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-6">
      <div className="mx-auto max-w-7xl">
        <DashboardOverview
          data={overviewQuery.data}
          datePreset={datePreset}
          onDatePresetChange={handleDatePresetChange}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={handleDateRangeChange}
          userDisplayName={user?.name || 'Demo Admin'}
          isFetching={isFetching}
        />
      </div>
    </div>
  )
}
