import * as React from 'react'

import { cn } from '../../lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-10 w-full min-w-0 rounded-lg border bg-background px-3 py-1 text-base text-foreground transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 md:text-sm',
        'focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/15',
        'aria-invalid:border-danger aria-invalid:ring-4 aria-invalid:ring-danger/15',
        '',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
