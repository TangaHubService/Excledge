import { formatDistanceToNow } from 'date-fns'
import { RefreshCw, Activity } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { Transaction } from '../types'

const fmtCurrency = (n: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REFUNDED: 'bg-red-50 text-red-700 ring-red-200',
  PARTIALLY_REFUNDED: 'bg-orange-50 text-orange-700 ring-orange-200',
  CANCELLED: 'bg-gray-100 text-gray-500 ring-gray-200',
  PENDING: 'bg-blue-50 text-blue-700 ring-blue-200',
  DRAFT: 'bg-gray-50 text-gray-500 ring-gray-200',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500 ring-gray-200'
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', cls)}>{label}</span>
}

interface Props {
  transactions: Transaction[]
  currency?: string
  isFetching?: boolean
  onRefresh?: () => void
  lastUpdated?: Date
}

export function RecentTransactionsFeed({ transactions, currency = 'RWF', isFetching, onRefresh, lastUpdated }: Props) {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#2563EB]" />
            Recent Transactions
          </h3>
          {lastUpdated && (
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })} · auto-refresh 30s
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="p-1.5 rounded-lg hover:bg-gray-50 text-[#64748B] hover:text-[#0F172A] transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </button>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full min-w-[460px]">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Time</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Branch</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Order #</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Amount</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-sm text-[#64748B]">No recent transactions</td>
              </tr>
            ) : (
              transactions.map(tx => (
                <tr key={tx.id} className="border-b border-gray-50 last:border-0 hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-4 py-2.5 text-xs text-[#64748B] whitespace-nowrap">
                    {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-[#0F172A] max-w-[100px] truncate">{tx.branchName}</td>
                  <td className="px-4 py-2.5 text-xs text-[#64748B] font-mono">{tx.saleNumber}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-semibold text-right text-[#0F172A]">
                    {fmtCurrency(tx.amount, currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right"><StatusBadge status={tx.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TransactionsSkeleton() {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 animate-pulse space-y-3">
      <div className="h-4 w-40 bg-gray-200 rounded" />
      {[...Array(6)].map((_, i) => <div key={i} className="h-8 w-full bg-gray-100 rounded" />)}
    </div>
  )
}
