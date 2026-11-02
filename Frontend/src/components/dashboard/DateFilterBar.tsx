import { useState, useCallback, useRef, useEffect } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format, parseISO } from 'date-fns'
import { Calendar, ChevronDown, Loader2 } from 'lucide-react'
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
  disabled?: boolean
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

function parseDateOrUndefined(d?: string): Date | undefined {
  if (!d) return undefined
  const parsed = parseISO(d)
  return isNaN(parsed.getTime()) ? undefined : parsed
}

export function DateFilterBar({ value, onChange, disabled = false, className }: DateFilterBarProps) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => {
    if (value.preset === 'custom') {
      return {
        from: parseDateOrUndefined(value.startDate),
        to: parseDateOrUndefined(value.endDate),
      }
    }
    return undefined
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    if (value.preset === 'custom') {
      setCustomRange({
        from: parseDateOrUndefined(value.startDate),
        to: parseDateOrUndefined(value.endDate),
      })
    }
  }, [value.preset, value.startDate, value.endDate])

  const handlePreset = useCallback((preset: DatePreset) => {
    if (preset !== 'custom') {
      onChange({ preset, label: computePresetLabel(preset) })
      setOpen(false)
    } else {
      onChange({ preset: 'custom', label: 'Custom Range' })
      setCustomRange(prev => {
        if (prev?.from && prev?.to) return prev
        return undefined
      })
    }
  }, [onChange])

  const handleCustomApply = useCallback(() => {
    if (!customRange?.from || !customRange?.to) return
    onChange({
      preset: 'custom',
      startDate: format(customRange.from, 'yyyy-MM-dd'),
      endDate: format(customRange.to, 'yyyy-MM-dd'),
      label: `${format(customRange.from, 'MMM d')} – ${format(customRange.to, 'MMM d')}`,
    })
    setOpen(false)
  }, [customRange, onChange])

  return (
    <div className={cn('relative', className)} ref={popoverRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all',
          'bg-card border-border',
          'hover:border-primary/30 hover:shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring/30',
          disabled && 'opacity-50 cursor-not-allowed hover:border-border hover:shadow-none',
        )}
      >
        {disabled ? (
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
        ) : (
          <Calendar className="h-4 w-4 text-primary" />
        )}
        <span className="text-foreground">{value.label}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 mt-2 z-50 w-[340px] rounded-xl border shadow-lg',
          'bg-card border-border',
        )}>
          {/* Presets */}
          <div className="grid grid-cols-2 gap-1 p-2 border-b border-border">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  value.preset === p.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                  p.key === 'custom' && 'col-span-2',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date picker — shown when custom is selected or when user clicks Custom Range */}
          {(value.preset === 'custom') && (
            <div className="p-3 space-y-3">
              <DayPicker
                mode="range"
                selected={customRange}
                onSelect={setCustomRange}
                numberOfMonths={1}
                className="!m-0"
              />
              <div className="flex gap-2 text-xs text-muted-foreground px-1">
                <div className={cn(
                  'flex-1 truncate px-2 py-1 rounded border',
                  customRange?.from
                    ? 'border-primary/30 bg-primary/50'
                    : 'border-border',
                )}>
                  {customRange?.from ? format(customRange.from, 'MMM d, yyyy') : 'Start date'}
                </div>
                <span className="self-center">→</span>
                <div className={cn(
                  'flex-1 truncate px-2 py-1 rounded border',
                  customRange?.to
                    ? 'border-primary/30 bg-primary/50'
                    : 'border-border',
                )}>
                  {customRange?.to ? format(customRange.to, 'MMM d, yyyy') : 'End date'}
                </div>
              </div>
              <button
                type="button"
                disabled={!customRange?.from || !customRange?.to}
                onClick={handleCustomApply}
                className={cn(
                  'w-full py-2 text-sm font-semibold rounded-lg transition-colors',
                  'bg-primary text-white hover:bg-primary/90',
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
