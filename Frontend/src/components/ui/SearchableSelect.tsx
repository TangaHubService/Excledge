import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
  /** Renders the option in bold/primary color — for a pinned "+ Add new" entry, etc. */
  emphasized?: boolean
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

/** Type-to-filter dropdown for long option lists (suppliers, products, ...) that a plain <Select> makes tedious to scroll through. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-border bg-card px-3 text-sm transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-card border border-border shadow-lg" align="start">
        <Command className="bg-transparent">
          <CommandInput placeholder={searchPlaceholder} className="bg-card" />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sublabel ?? ''}`}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className="text-sm"
                >
                  <Check
                    className={cn('mr-2 h-4 w-4 shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className={cn('truncate', option.emphasized && 'font-bold text-primary')}>
                    {option.label}
                  </span>
                  {option.sublabel && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">{option.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
