import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { apiClient } from "../../../lib/api-client";
import { parseInventoryGetProductsResponse } from "../../../lib/inventory-response";
import { type Product } from "../../../types";
import {
  Search,
  X,
  AlertTriangle,
  PackageX,
  Eye,
  ShieldAlert,
  PackageCheck,
} from "lucide-react";
import ViewProductDialog from "./ViewProductDialog";
import { useDebounce } from "../../../hooks/use-debounce";
import { cn } from "../../../lib/utils";
import { TablePager } from "../../../components/common/TablePager";

type Level = "critical" | "low" | "warning";

const LEVELS: Record<Level, { label: string; pill: string; bar: string }> = {
  critical: { label: "Critical", pill: "bg-danger/10 text-danger", bar: "bg-danger" },
  low: { label: "Low", pill: "bg-warning/10 text-warning", bar: "bg-warning" },
  warning: { label: "Warning", pill: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", bar: "bg-yellow-500" },
};

/** Stock as a share of the minimum: ≤25% critical, ≤50% low, otherwise warning. */
const stockRatio = (p: Product) => p.quantity / (p.minStock || 1);
const levelOf = (p: Product): Level => {
  const pct = stockRatio(p) * 100;
  if (pct <= 25) return "critical";
  if (pct <= 50) return "low";
  return "warning";
};

export const LowStock = () => {
  const { t } = useTranslation();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [limit, setLimit] = useState(10);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const fetchLowStockProducts = async () => {
      try {
        setLoading(true);
        const params: Parameters<typeof apiClient.getLowStockProducts>[0] & Record<string, unknown> = {
          page: currentPage,
          limit: limit,
        };

        if (debouncedSearchTerm.trim()) {
          params.search = debouncedSearchTerm.trim();
        }

        if (statusFilter !== "all") {
          params.status = statusFilter;
        }

        const response = await apiClient.getLowStockProducts(params);
        const parsed = parseInventoryGetProductsResponse(response);
        setProducts((parsed.items || []) as Product[]);
        setTotalPages(parsed.pagination.totalPages || 1);
        setTotalItems(parsed.pagination.totalItems || 0);
        setError(null);
      } catch (err) {
        console.error("Error fetching low stock products:", err);
        setError(t("messages.lowStockLoadError"));
      } finally {
        setLoading(false);
      }
    };

    fetchLowStockProducts();
  }, [currentPage, limit, debouncedSearchTerm, statusFilter, t]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, statusFilter]);

  const handleClearSearch = () => {
    setSearchTerm("");
    setStatusFilter("all");
  };

  const hasActiveFilters = debouncedSearchTerm.trim() !== "" || statusFilter !== "all";

  // Level counts come from the rows on screen, so the cards say "on this page".
  const counts = products.reduce(
    (acc, p) => ({ ...acc, [levelOf(p)]: acc[levelOf(p)] + 1 }),
    { critical: 0, low: 0, warning: 0 } as Record<Level, number>,
  );

  const levelCards: Array<{ level: Level; icon: React.ElementType; hint: string }> = [
    { level: "critical", icon: ShieldAlert, hint: "≤ 25% of minimum · restock now" },
    { level: "low", icon: AlertTriangle, hint: "25–50% of minimum · reorder soon" },
    { level: "warning", icon: PackageX, hint: "50–100% of minimum · monitor" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Low stock</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Items running below their minimum stock level
          </p>
        </div>
        <p className="num text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalItems.toLocaleString()}</span> items need attention
        </p>
      </div>

      {/* ── Level cards (also act as the level filter) ─────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {levelCards.map(({ level, icon: Icon, hint }) => {
          const active = statusFilter === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => setStatusFilter(active ? "all" : level)}
              aria-pressed={active}
              className={cn(
                "panel flex items-start gap-3.5 p-4 text-left transition-all hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active && "ring-2 ring-primary/40",
              )}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", LEVELS[level].pill)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{LEVELS[level].label}</span>
                  <span className="text-[10px] text-muted-foreground/70">on this page</span>
                </span>
                <span className="num mt-1 block text-xl font-semibold leading-tight text-foreground">{counts[level]}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search & Filter Row ─────────────────────────────────────────── */}
      <div className="panel p-3">
        <div className="flex flex-col items-center gap-2 sm:flex-row">
          <div className="relative w-full flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by product name, SKU, or batch…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-9 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15 sm:w-40"
            >
              <option value="all">All levels</option>
              <option value="critical">Critical</option>
              <option value="low">Low</option>
              <option value="warning">Warning</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={handleClearSearch}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table Container ─────────────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-danger">{error}</div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
              <PackageCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters ? t("messages.noData") : "All stock levels are healthy"}
              </p>
              {!hasActiveFilters && (
                <p className="mt-0.5 text-xs text-muted-foreground">Nothing is below its minimum right now.</p>
              )}
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader className="border-b border-border/80 bg-surface-subtle">
              <TableRow className="hover:bg-transparent">
                {[
                  { h: "ID" },
                  { h: "Product" },
                  { h: "Batch" },
                  { h: "Stock vs minimum" },
                  { h: "Level" },
                  { h: "Unit price", right: true },
                  { h: "Stock value", right: true },
                  { h: "" },
                ].map(({ h, right }, i) => (
                  <TableHead
                    key={h || `col-${i}`}
                    className={cn(
                      "h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      right && "text-right",
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((prod) => {
                const level = levelOf(prod);
                const valuation = prod.quantity * (Number(prod.unitPrice) || 0);
                const fill = Math.max(0, Math.min(stockRatio(prod), 1)) * 100;

                return (
                  <TableRow key={prod.id} className="border-b border-border/60 transition-colors hover:bg-muted/50">
                    <TableCell className="py-3 font-mono text-xs font-medium text-primary">#{prod.id}</TableCell>
                    <TableCell className="py-3 text-[0.8125rem] font-medium text-foreground">{prod.name}</TableCell>
                    <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                      {prod.batchNumber || <span className="font-sans text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="w-36">
                        <div className="num mb-1 flex items-baseline justify-between text-xs">
                          <span className="font-semibold text-foreground">{prod.quantity.toLocaleString()}</span>
                          <span className="text-muted-foreground">of {prod.minStock.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", LEVELS[level].bar)} style={{ width: `${Math.max(fill, 2)}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium", LEVELS[level].pill)}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        {LEVELS[level].label}
                      </span>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap py-3 text-right text-sm text-foreground">
                      {(Number(prod.unitPrice) || 0).toLocaleString()} <span className="text-[11px] text-muted-foreground">Frw</span>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap py-3 text-right text-sm font-medium text-foreground">
                      {valuation.toLocaleString()} <span className="text-[11px] font-normal text-muted-foreground">Frw</span>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <button
                        onClick={() => setViewProduct(prod)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {!loading && !error && products.length > 0 && (
          <TablePager
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={limit}
            onPageChange={setCurrentPage}
            onPageSizeChange={(n) => { setLimit(n); setCurrentPage(1); }}
            noun="low stock items"
          />
        )}
      </div>

      <ViewProductDialog viewProduct={viewProduct} setViewProduct={setViewProduct} />
    </div>
  );
};

export default LowStock;
