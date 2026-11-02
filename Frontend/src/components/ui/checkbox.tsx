import { cn } from '../../lib/utils'
import { Check } from 'lucide-react'

interface CheckboxProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

export function Checkbox({
  checked = false,
  onCheckedChange,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked && 'border-primary bg-primary',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      {...props}
    >
      {checked && <Check className="h-3 w-3 text-white" />}
    </button>
  )
}
