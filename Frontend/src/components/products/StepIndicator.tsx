import { cn } from '../../lib/utils'
import { Check } from 'lucide-react'

export interface Step {
  id: string
  label: string
  status: 'complete' | 'incomplete' | 'error'
}

interface StepIndicatorProps {
  steps: Step[]
  activeStep: string
  onStepClick?: (stepId: string) => void
}

export function StepIndicator({ steps, activeStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Form progress" className="w-full">
      <ol className="flex items-center gap-1">
        {steps.map((step, index) => {
          const isActive = step.id === activeStep
          const isClickable = !!onStepClick

          return (
            <li key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all min-w-0',
                  isActive && 'bg-muted text-foreground',
                  !isActive && step.status === 'complete' && 'text-success dark:text-emerald-400',
                  !isActive && step.status === 'error' && 'text-danger dark:text-red-400',
                  !isActive && step.status === 'incomplete' && 'text-muted-foreground',
                  isClickable && !isActive && 'hover:bg-muted cursor-pointer',
                  !isClickable && 'cursor-default',
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {/* Step number / icon */}
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    step.status === 'complete' && 'bg-success/15 text-success dark:bg-success/40 dark:text-emerald-300',
                    step.status === 'error' && 'bg-danger/15 text-danger dark:bg-danger/40 dark:text-red-300',
                    step.status === 'incomplete' && isActive && 'bg-gray-900 text-white',
                    step.status === 'incomplete' && !isActive && 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.status === 'complete' ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    index + 1
                  )}
                </span>

                {/* Label — hidden on mobile */}
                <span className="hidden sm:inline truncate">
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'h-px flex-1 min-w-[8px] mx-1',
                    step.status === 'complete'
                      ? 'bg-emerald-300 dark:bg-success'
                      : 'bg-muted',
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
