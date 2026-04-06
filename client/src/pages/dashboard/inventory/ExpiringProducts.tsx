import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { apiClient } from "../../../lib/api-client";
import { format } from "date-fns";
import { useTheme } from "../../../context/ThemeContext";
import { Button } from "../../../components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ViewProductDialog from "./ViewProductDialog";
import { type Product } from "../../../types";

export const ExpiringProducts = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
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
          limit: limit
        });

        // Add days until expiry to each product if needed, but we can compute it on render
        setProducts(response.data);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
        setError(null);
      } catch (err) {
        console.error("Error fetching expiring products:", err);
        setError(t('messages.expiringLoadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchExpiringProducts();
  }, [days, currentPage, limit]);

  const getDaysUntilExpiry = (expiryDate: string) => {
    return Math.ceil(
      (new Date(expiryDate).getTime() - Date.now()) /
      (1000 * 60 * 60 * 24)
    );
  };

  const getExpiryStatus = (days: number) => {
    if (days <= 0)
      return { label: t('inventory.expired'), color: "bg-red-100 text-red-800" };
    if (days <= 7) return { label: t('inventory.critical'), color: "bg-red-500 text-white" };
    if (days <= 30)
      return { label: t('inventory.warning'), color: "bg-yellow-100 text-yellow-800" };
    return { label: t('common.good'), color: "bg-green-100 text-green-800" };
  };

  if (error) {
    return <div className="p-4 text-red-500">{error}</div>;
  }

  return (
    <div className="p-4 space-y-4 bg-background text-foreground min-h-screen dark:bg-background dark:text-foreground">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold">{t('inventory.expiringProducts')}</h2>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <label htmlFor="days" className="text-sm font-medium whitespace-nowrap">
            {t('inventory.expiringInNext')}:
          </label>

          <select
            id="days"
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setCurrentPage(1); // Reset to first page when filter changes
            }}
            className={`border rounded p-1 text-sm ${theme === "dark" ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-300"
              }`}
          >
            <option value={7}>{t('common.days', { count: 7 })}</option>
            <option value={30}>{t('common.days', { count: 30 })}</option>
            <option value={90}>{t('common.days', { count: 90 })}</option>
            <option value={365}>{t('common.year', { count: 1 })}</option>
          </select>
        </div>
      </div>

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
            {t('inventory.expiringProductsList')}
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
                        {t('inventory.expiryDate')}
                      </TableHead>
                      <TableHead
                        className={
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }
                      >
                        {t('inventory.daysUntilExpiry')}
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
                        {t('inventory.quantity')}
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
                    {products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          {t('messages.noExpiringProducts')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((product) => {
                        const daysLeft = getDaysUntilExpiry(product.expiryDate!);
                        const status = getExpiryStatus(daysLeft);
                        return (
                          <TableRow
                            key={product.id}
                            className={
                              theme === "dark"
                                ? "hover:bg-gray-800 border-gray-700"
                                : "hover:bg-gray-50 border-gray-100"
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
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {product.name}
                            </TableCell>
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {product.batchNumber}
                            </TableCell>
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {format(new Date(product.expiryDate!), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {daysLeft <= 0
                                ? t('inventory.expired')
                                : t('common.days', { count: daysLeft })}
                            </TableCell>

                            <TableCell>
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${status.color}`}
                              >
                                {status.label}
                              </span>
                            </TableCell>
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {product.quantity}
                            </TableCell>
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {Number(product.unitPrice).toFixed(2)} Frw
                            </TableCell>
                            <TableCell className={theme === "dark" ? "text-gray-300" : "text-gray-900"}>
                              {(product.quantity * Number(product.unitPrice)).toFixed(2)} Frw
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

export default ExpiringProducts;
