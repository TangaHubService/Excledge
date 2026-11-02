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
import { differenceInCalendarDays, format } from "date-fns";
import { apiClient } from "../../../lib/api-client";
import { parseInventoryGetProductsResponse } from "../../../lib/inventory-response";
import { CalendarX2, Eye, Coins, CalendarCheck } from "lucide-react";
import ViewProductDialog from "./ViewProductDialog";
import { type Product } from "../../../types";
import { cn } from "../../../lib/utils";
import { TablePager } from "../../../components/common/TablePager";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

export default function ExpiredProducts() {
  const { t } = useTranslation();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [days, setDays] = useState(30);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    const fetchExpiredProducts = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getExpiredProducts({
          days,
          page: currentPage,
          limit: limit,
        });
        const parsed = parseInventoryGetProductsResponse(response);
        setProducts((parsed.items || []) as Product[]);
        setTotalPages(parsed.pagination.totalPages || 1);
        setTotalItems(parsed.pagination.totalItems || 0);
        setError(null);
      } catch (err) {
        console.error("Error fetching expired products:", err);
        setError(t("messages.expiredLoadError"));
      } finally {
        setLoading(false);
      }
    };

    fetchExpiredProducts();
  }, [days, currentPage, limit, t]);

  // Summed from the rows on screen only, so the card says "on this page".
  const pageLoss = products.reduce((acc, p) => acc + p.quantity * (Number(p.unitPrice) || 0), 0);

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expired products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Products past their expiry date that should be removed from sale
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Expired in the last</span>
          <div className="flex rounded-lg bg-muted p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => { setDays(r.days); setCurrentPage(1); }}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  days === r.days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="panel flex items-start gap-3.5 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <CalendarX2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Expired items</p>
            <p className="num mt-1 text-xl font-semibold leading-tight text-foreground">{totalItems.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">In the selected period · need disposal</p>
          </div>
        </div>

        <div className="panel flex items-start gap-3.5 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Coins className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Value at selling price</p>
            <p className="num mt-1 text-xl font-semibold leading-tight text-foreground">
              {pageLoss.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Frw</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">On this page</p>
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
              <CalendarCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">No expired products</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Nothing expired in this period.</p>
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
                  { h: "Expired" },
                  { h: "Qty", right: true },
                  { h: "Unit price", right: true },
                  { h: "Value", right: true },
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
                const loss = prod.quantity * (Number(prod.unitPrice) || 0);
                const ago = prod.expiryDate ? differenceInCalendarDays(new Date(), new Date(prod.expiryDate)) : null;

                return (
                  <TableRow key={prod.id} className="border-b border-border/60 transition-colors hover:bg-muted/50">
                    <TableCell className="py-3 font-mono text-xs font-medium text-primary">#{prod.id}</TableCell>
                    <TableCell className="py-3 text-[0.8125rem] font-medium text-foreground">{prod.name}</TableCell>
                    <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                      {prod.batchNumber || <span className="font-sans text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3 text-xs">
                      {prod.expiryDate ? (
                        <>
                          <p className="font-medium text-danger">{format(new Date(prod.expiryDate), "MMM d, yyyy")}</p>
                          {ago !== null && ago >= 0 && (
                            <p className="num text-[11px] text-muted-foreground">
                              {ago === 0 ? "Today" : `${ago} day${ago === 1 ? "" : "s"} ago`}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="font-medium text-danger">Expired</span>
                      )}
                    </TableCell>
                    <TableCell className="num py-3 text-right text-sm text-foreground">{prod.quantity.toLocaleString()}</TableCell>
                    <TableCell className="num whitespace-nowrap py-3 text-right text-sm text-foreground">
                      {(Number(prod.unitPrice) || 0).toLocaleString()} <span className="text-[11px] text-muted-foreground">Frw</span>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap py-3 text-right text-sm font-medium text-danger">
                      {loss.toLocaleString()} <span className="text-[11px] font-normal text-muted-foreground">Frw</span>
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
            noun="expired items"
          />
        )}
      </div>

      <ViewProductDialog viewProduct={viewProduct} setViewProduct={setViewProduct} />
    </div>
  );
}
