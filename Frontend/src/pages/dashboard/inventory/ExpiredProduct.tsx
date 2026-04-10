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
import { useTheme } from "../../../context/ThemeContext";
import { format } from "date-fns";
import { apiClient } from "../../../lib/api-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../components/ui/button";
import ViewProductDialog from "./ViewProductDialog";
import { type Product } from "../../../types";

export default function ExpiredProducts() {
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
    const fetchExpiredProducts = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getExpiredProducts({
          days,
          page: currentPage,
          limit: limit
        });
        setProducts(response.data);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
        setError(null);
      } catch (err) {
        console.error("Error fetching expired products:", err);
        setError(t('messages.expiredLoadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchExpiredProducts();
  }, [days, currentPage, limit]);

  if (error) {
    return <div className="p-4 text-red-500">{error}</div>;
  }

  return (
    <div className="p-4 space-y-4 bg-background text-foreground min-h-screen dark:bg-background dark:text-foreground">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-foreground">{t('inventory.expiredProducts')}</h2>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <label htmlFor="days" className="font-medium whitespace-nowrap">
            {t('inventory.expiredInLast')}:
          </label>

          <Select
            value={days.toString()}
            onValueChange={(value: string) => {
              setDays(Number(value));
              setCurrentPage(1); // Reset to first page when filter changes
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('common.selectDays')} />
            </SelectTrigger>

            <SelectContent
              className={
                theme === "dark"
                  ? "bg-gray-800 border-gray-700 text-gray-300"
                  : "bg-white border-gray-300"
              }
            >
              <SelectItem value="7">{t('common.days', { count: 7 })}</SelectItem>
              <SelectItem value="30">{t('common.days', { count: 30 })}</SelectItem>
              <SelectItem value="90">{t('common.days', { count: 90 })}</SelectItem>
              <SelectItem value="365">{t('common.year', { count: 1 })}</SelectItem>

            </SelectContent>
          </Select>
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
            {t('inventory.expiredProducts')}
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
                    {products?.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-gray-600"
                        >
                          {t('messages.noData')}
                        </TableCell>

                      </TableRow>
                    ) : (
                      products.map((product) => (
                        <TableRow
                          key={product.id}
                          className={`${theme === "dark"
                            ? "hover:bg-gray-800 border-gray-800"
                            : "hover:bg-gray-50 border-gray-100"
                            }`}
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
                            className={
                              theme === "dark" ? "text-gray-300" : "text-gray-900"
                            }
                          >
                            {product.name}
                          </TableCell>
                          <TableCell
                            className={
                              theme === "dark" ? "text-gray-300" : "text-gray-900"
                            }
                          >
                            {product.batchNumber}
                          </TableCell>
                          <TableCell
                            className={
                              theme === "dark" ? "text-gray-300" : "text-gray-900"
                            }
                          >
                            {format(new Date(product.expiryDate!), "MMM dd, yyyy")}
                          </TableCell>
                          <TableCell
                            className={
                              theme === "dark" ? "text-gray-300" : "text-gray-900"
                            }
                          >
                            {product.quantity}
                          </TableCell>
                          <TableCell
                            className={
                              theme === "dark" ? "text-gray-300" : "text-gray-900"
                            }
                          >
                            {Number(product.unitPrice).toFixed(2)} Frw
                          </TableCell>
                          <TableCell
                            className={
                              theme === "dark" ? "text-gray-300" : "text-gray-900"
                            }
                          >
                            {(product.quantity * Number(product.unitPrice)).toFixed(2)} Frw
                          </TableCell>
                        </TableRow>
                      ))
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
}
