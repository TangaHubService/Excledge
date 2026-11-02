import { useState, useRef, useEffect } from 'react'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { cn } from '../../lib/utils'
import {
  Search,
  X,
  Plus,
  Check,
} from 'lucide-react'

/* ─── Types ─────────────────────────────────────────── */

export interface FilterOption {
  value: string
  label: string
}

export interface FilterGroup {
  id: string
  label: string
  type: 'select' | 'multi-select' | 'range' | 'date-range'
  options?: FilterOption[]
  placeholder?: string
}

export interface ActiveFilter {
  groupId: string
  value: string
  label: string
}

interface FilterBarProps {
  /** Current search query */
  searchValue: string
  /** Called when search text changes */
  onSearchChange: (value: string) => void
  /** Placeholder for the search input */
  searchPlaceholder?: string
  /** Active filter chips */
  activeFilters: ActiveFilter[]
  /** Called to remove a single filter */
  onRemoveFilter: (filter: ActiveFilter) => void
  /** Called to clear all filters */
  onClearAll: () => void
  /** Available filter groups (shown in the "+ Add Filter" popover) */
  filterGroups: FilterGroup[]
  /** Called when a filter is added */
  onAddFilter: (groupId: string, value: string, label: string) => void
  /** Optional className */
  className?: string
  /** Search input className */
  searchClassName?: string
}

/* ─── Component ─────────────────────────────────────── */

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  activeFilters,
  onRemoveFilter,
  onClearAll,
  filterGroups,
  onAddFilter,
  className,
  searchClassName,
}: FilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  /* ── Global keyboard shortcut: Ctrl+K / Cmd+K ────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className={cn('space-y-3', className)}>
      {/* ── Search row ─────────────────────────────── */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={`${searchPlaceholder}  (Ctrl+K)`}
          className={cn('h-11 pl-10 pr-10 text-sm', searchClassName)}
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Filter chips row ────────────────────────── */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter, i) => (
            <Badge
              key={`${filter.groupId}:${filter.value}:${i}`}
              variant="secondary"
              className="h-8 gap-1.5 rounded-lg px-3 text-xs font-medium"
            >
              <span className="text-muted-foreground">
                {filterGroups.find(g => g.id === filter.groupId)?.label ?? filter.groupId}:
              </span>
              <span>{filter.label}</span>
              <button
                type="button"
                onClick={() => onRemoveFilter(filter)}
                className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          <button
            type="button"
            onClick={onClearAll}
            className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Add filter button ────────────────────────── */}
      <div className="flex items-center justify-between">
        <AddFilterPopover
          filterGroups={filterGroups}
          activeFilters={activeFilters}
          onAddFilter={onAddFilter}
        />
      </div>
    </div>
  )
}

/* ─── Add Filter Popover ──────────────────────────────── */

function AddFilterPopover({
  filterGroups,
  activeFilters,
  onAddFilter,
}: {
  filterGroups: FilterGroup[]
  activeFilters: ActiveFilter[]
  onAddFilter: (groupId: string, value: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const group = filterGroups.find(g => g.id === selectedGroup)

  const handleSelect = (value: string, label: string) => {
    if (!selectedGroup) return
    onAddFilter(selectedGroup, value, label)
    setOpen(false)
    setSelectedGroup(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" sideOffset={4}>
        {!selectedGroup ? (
          /* ── Group list ───────────────────────────── */
          <div className="space-y-0.5">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Filter by
            </p>
            {filterGroups.map(g => {
              const isActive = activeFilters.some(f => f.groupId === g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroup(g.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <span>{g.label}</span>
                  {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        ) : (
          /* ── Options for this group ──────────────── */
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setSelectedGroup(null)}
              className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              ← {filterGroups.find(g => g.id === selectedGroup)?.label}
            </button>

            {group?.options?.map(opt => {
              const isActive = activeFilters.some(
                f => f.groupId === selectedGroup && f.value === opt.value,
              )
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value, opt.label)}
                  disabled={isActive}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{opt.label}</span>
                  {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}

            {group?.type === 'range' && (
              <div className="px-2 py-2">
                <p className="text-xs text-muted-foreground">Range filter (coming soon)</p>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
