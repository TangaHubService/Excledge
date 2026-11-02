import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { pageWindow } from "../../lib/pagination";


interface TablePagerProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Noun for the summary line, e.g. "low stock items". */
  noun?: string;
  pageSizes?: number[];
}

/** Footer row for paginated tables: "Showing a–b of n" plus page controls. */
export function TablePager({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun = "results",
  pageSizes = [10, 20, 50, 100],
}: TablePagerProps) {
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3 border-t border-border/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="num text-xs text-muted-foreground">
        Showing {first.toLocaleString()}–{last.toLocaleString()} of {totalItems.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className={navBtn}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow(page, totalPages).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPageChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={cn(
              "num h-8 min-w-[2rem] rounded-lg px-2 text-xs font-medium transition-colors",
              n === page ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(page + 1, totalPages))}
          disabled={page >= totalPages}
          className={navBtn}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="ml-1 h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-all focus:outline-none focus:ring-4 focus:ring-ring/15"
            aria-label="Rows per page"
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default TablePager;
