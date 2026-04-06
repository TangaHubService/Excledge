import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { useTheme } from "../../../context/ThemeContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { apiClient } from "../../../lib/api-client";
import { type Product } from "../../../types";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import ViewProductDialog from "./ViewProductDialog";
import { useDebounce } from "../../../hooks/use-debounce";

export const LowStock = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();

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
        const params: any = {
          page: currentPage,
          limit: limit
        };

        if (debouncedSearchTerm.trim()) {
          params.search = debouncedSearchTerm.trim();
        }

        if (statusFilter !== "all") {
          params.status = statusFilter;
        }

        const response = await apiClient.getLowStockProducts(params);
        setProducts(response.data);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
        setError(null);
      } catch (err) {
        console.error("Error fetching low stock products:", err);
        setError(t('messages.lowStockLoadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchLowStockProducts();
  }, [currentPage, limit, debouncedSearchTerm, statusFilter, t]);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, statusFilter]);

  const getStockStatus = (quantity: number, minStock: number) => {
    const percentage = (quantity / minStock) * 100;
    if (percentage <= 25)
      return { label: t('inventory.critical'), color: "bg-red-500 text-white" };
    if (percentage <= 50)
      return { label: t('inventory.low'), color: "bg-yellow-100 text-yellow-800" };
    return { label: t('inventory.warning'), color: "bg-orange-100 text-orange-800" };
  };

  if (error) {
    return <div className="p-4 text-red-500">{error}</div>;
  }

  const handleClearSearch = () => {
    setSearchTerm("");
    setStatusFilter("all");
  };

  const hasActiveFilters = debouncedSearchTerm.trim() !== "" || statusFilter !== "all";

  return (
    <div className="p-4 space-y-4 bg-background text-foreground min-h-screen dark:bg-background dark:text-foreground">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t('inventory.lowStockProducts')}</h2>
      </div>

      {/* Filters Card */}
      <Card
        className={
          theme === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-300"
        }
      >
        <CardHeader>
          <CardTitle
            className={theme === "dark" ? "text-gray-400" : "text-gray-800"}
          >
            {t('common.filters') || 'Filters'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-gray-400" : "text-gray-700"}>
                {t('common.search') || 'Search'}
              </Label>
              <div className="relative group">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 transition-colors ${searchTerm ? 'text-blue-500' : 'text-gray-400 group-focus-within:text-blue-500'
                  }`} />
                <Input
                  type="text"
                  placeholder={t('inventory.searchPlaceholder') || 'Search by name, SKU, or batch number...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg ${theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500"
                      : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                    }`}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label className={theme === "dark" ? "text-gray-400" : "text-gray-700"}>
                {t('common.status') || 'Status'}
              </Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-gray-200"
                    : "bg-white border-gray-300"
                  }`}
              >
                <option value="all">{t('common.all') || 'All'}</option>
                <option value="critical">{t('inventory.critical') || 'Critical'}</option>
                <option value="low">{t('inventory.low') || 'Low'}</option>
                <option value="warning">{t('inventory.warning') || 'Warning'}</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            <div className="space-y-2 flex items-end">
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={handleClearSearch}
                  className={`w-full ${theme === "dark" ? "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" : ""}`}
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('common.clearFilters') || 'Clear Filters'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className={
          theme === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-300"
        }
      >
        <CardHeader>
          <CardTitle
            className={theme === "dark" ? "text-gray-400" : "text-gray-800"}
          >
            {t('inventory.lowStockProducts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-10 w-full ${theme === "dark" ? "bg-gray-700" : "bg-gray-200"
                    } rounded-md animate-pulse`}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table
                  className={
                    theme === "dark" ? "text-gray-200" : "text-gray-800 "
                  }
                >
                  <TableHeader
                    className={
                      theme === "dark"
                        ? "bg-gray-800 border-b border-gray-700"
                        : "bg-gray-50 border-b border-gray-400"
                    }
                  >
                    <TableRow>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        ID
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('inventory.productName')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('inventory.batchNumber')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('inventory.currentStock')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('inventory.minRequired')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('common.status')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('inventory.unitPrice')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('common.amount')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody
                    className={
                      theme === "dark" ? "border-gray-700" : "border-gray-400"
                    }
                  >
                    {products?.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-gray-600"
                        >
                          {t('messages.noData')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((product) => {
                        const status = getStockStatus(
                          product.quantity,
                          product.minStock
                        );
                        return (
                          <TableRow
                            key={product.id}
                            className={
                              theme === "dark"
                                ? "hover:bg-gray-800 border-gray-700"
                                : "hover:bg-gray-50"
                            }
                          >
                            <TableCell
                              className={
                                theme === "dark" ? "text-gray-400" : "text-gray-500 font-mono text-xs"
                              }
                            >
                              <button
                                onClick={() => setViewProduct(product)}
                                className="hover:underline hover:text-blue-500 transition-colors"
                              >
                                {product.id}
                              </button>
                            </TableCell>
                            <TableCell
                              className={theme === "dark" ? "text-gray-300" : "text-gray-900"}
                            >
                              {product.name}
                            </TableCell>
                            <TableCell
                              className={theme === "dark" ? "text-gray-300" : "text-gray-900"}
                            >
                              {product.batchNumber}
                            </TableCell>
                            <TableCell
                              className={theme === "dark" ? "text-gray-300" : "text-gray-900"}
                            >
                              {product.quantity}
                            </TableCell>
                            <TableCell
                              className={theme === "dark" ? "text-gray-300" : "text-gray-900"}
                            >
                              {product.minStock}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${status.color}`}
                              >
                                {status.label}
                              </span>
                            </TableCell>
                            <TableCell
                              className={theme === "dark" ? "text-gray-300" : "text-gray-900"}
                            >
                              {(Number(product.unitPrice) || 0).toFixed(2)} Frw
                            </TableCell>
                            <TableCell
                              className={theme === "dark" ? "text-gray-300" : "text-gray-900"}
                            >
                              {(product.quantity * (Number(product.unitPrice) || 0)).toFixed(2)} Frw
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between px-2 py-4 border-t border-gray-200 dark:border-gray-700 gap-4">
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {t('common.showing')} {(currentPage - 1) * limit + 1} {t('common.to')} {Math.min(currentPage * limit, totalItems)} {t('common.of')} {totalItems} {t('inventory.products')}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('common.rowsPerPage')}:</span>
                      <select
                        className="border rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                        value={limit}
                        onChange={(e) => {
                          setLimit(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                      >
                        {[10, 20, 50, 100].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className={theme === "dark" ? "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" : ""}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      {t('common.previous')}
                    </Button>
                    <div className="flex items-center gap-1 mx-2">
                      <span className="text-sm font-medium">{currentPage}</span>
                      <span className="text-sm text-gray-500">/</span>
                      <span className="text-sm text-gray-500">{totalPages}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className={theme === "dark" ? "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700" : ""}
                    >
                      {t('common.next')}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ViewProductDialog
        viewProduct={viewProduct}
        setViewProduct={setViewProduct}
      />
    </div>
  );
};

export default LowStock;
