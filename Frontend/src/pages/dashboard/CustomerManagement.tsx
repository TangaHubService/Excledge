import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { apiClient } from "../../lib/api-client";
import { useDebounce } from "../../hooks/use-debounce";
import { CustomerList } from "../../components/customers/CustomerList";
import { CustomerFilters } from "../../components/customers/CustomerFilters";
import { CustomerForm } from "../../components/customers/CustomerForm";
import TableSkeleton from "../../components/ui/TableSkeleton";
import { CustomerImport } from "./imports/CustomerImport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useTheme } from "../../context/ThemeContext";

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone: string;
  customerType: 'INDIVIDUAL' | 'CORPORATE' | 'INSURANCE';
  TIN?: string;
  address?: string;
  balance: string;
  totalPurchases?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function CustomerManagement() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [page, setPage] = useState(1);
  // const [limit, setLimit] = useState(10);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [totalSales, setTotalSales] = useState(0);
  const [loadingSales, setLoadingSales] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const organizationId = localStorage.getItem("current_organization_id");

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setIsLoading(true);
        const data = await apiClient.getCustomers({ organizationId, page });
        setCustomers(data.customers);

      } catch (error) {
        console.error("Failed to fetch customers:", error);
        toast.error(t('messages.errorLoadingData'), {

          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
  }, [page, organizationId]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
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

    // Set initial customer data immediately for better UX
    setViewingCustomer({
      ...customer,
      id: String(customer.id),
      balance: String(customer.balance || 0),
      customerType: customer.customerType || 'INDIVIDUAL',
    });
    try {
      setLoadingSales(true);
      const customerData = await apiClient.getCustomerById(String(customer.id), organizationId || "");
      if (customerData) {
        setViewingCustomer({
          id: String(customerData.id || customer.id),
          name: customerData.name || customer.name || '',
          email: customerData.email || customer.email || '',
          phone: customerData.phone || customer.phone || '',
          address: customerData.address || customer.address || '',
          balance: String(customerData.balance || customer.balance || 0),
          customerType: customerData.customerType || 'INDIVIDUAL',
        });
        if (customerData.sales && Array.isArray(customerData.sales)) {
          setTotalSales(customerData.sales.length);
        } else {
          setTotalSales(0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch customer details:", error);
      toast.error(t('messages.errorLoadingData'));
      // Keep the initial customer data even if fetch fails
      setTotalSales(0);
    } finally {
      setLoadingSales(false);
    }
  };

  const handleImportSuccess = () => {
    // Refresh customers list after successful import
    const fetchCustomers = async () => {
      try {
        setIsLoading(true);
        const data = await apiClient.getCustomers({ organizationId, page });
        setCustomers(data.customers);

      } catch (error) {
        console.error("Failed to fetch customers:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
    setIsImportDialogOpen(false);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      setIsDeleting(true);
      await apiClient.deleteCustomer(customerToDelete);
      const customerName =
        customers.find((c) => c.id === customerToDelete)?.name || t('sales.customer');
      setCustomers(customers.filter((c) => c.id !== customerToDelete));
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      toast.success(`${customerName} ${t('messages.deleteSuccess')}`, {

        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } catch (error) {
      console.error("Failed to delete customer:", error);
      toast.error(t('messages.deleteError'), {

        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    try {
      setIsSubmitting(true);
      // Ensure balance is a number
      const formDataWithNumberBalance = {
        ...formData,
        balance:
          typeof formData.balance === "string"
            ? parseFloat(formData.balance)
            : formData.balance,
      };

      let successMessage = "";

      if (editingCustomer) {
        const updatedCustomer = await apiClient.updateCustomer(
          editingCustomer.id,
          formDataWithNumberBalance
        );
        setCustomers(
          customers.map((c) =>
            String(c.id) === String(updatedCustomer.id) ? updatedCustomer : c
          )
        );
        successMessage = t('messages.customerUpdated');
      } else {

        const newCustomer = await apiClient.createCustomer({
          ...formDataWithNumberBalance,
          organizationId,
        });
        setCustomers([newCustomer, ...customers]);
        successMessage = t('messages.customerCreated');
      }


      setIsDialogOpen(false);

      toast.success(successMessage, {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } catch (error) {
      console.error("Error saving customer:", error);
      toast.error(t('messages.saveError'), {

        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      customer.phone?.includes(debouncedSearchTerm)
  );

  // Paginate filtered customers
  const paginatedCustomers = filteredCustomers.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const totalFilteredPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const totalCustomers = customers.length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-64 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-48"></div>
            </div>
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-40"></div>
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
              >
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>

          {/* Search and Filter Skeleton */}
          <div className="flex items-center justify-between mb-6">
            <div className="w-1/3">
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md"></div>
            </div>
            <div className="flex space-x-2">
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-24"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-32"></div>
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <TableSkeleton
              rows={5}
              columns={7}
              className="w-full"
              rowHeight="h-4"
            />
          </div>

          {/* Pagination Skeleton */}
          <div className="flex items-center justify-between mt-4">
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-32"></div>
            <div className="flex space-x-2">
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-800 rounded-md"></div>
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-800 rounded-md"></div>
              <div className="h-8 w-8 bg-gray-200 dark:bg-gray-800 rounded-md"></div>
            </div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 dark:bg-gray-900 dark:text-white">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {t('customers.customerManagement')}
          </h1>
          <p className="text-muted-foreground">
            {t('messages.customerManageDesc')}
          </p>
        </div>


        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('customers.totalPurchases')}
              </h3>
              <p className="text-2xl font-bold">{totalCustomers}</p>
            </div>

          </div>
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('messages.customersWithDebt')}
              </h3>
              <p className="text-2xl font-bold">

                {customers.filter((c) => parseFloat(c.balance) > 0).length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card text-card-foreground">
          <div className="">
            <CustomerFilters
              searchTerm={searchTerm}
              onSearchChange={handleSearchChange}
              onAddCustomer={handleAddCustomer}
              onImport={handleImport}
              isLoading={isLoading}
            />

            <CustomerList
              customers={paginatedCustomers}
              onEdit={handleEditCustomer}
              // onDelete={handleDeleteCustomer} // Hidden as per request
              onViewDetails={handleViewDetails}
              isLoading={isLoading}
            />

            <div className="mt-4 flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {t('customers.showing')} <span className="font-medium">{(page - 1) * itemsPerPage + 1}</span> {t('customers.to')}{" "}
                  <span className="font-medium">
                    {Math.min(page * itemsPerPage, filteredCustomers.length)}
                  </span>{" "}
                  {t('customers.of')}{" "}
                  <span className="font-medium">{filteredCustomers.length}</span>{" "}
                  {t('customers.customers')}
                </div>
                <div className="flex items-center gap-2">
                  <label className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    {t('common.itemsPerPage')}:
                  </label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setPage(1);
                    }}
                    className={`px-2 py-1 border rounded-md text-sm ${theme === "dark" ? "border-gray-600 bg-gray-800 text-white" : "border-gray-300 bg-white text-gray-900"}`}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9 p-0"
                >
                  <span className="sr-only">Previous page</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <span className="text-sm font-medium">
                  {t('customers.pageXOfY', { current: page, total: totalFilteredPages || 1 })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalFilteredPages || 1, p + 1))}
                  disabled={page >= (totalFilteredPages || 1)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9 p-0"
                >
                  <span className="sr-only">Next page</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isDialogOpen && (
        <CustomerForm
initialData={
            editingCustomer
              ? {
                  ...editingCustomer,
                  customerType: editingCustomer.customerType,
                }
              : {
                  name: "",
                  email: "",
                  phone: "",
                  customerType: "INDIVIDUAL",
                }
          }
          onSubmit={handleSubmit}
          onClose={() => setIsDialogOpen(false)}
          isLoading={isSubmitting}
        />
      )}


      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent
          className={`max-w-4xl max-h-[90vh] overflow-y-auto ${theme === "dark"
            ? "bg-gray-900 border-gray-700 text-gray-100"
            : "bg-white border-gray-200 text-gray-900"
            }`}
        >
          <DialogHeader>
            <DialogTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>
              {t("customers.importCustomers")}
            </DialogTitle>
          </DialogHeader>
          <CustomerImport onSuccess={handleImportSuccess} />
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent
          className={`max-w-4xl max-h-[90vh] overflow-y-auto ${theme === "dark"
            ? "bg-gray-900 border-gray-700 text-gray-100"
            : "bg-white border-gray-200 text-gray-900"
            }`}
        >
          <DialogHeader>
            <DialogTitle className={theme === "dark" ? "text-white" : "text-gray-900"}>
              {t('customers.customerDetails')}
            </DialogTitle>
          </DialogHeader>
          {viewingCustomer && (
            <div className="space-y-6">
              {/* Customer Information */}
              <div className={`grid grid-cols-2 gap-4 p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white border border-gray-200"}`}>
                <div>
                  <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {t('customers.customerId')}
                  </label>
                  <p className={`text-lg font-mono ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    #{viewingCustomer.id}
                  </p>
                </div>
                <div>
                  <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {t('customers.fullName')}
                  </label>
                  <p className={`text-lg ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {viewingCustomer.name}
                  </p>
                </div>
                <div>
                  <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {t('common.email')}
                  </label>
                  <p className={`text-lg ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {viewingCustomer.email || '-'}
                  </p>
                </div>
                <div>
                  <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {t('common.phone')}
                  </label>
                  <p className={`text-lg ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {viewingCustomer.phone}
                  </p>
                </div>
                <div>
                  <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {t('customers.customerType')}
                  </label>
                  <p className={`text-lg ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                    {viewingCustomer.customerType}
                  </p>
</div>
                <div>
                  <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    {t('customers.table.balance')}
                  </label>
                  {(() => {
                    const balanceNum = parseFloat(String(viewingCustomer.balance || '0'));
                    return (
                      <p className={`text-lg font-medium ${balanceNum > 0 ? (theme === "dark" ? "text-red-400" : "text-red-600") : (theme === "dark" ? "text-white" : "text-gray-900")}`}>
                        {balanceNum.toLocaleString(undefined, {
                          style: 'currency',
                          currency: 'RWF',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    );
                  })()}
                </div>
                {viewingCustomer.createdAt && (
                  <div>
                    <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                      {t('common.createdAt')}
                    </label>
                    <p className={`text-lg ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {new Date(viewingCustomer.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                )}
                {viewingCustomer.updatedAt && (
                  <div>
                    <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                      {t('common.updatedAt')}
                    </label>
                    <p className={`text-lg ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                      {new Date(viewingCustomer.updatedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Purchases Count Section */}
              <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white border border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                      {t('customers.purchases')}
                    </label>
                    {loadingSales ? (
                      <p className={`text-2xl font-bold mt-1 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {t('common.loading')}
                      </p>
                    ) : (
                      <p className={`text-2xl font-bold mt-1 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
                        {totalSales}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title={t('common.confirmDelete') || "Confirm Deletion"}
        message={`${t('messages.confirmDeleteCustomer') || "Are you sure you want to delete"} ${customers.find(c => c.id === customerToDelete)?.name || t('common.customer')}?`}
        confirmText={t('common.delete') || "Delete"}
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  );
}
