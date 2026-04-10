import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { apiClient } from '../../../lib/api-client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Loader2, TrendingUp, TrendingDown, Package, DollarSign } from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '../../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';

interface SummaryItem {
  productId: number;
  branchId: number | null;
  totalIn: number;
  totalOut: number;
  currentStock: number;
  totalCost: number;
  movements: {
    IN: number;
    OUT: number;
  };
  byType: Record<string, {
    count: number;
    quantity: number;
  }>;
}

interface InventorySummaryResponse {
  summary: SummaryItem[];
  fromDate: string;
}

export default function InventorySummaryDashboard() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [summaryData, setSummaryData] = useState<InventorySummaryResponse | null>(null);
  const [products, setProducts] = useState<Map<number, { name: string; sku?: string }>>(new Map());
  const [branches, setBranches] = useState<Map<number, { name: string; code?: string }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [productId, setProductId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('inception');

  useEffect(() => {
    fetchSummary();
  }, [productId, branchId, fromDate]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (productId) params.productId = parseInt(productId);
      if (branchId) params.branchId = branchId === 'null' ? null : parseInt(branchId);
      params.from = fromDate;

      const data = await apiClient.getInventorySummary(params);

      // Normalize data structure - handle potential nesting
      // Backend might return { summary: { summary: [...], fromDate }, fromDate }
      // or { summary: [...], fromDate }
      let normalizedData: InventorySummaryResponse;
      if (Array.isArray(data.summary)) {
        // Direct array
        normalizedData = {
          summary: data.summary,
          fromDate: data.fromDate || (data as any).summary?.fromDate || 'inception',
        };
      } else if (data.summary?.summary && Array.isArray(data.summary.summary)) {
        // Nested structure
        normalizedData = {
          summary: data.summary.summary,
          fromDate: data.summary.fromDate || data.fromDate || 'inception',
        };
      } else {
        // Fallback to empty array
        normalizedData = {
          summary: [],
          fromDate: data.fromDate || 'inception',
        };
      }

      setSummaryData(normalizedData);

      // Fetch product names for display
      if (normalizedData.summary.length > 0) {
        const summaryArray = normalizedData.summary;
        const productIds = [...new Set(summaryArray.map(s => s.productId))];
        const branchIds = [...new Set(summaryArray.map(s => s.branchId).filter(id => id !== null))] as number[];

        // Fetch products
        const productPromises = productIds.map(id =>
          apiClient.getProducts({ id: id.toString() }).catch(() => null)
        );
        const productResults = await Promise.all(productPromises);
        const productMap = new Map<number, { name: string; sku?: string }>();
        productResults.forEach((result: any) => {
          if (result?.data?.[0]) {
            const p = result.data[0];
            productMap.set(p.id, { name: p.name, sku: p.sku });
          }
        });
        setProducts(productMap);

        // Fetch branches if needed
        if (branchIds.length > 0) {
          try {
            const branchesData = await apiClient.getBranches();
            const branchMap = new Map<number, { name: string; code?: string }>();
            branchesData.forEach((b: any) => {
              branchMap.set(b.id, { name: b.name, code: b.code });
            });
            setBranches(branchMap);
          } catch (err) {
            // Ignore warehouse fetch errors
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching inventory summary:', err);
      setError(err.message || 'Failed to load inventory summary');
      toast.error(err.message || 'Failed to load inventory summary');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0,
    }).format(num);
  };

  // Calculate totals from summary array
  const calculateTotals = () => {
    if (!summaryData?.summary || !Array.isArray(summaryData.summary) || summaryData.summary.length === 0) {
      return null;
    }

    return summaryData.summary.reduce((acc, item) => ({
      totalIn: acc.totalIn + item.totalIn,
      totalOut: acc.totalOut + item.totalOut,
      totalCost: acc.totalCost + item.totalCost,
      totalStock: acc.totalStock + item.currentStock,
      totalMovements: acc.totalMovements + item.movements.IN + item.movements.OUT,
    }), { totalIn: 0, totalOut: 0, totalCost: 0, totalStock: 0, totalMovements: 0 });
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          {t('inventory.inventorySummary') || 'Inventory Summary Dashboard'}
        </h1>
      </div>

      {/* Filters */}
      <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
        <CardHeader>
          <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
            {t('common.filters') || 'Filters'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('inventory.productId') || 'Product ID'}</Label>
              <Input
                type="number"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder={t('inventory.enterProductId') || 'Enter product ID (optional)'}
                className={theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('inventory.branch') || 'Branch'}</Label>
              <Input
                type="number"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder={t('inventory.enterBranchId') || 'Enter branch ID (optional)'}
                className={theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.fromDate') || 'From Date'}</Label>
              <Input
                type="date"
                value={fromDate === 'inception' ? '' : fromDate}
                onChange={(e) => setFromDate(e.target.value || 'inception')}
                placeholder={t('inventory.fromInception') || 'From inception'}
                className={theme === 'dark' ? 'bg-gray-700 border-gray-600' : ''}
              />
              <p className="text-xs text-gray-500">
                {t('inventory.leaveEmptyForInception') || 'Leave empty for "from inception"'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : summaryData && Array.isArray(summaryData.summary) ? (
        <>
          {/* Summary Cards */}
          {totals && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('inventory.totalStockIn') || 'Total Stock IN'}
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {formatNumber(totals.totalIn)}
                  </div>
                </CardContent>
              </Card>

              <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('inventory.totalStockOut') || 'Total Stock OUT'}
                  </CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {formatNumber(totals.totalOut)}
                  </div>
                </CardContent>
              </Card>

              <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('inventory.currentStock') || 'Current Stock'}
                  </CardTitle>
                  <Package className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {formatNumber(totals.totalStock)}
                  </div>
                </CardContent>
              </Card>

              <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('inventory.totalCost') || 'Total Cost'}
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(totals.totalCost)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Summary Table */}
          <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
            <CardHeader>
              <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
                {t('inventory.inventorySummary') || 'Inventory Summary by Product & Branch'}
                {summaryData.fromDate && summaryData.fromDate !== 'inception' && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({t('common.from')} {summaryData.fromDate})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className={theme === 'dark' ? 'border-gray-700' : ''}>
                      <TableHead>{t('common.product') || 'Product'}</TableHead>
                      <TableHead>{t('inventory.branch') || 'Branch'}</TableHead>
                      <TableHead className="text-right">{t('inventory.totalIn') || 'Total IN'}</TableHead>
                      <TableHead className="text-right">{t('inventory.totalOut') || 'Total OUT'}</TableHead>
                      <TableHead className="text-right">{t('inventory.currentStock') || 'Current Stock'}</TableHead>
                      <TableHead className="text-right">{t('inventory.totalCost') || 'Total Cost'}</TableHead>
                      <TableHead className="text-right">{t('inventory.movements') || 'Movements'}</TableHead>
                      <TableHead>{t('inventory.byType') || 'By Type'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryData.summary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          {t('inventory.noSummaryData') || 'No summary data found'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      summaryData.summary.map((item, index) => {
                        const product = products.get(item.productId);
                        const branch = item.branchId ? branches.get(item.branchId) : null;

                        return (
                          <TableRow
                            key={`${item.productId}-${item.branchId}-${index}`}
                            className={theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : 'hover:bg-gray-50'}
                          >
                            <TableCell className="font-medium">
                              {product?.name || `Product #${item.productId}`}
                              {product?.sku && (
                                <div className="text-xs text-gray-500">SKU: {product.sku}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {branch ? branch.name : item.branchId === null ? (t('inventory.mainBranch') || 'Main Branch') : `Branch #${item.branchId}`}
                              {branch?.code && (
                                <div className="text-xs text-gray-500">{branch.code}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-green-600 dark:text-green-400 font-mono">
                              +{formatNumber(item.totalIn)}
                            </TableCell>
                            <TableCell className="text-right text-red-600 dark:text-red-400 font-mono">
                              -{formatNumber(item.totalOut)}
                            </TableCell>
                            <TableCell className="text-right font-semibold font-mono">
                              {formatNumber(item.currentStock)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(item.totalCost)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="space-y-1">
                                <div className="text-xs text-green-600 dark:text-green-400">
                                  IN: {item.movements.IN}
                                </div>
                                <div className="text-xs text-red-600 dark:text-red-400">
                                  OUT: {item.movements.OUT}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 max-w-xs">
                                {Object.entries(item.byType || {}).map(([type, stats]) => (
                                  <div key={type} className="text-xs">
                                    <Badge variant="outline" className="mr-1">
                                      {type.replace(/_/g, ' ')}
                                    </Badge>
                                    <span className="text-gray-500">
                                      {stats.count} × {formatNumber(stats.quantity)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
