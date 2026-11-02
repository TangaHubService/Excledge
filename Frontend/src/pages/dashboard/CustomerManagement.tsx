import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { apiClient } from "../../lib/api-client";
import { useDebounce } from "../../hooks/use-debounce";
import TableSkeleton from "../../components/ui/TableSkeleton";
import { CustomerImport } from "./imports/CustomerImport";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "../../components/ui/drawer";
import {
  Users,
  UserPlus,
  Upload,
  Search,
  X,
  Eye,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Shield,
  Briefcase,
  User,
  CreditCard,
  MoreHorizontal,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { CustomerForm } from "../../components/customers/CustomerForm";
import { cn } from "../../lib/utils";
import { PageHeader } from "../../components/common/PageHeader";
import { StatCard } from "../../components/common/StatCard";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: "INDIVIDUAL" | "CORPORATE" | "INSURANCE";
  customerType?: "INDIVIDUAL" | "CORPORATE" | "INSURANCE";
  balance: string;
  TIN?: string;
  isrccCd?: string | null;
  isrcRt?: number | null;
  totalPurchases?: number;
  address?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { sales?: number };
}

export function CustomerManagement() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [typeFilter, setTypeFilter] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [page, setPage] = useState(1);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [totalSales, setTotalSales] = useState(0);
  const [loadingSales, setLoadingSales] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  const organizationId = localStorage.getItem("current_organization_id");

  useEffect(() => {
    fetchCustomers();
  }, [page, itemsPerPage, organizationId, debouncedSearchTerm, typeFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (!openRowMenuId) return;
    const h = () => setOpenRowMenuId(null);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [openRowMenuId]);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getCustomers({
        organizationId,
        page,
        limit: itemsPerPage,
        search: debouncedSearchTerm || undefined,
        customerType: typeFilter || undefined,
        sortBy,
        sortOrder,
      });
      setCustomers((data.customers || []).map((c: any) => ({
        ...c,
        type: (c.customerType || c.type || "INDIVIDUAL") as Customer["type"],
        TIN: c.TIN || c.tin || undefined,
        isrccCd: c.isrccCd ?? null,
        isrcRt: c.isrcRt != null ? Number(c.isrcRt) : null,
      })));
      setTotalCustomersCount(data.pagination?.total ?? data.count ?? 0);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      toast.error(t("messages.errorLoadingData"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCustomer = () => {
    setEditingCustomer(null);
    setIsDialogOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsDialogOpen(true);
  };

  const handleImport = () => {
    setIsImportDialogOpen(true);
  };

  const handleViewDetails = async (customer: Customer) => {
    setIsViewDialogOpen(true);
    setViewingCustomer({
      ...customer,
      id: String(customer.id),
      balance: String(customer.balance || 0),
      type: customer.type || "INDIVIDUAL",
    });
    try {
      setLoadingSales(true);
      const customerData = await apiClient.getCustomerById(customer.id, organizationId || "");
      if (customerData) {
        setViewingCustomer({
          id: String(customerData.id || customer.id),
          name: customerData.name || customer.name || "",
          email: customerData.email || customer.email || "",
          phone: customerData.phone || customer.phone || "",
          address: customerData.address || customer.address || "",
          balance: String(customerData.balance || customer.balance || 0),
          type: (customerData.customerType || customerData.type || customer.type || "INDIVIDUAL") as any,
          createdAt: customerData.createdAt || customer.createdAt,
          updatedAt: customerData.updatedAt || customer.updatedAt,
        });
        setTotalSales(Array.isArray(customerData.sales) ? customerData.sales.length : 0);
      }
    } catch (error) {
      console.error("Failed to fetch customer details:", error);
      setTotalSales(0);
    } finally {
      setLoadingSales(false);
    }
  };

  const handleImportSuccess = () => {
    fetchCustomers();
    setIsImportDialogOpen(false);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      setIsDeleting(true);
      await apiClient.deleteCustomer(customerToDelete);
      const customerName = customers.find((c) => c.id === customerToDelete)?.name || t("sales.customer");
      setCustomers(customers.filter((c) => c.id !== customerToDelete));
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      toast.success(`${customerName} ${t("messages.deleteSuccess")}`);
    } catch (error) {
      console.error("Failed to delete customer:", error);
      toast.error(t("messages.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    try {
      setIsSubmitting(true);
      const formDataWithNumberBalance = {
        ...formData,
        balance: typeof formData.balance === "string" ? parseFloat(formData.balance) : formData.balance,
      };

      let successMessage = "";

      if (editingCustomer) {
        const updatedCustomer = await apiClient.updateCustomer(editingCustomer.id, formDataWithNumberBalance);
        setCustomers(customers.map((c) => (String(c.id) === String(updatedCustomer.id) ? updatedCustomer : c)));
        successMessage = t("messages.customerUpdated");
        if ((updatedCustomer as any)?.TIN || (updatedCustomer as any)?.tin) {
          apiClient.syncCustomerToRra(updatedCustomer.id).catch(() => undefined);
        }
      } else {
        const newCustomer = await apiClient.createCustomer({
          ...formDataWithNumberBalance,
          organizationId,
        });
        setCustomers([newCustomer, ...customers]);
        successMessage = t("messages.customerCreated");
        // Backend also pushes on create; FE call covers cases where TIN was set in this form.
        if ((newCustomer as any)?.TIN || (newCustomer as any)?.tin || formDataWithNumberBalance.tin) {
          apiClient.syncCustomerToRra(newCustomer.id).catch(() => undefined);
        }
      }

      setIsDialogOpen(false);
      toast.success(successMessage);
    } catch (error) {
      console.error("Error saving customer:", error);
      toast.error(t("messages.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      (typeFilter ? customer.type === typeFilter : true) &&
      (customer.name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        customer.phone?.includes(debouncedSearchTerm))
  );

  const paginatedCustomers = filteredCustomers;
  const totalFilteredPages = Math.ceil(totalCustomersCount / itemsPerPage) || 1;

  const sortHeader = (label: string, key: string, align = '') => (
    <th
      className={`py-3.5 px-4 text-xs font-semibold text-muted-foreground cursor-pointer select-none ${align}`}
      aria-sort={sortBy === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={() => {
        setSortOrder(sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc');
        setSortBy(key);
        setPage(1);
      }}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'text-right' ? 'justify-end w-full' : ''}`}>
        {label}
        {sortBy !== key ? <ChevronsUpDown className="h-3 w-3 text-muted-foreground" /> : sortOrder === 'asc'
          ? <ChevronUp className="h-3 w-3 text-primary" />
          : <ChevronDown className="h-3 w-3 text-primary" />}
      </span>
    </th>
  );

  // KPI Stats
  const totalCustomers = customers.length;
  const debtCustomersCount = customers.filter((c) => parseFloat(c.balance || "0") > 0).length;
  const corporateCount = customers.filter((c) => c.type === "CORPORATE").length;
  const insuranceCount = customers.filter((c) => c.type === "INSURANCE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers.customerManagement")}
        description={t("messages.customerManageDesc")}
        actions={
          <>
            <button
              type="button"
              onClick={handleImport}
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              {t("customers.importCustomers") || "Import Customers"}
            </button>
            <button
              type="button"
              onClick={handleAddCustomer}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <UserPlus className="h-4 w-4" />
              {t("customers.addCustomer") || "Add Customer"}
            </button>
          </>
        }
      />

      {/* Totals use the server count; the type breakdowns are from the rows on screen. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Customers" value={(totalCustomersCount || totalCustomers).toLocaleString()} caption="Registered clients" icon={Users} tone="primary" />
        <StatCard label="Debtors" value={debtCustomersCount.toLocaleString()} caption="Owing a balance · on this page" icon={CreditCard} tone="danger" />
        <StatCard label="Corporate" value={corporateCount.toLocaleString()} caption="Business clients · on this page" icon={Briefcase} tone="violet" />
        <StatCard label="Insurance" value={insuranceCount.toLocaleString()} caption="Insured members · on this page" icon={Shield} tone="success" />
      </div>

      {/* ── Search & Filter Container ───────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by customer name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 h-10 rounded-xl border border-border bg-surface-subtle text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-danger">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 px-3.5 rounded-xl border border-border bg-surface-subtle text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all w-full sm:w-44"
            >
              <option value="">All Types</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="CORPORATE">Corporate</option>
              <option value="INSURANCE">Insurance</option>
            </select>

            {(searchTerm || typeFilter) && (
              <button
                onClick={() => { setSearchTerm(""); setTypeFilter(""); }}
                className="h-10 px-3.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Customers Data Table ────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={5} columns={6} rowHeight="h-10" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Users className="h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm font-medium">{t("customers.noCustomersFound")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-subtle border-b border-border">
                <tr>
                  {sortHeader('ID', 'createdAt')}
                  {sortHeader('Customer', 'name')}
                  {sortHeader('Contact Details', 'email')}
                  {sortHeader('Type', 'customerType')}
                  {sortHeader('Balance', 'balance', 'text-right')}
                  <th className="py-3.5 px-4 text-xs font-semibold text-muted-foreground text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedCustomers.map((c) => {
                  const balanceNum = parseFloat(c.balance || "0");
                  const hasDebt = balanceNum > 0;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-subtle/60 transition-colors cursor-pointer"
                      onClick={() => handleViewDetails(c)}
                    >
                      {/* ID */}
                      <td className="py-3.5 px-4 text-xs font-mono font-semibold text-primary">
                        #{c.id}
                      </td>

                      {/* Customer Avatar & Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                            {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{c.name}</p>
                            {c._count?.sales !== undefined && (
                              <p className="text-[10px] text-muted-foreground">{c._count.sales} purchases</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact Details */}
                      <td className="py-3.5 px-4">
                        <p className="text-xs font-medium text-foreground">{c.phone || "—"}</p>
                        {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold",
                            c.type === "INSURANCE"
                              ? "bg-success/10 text-success border border-success/25"
                              : c.type === "CORPORATE"
                              ? "bg-purple-500/10 text-purple-700 border border-purple-500/25"
                              : "bg-primary/10 text-primary border border-primary/30"
                          )}
                        >
                          {c.type === "INSURANCE" && <Shield className="h-3 w-3" />}
                          {c.type === "CORPORATE" && <Briefcase className="h-3 w-3" />}
                          {c.type === "INDIVIDUAL" && <User className="h-3 w-3" />}
                          {c.type || "INDIVIDUAL"}
                        </span>
                      </td>

                      {/* Balance */}
                      <td className="py-3.5 px-4 text-right">
                        <span className={cn("text-xs font-bold tabular-nums", hasDebt ? "text-danger" : "text-foreground")}>
                          {balanceNum.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">RWF</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleViewDetails(c)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="View customer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEditCustomer(c)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors"
                            title="Edit customer"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRowMenuId(openRowMenuId === c.id ? null : c.id);
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {openRowMenuId === c.id && (
                              <div className="absolute right-0 mt-1 w-36 bg-card rounded-xl shadow-xl border border-border z-30 py-1 text-xs">
                                <button
                                  onClick={() => {
                                    setCustomerToDelete(c.id);
                                    setDeleteDialogOpen(true);
                                    setOpenRowMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 flex items-center gap-2 text-danger hover:bg-danger/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete Customer
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination Footer ────────────────────────────────────────────── */}
        {!isLoading && filteredCustomers.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-surface-subtle/50">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, totalCustomersCount)} of {totalCustomersCount} customers
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: Math.min(totalFilteredPages, 5) }, (_, i) => {
                const pNum = i + 1;
                return (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-xs font-semibold transition-colors",
                      page === pNum
                        ? "bg-primary text-white shadow-sm"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalFilteredPages))}
                disabled={page >= totalFilteredPages}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setPage(1);
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

      {/* ── Modals & Drawers ────────────────────────────────────────────── */}
      {isDialogOpen && (
        <CustomerForm
          initialData={
            editingCustomer
              ? {
                  ...editingCustomer,
                  type: editingCustomer.type || editingCustomer.customerType || "INDIVIDUAL",
                  tin: editingCustomer.TIN || "",
                  isrccCd: editingCustomer.isrccCd || "",
                  isrcRt: editingCustomer.isrcRt ?? undefined,
                  balance: typeof editingCustomer.balance === "string" ? parseFloat(editingCustomer.balance) : editingCustomer.balance,
                }
              : { name: "", email: "", phone: "", tin: "", type: "INDIVIDUAL", balance: 0, isrccCd: "", isrcRt: undefined }
          }
          onSubmit={handleSubmit}
          onClose={() => setIsDialogOpen(false)}
          isLoading={isSubmitting}
        />
      )}

      <Drawer open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DrawerContent className="max-w-4xl overflow-y-auto bg-card">
          <DrawerHeader>
            <DrawerTitle className="text-lg font-bold">Import Customers</DrawerTitle>
          </DrawerHeader>
          <CustomerImport onSuccess={handleImportSuccess} />
        </DrawerContent>
      </Drawer>

      <Drawer open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DrawerContent className="max-w-2xl overflow-y-auto bg-card">
          <DrawerHeader className="border-b border-border pb-3">
            <DrawerTitle className="text-base font-bold">Customer Details</DrawerTitle>
          </DrawerHeader>
          {viewingCustomer && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Customer Name", val: viewingCustomer.name },
                  { label: "Phone", val: viewingCustomer.phone || "—" },
                  { label: "Email", val: viewingCustomer.email || "—" },
                  { label: "Type", val: viewingCustomer.type },
                  { label: "Current Balance", val: `${parseFloat(viewingCustomer.balance).toLocaleString()} RWF` },
                  { label: "Total Purchases", val: loadingSales ? "Loading..." : `${totalSales} transactions` },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-xl bg-surface-subtle">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</p>
                    <p className="text-sm font-bold text-foreground">{item.val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title="Confirm Deletion"
        message={`Are you sure you want to delete ${customers.find((c) => c.id === customerToDelete)?.name || "this customer"}?`}
        confirmText="Delete"
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  );
}
