import { useState, useEffect } from "react";
import { apiClient } from "../../../lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { parseInventoryGetProductsResponse } from "../../../lib/inventory-response";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Filter,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "react-toastify";
import { toastError } from "../../../lib/friendly-error";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { UserOptions } from "jspdf-autotable";
import { saveAs } from "file-saver";
import { cn } from "../../../lib/utils";

interface LedgerEntry {
  id: number;
  product: {
    id: number;
    name: string;
    category?: string;
  };
  movementType: string;
  direction: "IN" | "OUT";
  quantity: number;
  runningBalance: number;
  reference?: string;
  referenceType?: string;
  note?: string;
  createdAt: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
  branch?: {
    id: number;
    name: string;
    code?: string;
  } | null;
}

export default function LedgerHistoryPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchOptions, setBranchOptions] = useState<Array<{ id: number; name: string; code?: string }>>([]);
  const [productOptions, setProductOptions] = useState<Array<{ id: number; name: string; sku?: string | null }>>([]);

  // Filters
  const [productId, setProductId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [movementType, setMovementType] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const orgId = localStorage.getItem("current_organization_id");

  useEffect(() => {
    apiClient.getBranches()
      .then((data: any) => setBranchOptions(Array.isArray(data) ? data : data?.branches ?? []))
      .catch(() => setBranchOptions([]));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    apiClient.getProducts({ organizationId: orgId, limit: 1000 })
      .then((res: any) => setProductOptions(parseInventoryGetProductsResponse(res).items as Array<{ id: number; name: string; sku?: string | null }>))
      .catch(() => setProductOptions([]));
  }, [orgId]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    fetchLedgerEntries();
  }, [currentPage, limit, productId, branchId, movementType, startDate, endDate]);

  const fetchLedgerEntries = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        page: currentPage,
        limit,
      };

      if (productId) params.productId = parseInt(productId);
      if (branchId) params.branchId = branchId === "null" ? null : parseInt(branchId);
      if (movementType) params.movementType = movementType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await apiClient.getInventoryLedger(params);
      setEntries(response.entries || []);
      setTotalPages(response.pagination?.totalPages || 1);
      setTotalItems(response.pagination?.totalItems || 0);
    } catch (err: any) {
      console.error("Error fetching ledger entries:", err);
      setError(err.message || "Failed to load stock movements");
      toastError(err, "Could not load stock movements");
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setProductId("");
    setBranchId("");
    setMovementType("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const time = d.toTimeString().split(" ")[0];
    return `${day}/${month}/${year}, ${time}`;
  };

  const getUserInitials = (name?: string) => {
    if (!name) return "DA";
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const exportToExcel = async () => {
    try {
      const params: any = { page: 1, limit: 10000 };
      if (productId) params.productId = parseInt(productId);
      if (branchId) params.branchId = branchId === "null" ? null : parseInt(branchId);
      if (movementType) params.movementType = movementType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await apiClient.getInventoryLedger(params);
      const allEntries = response.entries || [];

      const headers = [
        "Date", "Product", "Movement Type", "Direction",
        "Quantity Change", "Balance After", "Branch", "User", "Reference", "Note"
      ];
      const rows = allEntries.map((entry: LedgerEntry) => [
        formatDate(entry.createdAt),
        entry.product.name,
        entry.movementType.replace(/_/g, " "),
        entry.direction,
        entry.direction === "IN" ? entry.quantity : -entry.quantity,
        entry.runningBalance,
        entry.branch?.name || "Main Store",
        entry.user.name,
        entry.reference || "",
        entry.note || "",
      ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = Array(10).fill({ wch: 20 });
      XLSX.utils.book_append_sheet(wb, ws, "Stock Movements");

      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `stock-movement-history-${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
    }
  };

  const exportToPDF = async () => {
    try {
      const params: any = { page: 1, limit: 10000 };
      if (productId) params.productId = parseInt(productId);
      if (branchId) params.branchId = branchId === "null" ? null : parseInt(branchId);
      if (movementType) params.movementType = movementType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await apiClient.getInventoryLedger(params);
      const allEntries = response.entries || [];

      const doc = new jsPDF("landscape") as jsPDF & { autoTable: (options: UserOptions) => void };
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text("Stock Movement History", 14, 15);

      const tableData = allEntries.map((entry: LedgerEntry) => [
        formatDate(entry.createdAt),
        entry.product.name,
        entry.movementType.replace(/_/g, " "),
        entry.direction,
        entry.direction === "IN" ? `+${entry.quantity}` : `-${entry.quantity}`,
        entry.runningBalance.toString(),
        entry.branch?.name || "Main Store",
        entry.user.name,
        entry.reference || "-",
        entry.note || "-",
      ]);

      autoTable(doc, {
        head: [["Date", "Product", "Type", "Dir", "Change", "Balance", "Branch", "User", "Reference", "Note"]],
        body: tableData,
        startY: 34,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      });

      doc.save(`stock-movement-history-${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("PDF file exported successfully");
    } catch {
      toast.error("Failed to export PDF file");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Breadcrumbs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Dashboard</span>
        <span>›</span>
        <span>Inventory</span>
        <span>›</span>
        <span className="text-foreground font-medium">Stock Movement History</span>
      </div>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Stock Movement History </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track all stock movements and inventory transactions
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={exportToExcel}
            className="h-9 px-4 rounded-xl bg-success hover:bg-success/90 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export as Excel
          </button>
          <button
            type="button"
            onClick={exportToPDF}
            className="h-9 px-4 rounded-xl bg-danger hover:bg-danger/90 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors"
          >
            <FileText className="h-4 w-4" />
            Export as PDF
          </button>
        </div>
      </div>

      {/* ── Filters Card ────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 items-end">
          {/* Product */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Product</label>
            <SearchableSelect
              value={productId}
              onChange={setProductId}
              placeholder="All products"
              searchPlaceholder="Type to search..."
              emptyText="No products found."
              className="bg-surface-subtle border-border text-xs rounded-xl h-9"
              options={[
                { value: "", label: "All products" },
                ...productOptions.map((p) => ({
                  value: String(p.id),
                  label: p.name,
                  sublabel: p.sku ?? undefined,
                })),
              ]}
            />
          </div>

          {/* Branch */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-border bg-surface-subtle text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            >
              <option value="">All branches</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Movement Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Movement Type</label>
            <input
              type="text"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              placeholder="e.g., PURCHASE, SALE"
              className="w-full h-9 px-3 rounded-xl border border-border bg-surface-subtle text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-border bg-surface-subtle text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-border bg-surface-subtle text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            />
          </div>

          {/* Reset button */}
          <div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="w-full h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1.5 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5 text-primary" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Table Card ──────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Table header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">
            Stock Movements <span className="text-primary font-bold">({totalItems})</span>
          </h2>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, totalItems)} of {totalItems} results
            </span>
            <div className="flex items-center gap-1.5">
              <span>Rows per page</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setCurrentPage(1); }}
                className="h-8 px-2 rounded-lg border border-border bg-surface-subtle text-xs font-semibold text-foreground focus:outline-none"
              >
                {[10, 20, 50, 100].map((num) => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-danger text-sm">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">No stock movements found</div>
        ) : (
          <Table>
            <TableHeader className="bg-surface-subtle border-b border-border">
              <TableRow className="hover:bg-transparent">
                {["Date", "Product", "Movement Type", "Direction", "Quantity Change", "Balance After", "Branch", "User", "Reference", "Note"].map((h) => (
                  <TableHead key={h} className="text-xs font-semibold text-muted-foreground whitespace-nowrap py-3.5">
                    <span className="flex items-center gap-1">
                      {h}
                      <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isOut = entry.direction === "OUT";

                return (
                  <TableRow
                    key={entry.id}
                    className="border-t border-border hover:bg-surface-subtle/60 transition-colors"
                  >
                    {/* Date */}
                    <TableCell className="py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </TableCell>

                    {/* Product Name (blue link) */}
                    <TableCell className="py-3.5 text-xs font-bold text-primary whitespace-nowrap">
                      {entry.product.name}
                    </TableCell>

                    {/* Movement Type Pill */}
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide",
                        isOut
                          ? "bg-danger/15 text-danger"
                          : "bg-success/15 text-success"
                      )}>
                        {entry.movementType.replace(/_/g, " ")}
                      </span>
                    </TableCell>

                    {/* Direction */}
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {isOut ? (
                          <TrendingDown className="h-3.5 w-3.5 text-danger" />
                        ) : (
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        <span className={cn("text-xs font-bold", isOut ? "text-danger" : "text-success")}>
                          {entry.direction}
                        </span>
                      </div>
                    </TableCell>

                    {/* Quantity Change */}
                    <TableCell className={cn("py-3.5 text-xs font-bold tabular-nums whitespace-nowrap", isOut ? "text-danger" : "text-success")}>
                      {isOut ? `-${entry.quantity}` : `+${entry.quantity}`}
                    </TableCell>

                    {/* Balance After */}
                    <TableCell className="py-3.5 text-xs font-extrabold tabular-nums text-foreground whitespace-nowrap">
                      {entry.runningBalance}
                    </TableCell>

                    {/* Branch */}
                    <TableCell className="py-3.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {entry.branch ? entry.branch.name : "Main Store"}
                    </TableCell>

                    {/* User Avatar + Name */}
                    <TableCell className="py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {getUserInitials(entry.user?.name)}
                        </div>
                        <span className="text-xs font-medium text-foreground">
                          {entry.user?.name || "Demo Admin"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Reference */}
                    <TableCell className="py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {entry.reference || "—"}
                    </TableCell>

                    {/* Note */}
                    <TableCell className="py-3.5 text-xs text-muted-foreground whitespace-nowrap max-w-[200px] truncate" title={entry.note || ""}>
                      {entry.note || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* ── Pagination Footer ────────────────────────────────────────────── */}
        {!loading && entries.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-surface-subtle/50">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, totalItems)} of {totalItems} results
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-xs font-semibold transition-colors",
                      currentPage === page
                        ? "bg-primary text-white shadow-sm"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {page}
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
