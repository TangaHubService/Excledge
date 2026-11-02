import type { ElementType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

export type StatTone = "primary" | "success" | "warning" | "danger" | "violet" | "orange" | "muted";

const TONE: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  muted: "bg-muted text-muted-foreground",
};

/** Summary metric tile. Pass `onClick` to make the whole card a link-like button. */
export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = "primary",
  onClick,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  icon: ElementType;
  tone?: StatTone;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "panel group flex items-start gap-3.5 p-4 text-left",
        onClick && "transition-all hover:-translate-y-0.5 hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="num mt-1 block truncate text-xl font-semibold leading-tight tracking-tight text-foreground">{value}</span>
        {caption && <span className="mt-1 block text-[11px] text-muted-foreground">{caption}</span>}
      </span>
      {onClick && <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />}
    </Comp>
  );
}

export default StatCard;
