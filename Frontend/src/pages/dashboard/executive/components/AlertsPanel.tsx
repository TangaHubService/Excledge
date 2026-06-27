import { AlertTriangle, AlertCircle, Info, Bell } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { Alert } from '../types'

const ALERT_CONFIG = {
  danger: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-100',
    iconCls: 'text-[#EF4444]',
    textCls: 'text-red-800',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    iconCls: 'text-[#F59E0B]',
    textCls: 'text-amber-800',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    iconCls: 'text-[#2563EB]',
    textCls: 'text-blue-800',
  },
}

interface Props {
  alerts: Alert[]
}

export function AlertsPanel({ alerts }: Props) {
  const dangerCount = alerts.filter(a => a.type === 'danger').length
  const warnCount = alerts.filter(a => a.type === 'warning').length

  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 flex flex-col">
      <div className="px-5 pt-4 pb-3 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#F59E0B]" />
          Action Items
        </h3>
        <p className="text-[11px] text-[#64748B] mt-0.5">
          {alerts.length === 0
            ? 'All branches are on track'
            : `${dangerCount} critical · ${warnCount} warning · ${alerts.length - dangerCount - warnCount} info`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[400px]">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <Bell className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-[#0F172A]">All clear</p>
            <p className="text-xs text-[#64748B] mt-1">No alerts for the current period</p>
          </div>
        ) : (
          // Sort: danger → warning → info
          [...alerts]
            .sort((a, b) => {
              const order = { danger: 0, warning: 1, info: 2 }
              return order[a.type] - order[b.type]
            })
            .map((alert, i) => {
              const { icon: Icon, bg, border, iconCls, textCls } = ALERT_CONFIG[alert.type]
              return (
                <div
                  key={i}
                  className={cn('flex items-start gap-3 rounded-lg border p-3', bg, border)}
                >
                  <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', iconCls)} />
                  <p className={cn('text-xs font-medium leading-snug', textCls)}>{alert.message}</p>
                </div>
              )
            })
        )}
      </div>
    </div>
  )
}

export function AlertsSkeleton() {
  return (
    <div className="bg-white rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-gray-100 p-5 animate-pulse space-y-3">
      <div className="h-4 w-32 bg-gray-200 rounded" />
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 w-full bg-gray-100 rounded-lg" />)}
    </div>
  )
}
