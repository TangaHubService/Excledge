import { cn } from '../../lib/utils'

interface BranchBadgeProps {
  name: string
  isAllBranches?: boolean
  isPrimary?: boolean
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  className?: string
}

const statusDot: Record<string, string> = {
  ACTIVE: 'bg-success',
  INACTIVE: 'bg-slate-400',
  SUSPENDED: 'bg-danger',
}

export function BranchBadge({ name, isAllBranches, isPrimary, status = 'ACTIVE', className }: BranchBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium',
        isAllBranches
          ? 'bg-violet-500/10 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
          : isPrimary
            ? 'bg-primary/10 text-primary'
            : 'bg-surface-subtle text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          isAllBranches ? 'bg-violet-500' : statusDot[status],
        )}
        aria-hidden="true"
      />
      <span className="truncate max-w-[120px]">{name}</span>
    </span>
  )
}
