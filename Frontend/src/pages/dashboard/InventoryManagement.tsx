import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { TableSkeleton } from "../../components/ui/TableSkeleton";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Button } from "../../components/ui/button";
import { useBranch } from "../../context/BranchContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Plus,
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Loader2,
  X,
  Package,
  Calendar,
  Clock,
  SlidersHorizontal,
  Eye,
  Edit,
  MoreHorizontal,
  History,
  Trash2,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "../../components/ui/drawer";

import { toast } from "react-toastify";
import { toastError } from "../../lib/friendly-error";
import { apiClient } from "../../lib/api-client";
import { parseInventoryGetProductsResponse } from "../../lib/inventory-response";
import { useDebounce } from "use-debounce";
import { type Product } from "../../types";
import { PACKAGING_UNIT_LABELS } from "../../types/ebm";
import AddProduct from "./inventory/AddProduct";
import ViewProductDialog from "./inventory/ViewProductDialog";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import InventoryHistoryDialog from "./inventory/InventoryHistoryDialog";
import StockAdjustmentDialog from "./inventory/StockAdjustmentDialog";
import { cn } from "../../lib/utils";
import { pageWindow } from "../../lib/pagination";
import { StatCard } from "../../components/common/StatCard";

function getDaysRemaining(expiryDate: string) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const InventoryManagement = () => {
  const { t } = useTranslation();
  const { selectedBranchId } = useBranch();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("");
  const [expiryStatus, setExpiryStatus] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState(0);
  const [expiredProducts, setExpiredProducts] = useState(0);
  const [expiringProducts, setExpiringProducts] = useState(0);
  const [sortBy, setSortBy] = useState('expiryDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Ledger dialogs state
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<number | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [selectedProductForAdjustment, setSelectedProductForAdjustment] = useState<{
    id: number;
    name: string;
    quantity: number;
  } | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  useEffect(() => {
    getProducts({
      search: debouncedSearchTerm,
      category,
      expiryStatus,
      page: currentPage,
      limit: itemsPerPage,
      branchId: selectedBranchId,
      sortBy,
      sortOrder,
    });
  }, [debouncedSearchTerm, category, expiryStatus, currentPage, itemsPerPage, selectedBranchId, sortBy, sortOrder]);

  // Close action menu on outside click
  useEffect(() => {
    if (!openActionMenuId) return;
    const handleOutsideClick = () => setOpenActionMenuId(null);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [openActionMenuId]);

  const getProducts = async (params: any) => {
    setLoading(true);

    try {
      const response = await apiClient.getProducts(params);
      const parsed = parseInventoryGetProductsResponse(response);
      setProducts((parsed.items || []) as Product[]);
      setTotalProductsCount(parsed.pagination?.totalItems || parsed.items?.length || 0);
      setLowStockProducts(parsed.lowStockProducts);
      setExpiredProducts(parsed.expiredProducts);
      setExpiringProducts(parsed.expiringProducts);
      setTotalPages(parsed.pagination?.totalPages || 1);
      setCurrentPage(parsed.pagination?.currentPage || 1);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error(t("messages.errorLoadingData"));
      setLowStockProducts(0);
      setExpiredProducts(0);
      setExpiringProducts(0);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const getExpiryStatusDisplay = (expiryDate?: string) => {
    if (!expiryDate) return { label: "—", color: "text-muted-foreground/50" };
    const daysRemaining = getDaysRemaining(expiryDate);
    if (isNaN(daysRemaining)) return { label: "—", color: "text-muted-foreground/50" };

    if (daysRemaining < 0) return { label: "Expired", color: "font-medium text-danger" };
    if (daysRemaining <= 30) return { label: `${daysRemaining}d left`, color: "font-medium text-warning" };
    return { label: new Date(expiryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), color: "text-muted-foreground" };
  };

  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);

  useEffect(() => {
    const categories = Array.from(
      new Set(products.map((prod) => prod.category).filter(Boolean))
    ) as string[];
    setUniqueCategories(categories);
  }, [products]);

  const confirmDelete = async () => {
    if (!productToDelete) return;
    setLoading(true);
    try {
      await apiClient.deleteProduct(String(productToDelete.id));
      toast.success(t("messages.productDeleted"));
      await getProducts({
        search: debouncedSearchTerm,
        category,
        expiryStatus,
        page: currentPage,
        limit: itemsPerPage,
      });
    } catch (error: any) {
      toastError(error, t("messages.deleteError"));
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      [
        "Product Name*",
        "Category*",
        "Unit Price*",
        "Quantity*",
        "Min Stock*",
        "Description",
        "Expiry Date (YYYY/MM/DD) - Optional",
        "Batch Number",
        "Purchase Price - Optional",
        "Barcode - Optional",
        "Packaging Unit Code - Optional (e.g. CT, BX, BO)",
        "Qty per Package - Optional",
      ],
      [
        "Paracetamol",
        "Medication",
        "5.99",
        "50",
        "100",
        "Pain reliever",
        "2025/12/31",
        "BATCH001",
        "3.50",
        "6001234567890",
        "CT",
        "24",
      ],
      [
        "Bandage",
        "First Aid",
        "2.50",
        "50",
        "200",
        "For wounds",
        "2025/12/31",
        "BATCH002",
        "1.20",
        "",
        "",
        "",
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateData);

    ws["!cols"] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 30 },
      { wch: 20 },
      { wch: 15 },
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Products Template");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const data = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(data, "Inventory_Upload_Template.xlsx");
  };

  const handleBulkUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const processedProducts: any[] = [];
      const errors: any[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number | null | undefined)[];
        if (!row || row.every((cell: any) => cell === null || cell === ""))
          continue;

        try {
          if (!row[0] || !row[1] || row[2] === undefined || row[3] === undefined) {
            errors.push(`Row ${i + 1}: Missing required fields`);
            continue;
          }
          let expiryDate: Date | null = null;
          const rawDate = row[6];

          if (rawDate) {
            if (typeof rawDate === "number") {
              const excelEpoch = new Date(1899, 11, 30);
              expiryDate = new Date(excelEpoch.getTime() + (rawDate - 1) * 24 * 60 * 60 * 1000);
            } else if (typeof rawDate === "string" && rawDate.trim() !== "") {
              const [year, month, day] = rawDate.split("/").map(Number);
              if (year && month && day) {
                const parsedDate = new Date(year, month - 1, day);
                if (!isNaN(parsedDate.getTime())) expiryDate = parsedDate;
              }
              if (!expiryDate) {
                const parsedDate = new Date(rawDate);
                if (!isNaN(parsedDate.getTime())) expiryDate = parsedDate;
              }
            }
          }

          if (expiryDate) {
            expiryDate.setHours(0, 0, 0, 0);
            if (expiryDate < today) {
              errors.push(`Row ${i + 1}: Product "${row[0]}" has an expiry date in the past`);
              continue;
            }
          }

          const purchasePriceRaw = row[8];
          const barcodeRaw = String(row[9] || "").trim();
          const pkgUnitCdRaw = String(row[10] || "").trim();
          const packagingQtyRaw = row[11];

          const product = {
            name: String(row[0] || "").trim(),
            category: String(row[1] || "").trim(),
            unitPrice: Number(row[2]) || 0,
            quantity: Number(row[3]) || 0,
            minStock: Number(row[4]) || 0,
            description: String(row[5] || "").trim(),
            expiryDate: expiryDate ? expiryDate.toISOString() : "",
            batchNumber: String(row[7] || `BATCH-${Date.now()}-${i}`).trim(),
            purchasePrice: purchasePriceRaw !== undefined && purchasePriceRaw !== "" && !isNaN(Number(purchasePriceRaw))
              ? Number(purchasePriceRaw)
              : undefined,
            barcode: barcodeRaw || undefined,
            pkgUnitCd: pkgUnitCdRaw || undefined,
            packagingQty: packagingQtyRaw !== undefined && packagingQtyRaw !== "" && !isNaN(Number(packagingQtyRaw))
              ? Number(packagingQtyRaw)
              : undefined,
          };

          processedProducts.push(product);
        } catch (error: any) {
          errors.push(`Error processing row ${i + 1}: ${error.message}`);
        }
      }

      if (processedProducts.length > 0) {
        if (!selectedBranchId) {
          toast.error("Please select a specific branch to import products");
        } else {
          try {
            await apiClient.createProducts(processedProducts, selectedBranchId);
            await getProducts({
              search: debouncedSearchTerm,
              category,
              expiryStatus,
              page: currentPage,
              limit: itemsPerPage,
            });
            toast.success(`Successfully imported ${processedProducts.length} product(s)`);
          } catch (error: any) {
            toastError(error, "Could not import the file");
          }
        }
      }
      event.target.value = "";
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("There was an error processing the file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and manage product stock levels in real time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleBulkUpload}
              className="hidden"
              disabled={isUploading}
            />
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
            Import
          </label>

          <Button
            onClick={downloadTemplate}
            variant="ghost"
            className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Download the Excel import template"
          >
            <Download className="h-4 w-4" />
            Template
          </Button>

          <Button
            onClick={() => { setEditingProduct(null); setIsDialogOpen(true); }}
            className="h-9 rounded-lg px-4 text-sm font-medium shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add product
          </Button>
        </div>
      </div>

      {/* Add/Edit Product Drawer */}
      <Drawer open={isDialogOpen} onOpenChange={(open) => { if (!open) setEditingProduct(null); setIsDialogOpen(open); }}>
        <DrawerContent className="h-full min-h-[60vh] overflow-y-auto bg-card sm:max-w-[680px]">
          <DrawerHeader className="rounded-tl-2xl rounded-tr-2xl border-b border-border/80 pb-4">
            <DrawerTitle className="text-lg font-semibold">{editingProduct ? 'Edit Product' : 'Add New Product'}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <AddProduct product={editingProduct} onSuccess={() => {
              getProducts({ search: debouncedSearchTerm, category, expiryStatus, page: currentPage, limit: itemsPerPage, branchId: selectedBranchId });
              setEditingProduct(null);
              setIsDialogOpen(false);
            }} />
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Products"
          value={(totalProductsCount || products.length || 0).toLocaleString()}
          caption="In this branch scope"
          icon={Package}
          tone="primary"
        />
        <StatCard
          label="Low stock"
          value={(lowStockProducts || 0).toLocaleString()}
          caption="Below minimum stock"
          icon={AlertTriangle}
          tone="warning"
          onClick={() => navigate("/dashboard/low-stock")}
        />
        <StatCard
          label="Expired"
          value={(expiredProducts || 0).toLocaleString()}
          caption="Past expiry date"
          icon={Calendar}
          tone="danger"
          onClick={() => navigate("/dashboard/expired")}
        />
        <StatCard
          label="Expiring soon"
          value={(expiringProducts || 0).toLocaleString()}
          caption="Within 90 days"
          icon={Clock}
          tone="orange"
          onClick={() => navigate("/dashboard/expiring-products")}
        />
      </div>

      {/* ── Search & Filter Row ─────────────────────────────────────────── */}
      <div className="panel p-3">
        <div className="flex flex-col items-center gap-2 md:flex-row">
          {/* Search bar */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, SKU, or batch number..."
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

          {/* Category Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15 md:w-44"
            >
              <option value="">All Categories</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Expiry Status Dropdown */}
            <select
              value={expiryStatus}
              onChange={(e) => setExpiryStatus(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15 md:w-40"
            >
              <option value="">Any expiry</option>
              <option value="expired">Expired</option>
              <option value="expiring">Expiring Soon</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Products Table ──────────────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={6} columns={10} rowHeight="h-10" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Package className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">{t("messages.noData")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="border-b border-border/80 bg-surface-subtle">
              <TableRow className="hover:bg-transparent">
                {[
                  { label: "ID", key: "id" },
                  { label: "RRA code", key: "" },
                  { label: "Product", key: "name" },
                  { label: "Batch", key: "batchNumber" },
                  { label: "Category", key: "category" },
                  { label: "Qty", key: "quantity", align: "right" },
                  { label: "Price", key: "sellingPrice", align: "right" },
                  { label: "Expiry", key: "expiryDate" },
                  { label: "Status", key: "" },
                  { label: "", key: "" },
                ].map(({ label, key, align }, i) => (
                  <TableHead
                    key={label || `col-${i}`}
                    aria-sort={key && sortBy === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      "h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      key && "cursor-pointer select-none hover:text-foreground",
                      sortBy === key && key && "text-foreground",
                      align === "right" && "text-right",
                    )}
                    onClick={() => {
                      if (!key) return;
                      setSortOrder(sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc');
                      setSortBy(key);
                      setCurrentPage(1);
                    }}
                  >
                    <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
                      {label}
                      {key && (
                        <svg className={cn("h-3 w-3", sortBy === key ? "text-primary" : "text-muted-foreground/40")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          {sortBy === key && sortOrder === 'desc'
                            ? <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
                            : <path d="M12 19V5m0 0 5 5m-5-5-5 5" />}
                        </svg>
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((prod) => {
                const expiry = getExpiryStatusDisplay(prod.expiryDate);
                // Services carry no stock, so they get neither a quantity nor a stock state.
                const isService = prod.itemType === "SERVICE";
                const isLow = prod.quantity <= (prod.minStock || 5);
                const codeId = `PRD-${String(prod.id).padStart(3, "0")}`;

                return (
                  <TableRow
                    key={prod.id}
                    className="border-b border-border/60 transition-colors hover:bg-muted/50"
                  >
                    {/* ID */}
                    <TableCell className="py-3 font-mono text-xs font-medium text-primary">
                      <button onClick={() => setViewProduct(prod)} className="hover:underline">
                        {codeId}
                      </button>
                    </TableCell>

                    {/* RRA Product Code (itemCd) */}
                    <TableCell className="whitespace-nowrap py-3 font-mono text-xs text-muted-foreground">
                      {prod.itemCd || <span className="font-sans text-[11px] text-warning">Not registered</span>}
                    </TableCell>

                    {/* Product Name & Thumbnail */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-subtle">
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-semibold text-primary/50">
                              {prod.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[16rem] truncate text-[0.8125rem] font-medium text-foreground">{prod.name}</p>
                          {prod.pkgUnitCd && (
                            <p className="text-[11px] text-muted-foreground">
                              {PACKAGING_UNIT_LABELS[prod.pkgUnitCd] || prod.pkgUnitCd}
                              {prod.packagingQty ? ` × ${prod.packagingQty}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Batch Number */}
                    <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                      {prod.batchNumber || <span className="font-sans text-muted-foreground/50">—</span>}
                    </TableCell>

                    {/* Category Pill */}
                    <TableCell className="py-3">
                      {prod.category ? (
                        <span className="chip whitespace-nowrap">{prod.category}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    {/* Quantity */}
                    <TableCell className={cn(
                      "num py-3 text-right text-sm font-medium",
                      isService ? "text-muted-foreground/50" : prod.quantity <= 0 ? "text-danger" : isLow ? "text-warning" : "text-foreground",
                    )}>
                      {isService ? "—" : Number(prod.quantity).toLocaleString()}
                    </TableCell>

                    {/* Price */}
                    <TableCell className="num whitespace-nowrap py-3 text-right text-sm font-medium text-foreground">
                      {Number(prod.unitPrice ?? 0).toLocaleString()} <span className="text-[11px] font-normal text-muted-foreground">Frw</span>
                      {prod.purchasePrice != null && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          Cost: {Number(prod.purchasePrice).toLocaleString()} Frw
                        </div>
                      )}
                    </TableCell>

                    {/* Expiry Date */}
                    <TableCell className="whitespace-nowrap py-3 text-xs">
                      <span className={expiry.color}>{expiry.label}</span>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="py-3">
                      {isService ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Service
                        </span>
                      ) : (
                      <span className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium",
                        prod.quantity <= 0
                          ? "bg-danger/10 text-danger"
                          : isLow
                            ? "bg-warning/10 text-warning"
                            : "bg-success/10 text-success"
                      )}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        {prod.quantity <= 0 ? "Out of stock" : isLow ? "Low stock" : "In stock"}
                      </span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => setViewProduct(prod)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="View product"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setEditingProduct(prod); setIsDialogOpen(true); }}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Edit product"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(openActionMenuId === String(prod.id) ? null : String(prod.id));
                            }}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openActionMenuId === String(prod.id) && (
                            <div className="panel absolute right-0 z-30 mt-1 w-48 p-1 text-sm shadow-dropdown">
                              <button
                                onClick={() => {
                                  setSelectedProductForHistory(Number(prod.id));
                                  setHistoryDialogOpen(true);
                                  setOpenActionMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted"
                              >
                                <History className="h-3.5 w-3.5 text-muted-foreground" />
                                Movement History
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedProductForAdjustment({ id: Number(prod.id), name: prod.name, quantity: prod.quantity });
                                  setAdjustmentDialogOpen(true);
                                  setOpenActionMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                Stock Adjustment
                              </button>
                              <div className="my-1 border-t border-border/70" />
                              <button
                                onClick={() => {
                                  setProductToDelete({ id: String(prod.id), name: prod.name });
                                  setDeleteDialogOpen(true);
                                  setOpenActionMenuId(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-danger transition-colors hover:bg-danger/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete Product
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {!loading && products.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="num text-xs text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalProductsCount || products.length)} of {(totalProductsCount || products.length).toLocaleString()} results
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {pageWindow(currentPage, totalPages).map((page) => {
                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={cn(
                      "num h-8 min-w-[2rem] rounded-lg px-2 text-xs font-medium transition-colors",
                      currentPage === page
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="ml-1 h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-all focus:outline-none focus:ring-4 focus:ring-ring/15"
              >
                {[10, 20, 50, 100].map((num) => (
                  <option key={num} value={num}>{num} / page</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Dialogs */}
      {viewProduct && (
        <ViewProductDialog
          viewProduct={viewProduct}
          setViewProduct={setViewProduct}
          onStockUpdated={() => {
            getProducts({
              search: debouncedSearchTerm,
              category,
              expiryStatus,
              page: currentPage,
              limit: itemsPerPage,
              branchId: selectedBranchId,
            });
          }}
        />
      )}

      {historyDialogOpen && selectedProductForHistory && (
        <InventoryHistoryDialog
          productId={selectedProductForHistory}
          productName={products.find(p => p.id === selectedProductForHistory)?.name}
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
        />
      )}

      {adjustmentDialogOpen && selectedProductForAdjustment && (
        <StockAdjustmentDialog
          productId={selectedProductForAdjustment.id}
          productName={selectedProductForAdjustment.name}
          currentStock={selectedProductForAdjustment.quantity}
          open={adjustmentDialogOpen}
          onOpenChange={setAdjustmentDialogOpen}
          onSuccess={() => {
            getProducts({
              search: debouncedSearchTerm,
              category,
              expiryStatus,
              page: currentPage,
              limit: itemsPerPage,
              branchId: selectedBranchId,
            });
          }}
        />
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${productToDelete?.name}"?`}
        confirmText="Delete"
        variant="destructive"
        loading={loading}
      />
    </div>
  );
};

export default InventoryManagement;
