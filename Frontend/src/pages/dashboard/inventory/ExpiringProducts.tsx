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
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, Eye, ShieldAlert } from "lucide-react";
import ViewProductDialog from "./ViewProductDialog";
import { type Product } from "../../../types";
import { cn } from "../../../lib/utils";

export const ExpiringProducts = () => {
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
    const fetchExpiringProducts = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getExpiringProducts({
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
        console.error("Error fetching expiring products:", err);
        setError(t("messages.expiringLoadError"));
      } finally {
        setLoading(false);
      }
    };

    fetchExpiringProducts();
  }, [days, currentPage, limit, t]);

  const getDaysUntilExpiry = (expiryDate: string) => {
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (daysLeft: number) => {
    if (daysLeft <= 0) return { label: "Expired", color: "bg-danger/10 text-danger border border-danger/25" };
    if (daysLeft <= 7) return { label: "Critical", color: "bg-danger/10 text-danger border border-danger/25 font-bold" };
    if (daysLeft <= 30) return { label: "Warning", color: "bg-warning/10 text-warning border border-warning/30" };
    return { label: "Good", color: "bg-success/10 text-success border border-success/25" };
  };

  // KPI Calculations
  const expiring7Days = products.filter((p) => getDaysUntilExpiry(p.expiryDate!) <= 7).length;
  const expiring30Days = products.filter((p) => {
    const d = getDaysUntilExpiry(p.expiryDate!);
    return d > 7 && d <= 30;
  }).length;

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expiring Products</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track upcoming product expirations to manage inventory turnover
            </p>
          </div>
        </div>

        {/* Days Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Expiring in next:</span>
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all shadow-sm"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">TOTAL EXPIRING SOON</p>
              <h3 className="text-2xl font-semibold text-success tracking-tight">{totalItems}</h3>
              <p className="text-xs text-muted-foreground mt-1">Within selected {days} day window</p>
            </div>
            <div className="p-3 rounded-2xl bg-success/10 dark:bg-success/30 text-success">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">EXPIRING IN 7 DAYS</p>
              <h3 className="text-2xl font-semibold text-danger tracking-tight">{expiring7Days}</h3>
              <p className="text-xs text-muted-foreground mt-1">Immediate discount/action needed</p>
            </div>
            <div className="p-3 rounded-2xl bg-danger/10 dark:bg-danger/30 text-danger">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">EXPIRING IN 30 DAYS</p>
              <h3 className="text-2xl font-semibold text-warning tracking-tight">{expiring30Days}</h3>
              <p className="text-xs text-muted-foreground mt-1">Prioritize in POS & sales</p>
            </div>
            <div className="p-3 rounded-2xl bg-warning/10 dark:bg-warning/30 text-warning">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Table Container ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="py-12 text-center text-danger text-sm">{error}</div>
        ) : products.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Clock className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm font-medium">{t("messages.noExpiringProducts")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-surface-subtle border-b border-border">
              <TableRow className="hover:bg-transparent">
                {["ID", "Product Name", "Batch Number", "Expiry Date", "Days Remaining", "Status", "Quantity", "Unit Price", "Action"].map((h) => (
                  <TableHead key={h} className="text-xs font-semibold text-muted-foreground whitespace-nowrap py-3.5">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((prod) => {
                const daysLeft = getDaysUntilExpiry(prod.expiryDate!);
                const status = getExpiryStatus(daysLeft);

                return (
                  <TableRow
                    key={prod.id}
                    className="border-t border-border hover:bg-surface-subtle/60 transition-colors"
                  >
                    <TableCell className="py-3.5 text-xs font-mono font-semibold text-primary">
                      #{prod.id}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-bold text-foreground">
                      {prod.name}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-mono text-muted-foreground">
                      {prod.batchNumber || "—"}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-medium text-foreground whitespace-nowrap">
                      {format(new Date(prod.expiryDate!), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-extrabold tabular-nums text-warning whitespace-nowrap">
                      {daysLeft <= 0 ? "Expired" : `${daysLeft} days left`}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold", status.color)}>
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-semibold tabular-nums text-foreground">
                      {prod.quantity}
                    </TableCell>
                    <TableCell className="py-3.5 text-xs font-semibold tabular-nums text-foreground">
                      {Number(prod.unitPrice).toLocaleString()} Frw
                    </TableCell>
                    <TableCell className="py-3.5">
                      <button
                        onClick={() => setViewProduct(prod)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
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

        {/* ── Pagination Footer ────────────────────────────────────────────── */}
        {!loading && products.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-surface-subtle/50">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, totalItems)} of {totalItems} expiring items
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pNum = i + 1;
                return (
                  <button
                    key={pNum}
                    onClick={() => setCurrentPage(pNum)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-xs font-semibold transition-colors",
                      currentPage === pNum
                        ? "bg-primary text-white shadow-sm"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 pl-2 pr-6 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all appearance-none"
              >
                {[10, 20, 50, 100].map((num) => (
                  <option key={num} value={num}>{num} / page</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <ViewProductDialog viewProduct={viewProduct} setViewProduct={setViewProduct} />
    </div>
  );
};

export default ExpiringProducts;
