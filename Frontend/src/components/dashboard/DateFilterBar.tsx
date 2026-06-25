import { useState, useCallback, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import 'react-day-picker/style.css'

export type DatePreset = 'today' | 'weekly' | 'monthly' | 'custom'

export interface DateFilterValue {
  preset: DatePreset
  startDate?: string
  endDate?: string
  label: string
}

interface DateFilterBarProps {
  value: DateFilterValue
  onChange: (value: DateFilterValue) => void
  className?: string
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
]

function computePresetLabel(preset: DatePreset): string {
  switch (preset) {
    case 'today': return 'Today'
    case 'weekly': return 'This Week'
    case 'monthly': return 'This Month'
    default: return 'Custom Range'
  }
}

export function DateFilterBar({ value, onChange, className }: DateFilterBarProps) {
  const [open, setOpen] = useState(false)
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({})
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handlePreset = useCallback((preset: DatePreset) => {
    if (preset !== 'custom') {
      onChange({ preset, label: computePresetLabel(preset) })
      setOpen(false)
    } else {
      setCustomRange({})
    }
  }, [onChange])

  const handleCustomApply = useCallback(() => {
    if (customRange.from && customRange.to) {
      onChange({
        preset: 'custom',
        startDate: format(customRange.from, 'yyyy-MM-dd'),
        endDate: format(customRange.to, 'yyyy-MM-dd'),
        label: `${format(customRange.from, 'MMM d')} – ${format(customRange.to, 'MMM d')}`,
      })
      setOpen(false)
    }
  }, [customRange, onChange])

  return (
    <div className={cn('relative', className)} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all',
          'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
          'hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/30',
        )}
      >
        <Calendar className="h-4 w-4 text-blue-500" />
        <span className="text-gray-700 dark:text-gray-200">{value.label}</span>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 mt-2 z-50 w-[320px] rounded-xl border shadow-lg',
          'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        )}>
          {/* Presets */}
          <div className="grid grid-cols-2 gap-1 p-2 border-b border-gray-100 dark:border-gray-700">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  value.preset === p.key
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50',
                  p.key === 'custom' && 'col-span-2',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date picker */}
          {value.preset === 'custom' && (
            <div className="p-3 space-y-3">
              <DayPicker
                mode="range"
                selected={customRange}
                onSelect={setCustomRange}
                numberOfMonths={1}
                className="!m-0"
              />
              <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
                <div className="flex-1 truncate">
                  {customRange.from ? format(customRange.from, 'MMM d, yyyy') : 'Start date'}
                </div>
                <span>→</span>
                <div className="flex-1 truncate">
                  {customRange.to ? format(customRange.to, 'MMM d, yyyy') : 'End date'}
                </div>
              </div>
              <button
                type="button"
                disabled={!customRange.from || !customRange.to}
                onClick={handleCustomApply}
                className={cn(
                  'w-full py-2 text-sm font-semibold rounded-lg transition-colors',
                  'bg-blue-600 text-white hover:bg-blue-700',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
