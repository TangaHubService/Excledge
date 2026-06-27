export interface KPIData {
  value: number
  prevValue: number
  change: number | null
  sparkline: number[]
}

export interface BranchRow {
  branchId: number
  branchName: string
  location: string
  orders: number
  revenue: number
  avgOrder: number
  vsLastPeriod: number | null
  status: 'ACTIVE' | 'AT_RISK' | 'BELOW_TARGET'
}

export interface BranchTrend {
  branchId: number
  branchName: string
  data: Array<{ date: string; amount: number }>
}

export interface Transaction {
  id: number
  saleNumber: string
  amount: number
  status: string
  createdAt: string
  branchName: string
  branchId: number
}

export interface Alert {
  type: 'danger' | 'warning' | 'info'
  message: string
}

export interface ExecutiveDashboardData {
  dateRange: { startDate: string; endDate: string; preset: string }
  kpis: {
    totalRevenue: KPIData
    totalOrders: KPIData
    avgOrderValue: KPIData
    topBranch: { name: string; revenue: number } | null
  }
  branchTable: BranchRow[]
  branchTrends: BranchTrend[]
  recentTransactions: Transaction[]
  alerts: Alert[]
}

export type DatePreset = 'today' | 'weekly' | 'monthly' | 'custom'

export interface DateFilter {
  preset: DatePreset
  startDate?: string
  endDate?: string
  label: string
}
