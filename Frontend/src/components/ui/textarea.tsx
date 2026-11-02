import * as React from "react"

import { cn } from "../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-danger aria-invalid:ring-4 aria-invalid:ring-danger/15 flex field-sizing-content min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-base text-foreground transition-[color,box-shadow,border-color] outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
