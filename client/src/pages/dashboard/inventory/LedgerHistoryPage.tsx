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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, Filter, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { saveAs } from 'file-saver';

interface LedgerEntry {
  id: number;
  product: {
    id: number;
    name: string;
    category?: string;
  };
  movementType: string;
  direction: 'IN' | 'OUT';
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
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [productId, setProductId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [movementType, setMovementType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [limit, setLimit] = useState(20);

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
      if (branchId) params.branchId = branchId === 'null' ? null : parseInt(branchId);
      if (movementType) params.movementType = movementType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await apiClient.getInventoryLedger(params);
      setEntries(response.entries || []);
      setTotalPages(response.pagination?.totalPages || 1);
      setTotalItems(response.pagination?.totalItems || 0);
    } catch (err: any) {
      console.error('Error fetching ledger entries:', err);
      setError(err.message || 'Failed to load stock movements');
      toast.error(err.message || 'Failed to load stock movements');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setProductId('');
    setBranchId('');
    setMovementType('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const getMovementTypeColor = (direction: string) => {
    if (direction === 'IN') {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    } else {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const exportToExcel = async () => {
    try {
      // Fetch all entries if we're on a filtered/paginated view
      const params: any = {
        page: 1,
        limit: 10000, // Large limit to get all entries
      };

      if (productId) params.productId = parseInt(productId);
      if (branchId) params.branchId = branchId === 'null' ? null : parseInt(branchId);
      if (movementType) params.movementType = movementType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await apiClient.getInventoryLedger(params);
      const allEntries = response.entries || [];

      // Prepare data for Excel
      const headers = ['Date', 'Product', 'Movement Type', 'Direction', 'Quantity Change', 'Balance After', 'Branch', 'User', 'Reference', 'Reason/Note'];
      const rows = allEntries.map((entry: LedgerEntry) => [
        formatDate(entry.createdAt),
        entry.product.name,
        entry.movementType.replace(/_/g, ' '),
        entry.direction,
        entry.direction === 'IN' ? entry.quantity : -entry.quantity,
        entry.runningBalance,
        entry.branch?.name || 'Main Branch',
        entry.user.name,
        entry.reference || '',
        entry.note || '',
      ]);

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Set column widths
      ws['!cols'] = [
        { wch: 20 }, // Date
        { wch: 25 }, // Product
        { wch: 20 }, // Movement Type
        { wch: 12 }, // Direction
        { wch: 15 }, // Quantity Change
        { wch: 15 }, // Balance After
        { wch: 20 }, // Branch
        { wch: 20 }, // User
        { wch: 20 }, // Reference
        { wch: 30 }, // Reason/Note
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Stock Movements');

      // Generate Excel file
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const fileName = `stock-movement-history-${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(blob, fileName);

      toast.success(t('inventory.exportExcelSuccess') || 'Excel file exported successfully');
    } catch (error: any) {
      console.error('Error exporting to Excel:', error);
      toast.error(t('inventory.exportExcelError') || 'Failed to export Excel file');
    }
  };

  const exportToPDF = async () => {
    try {
      // Fetch all entries if we're on a filtered/paginated view
      const params: any = {
        page: 1,
        limit: 10000, // Large limit to get all entries
      };

      if (productId) params.productId = parseInt(productId);
      if (branchId) params.branchId = branchId === 'null' ? null : parseInt(branchId);
      if (movementType) params.movementType = movementType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await apiClient.getInventoryLedger(params);
      const allEntries = response.entries || [];

      // Create PDF
      const doc = new jsPDF('landscape') as jsPDF & { autoTable: (options: UserOptions) => void };

      // Add title
      doc.setFontSize(16);
      doc.text('Stock Movement History', 14, 15);

      // Add date range if filtered
      let subtitle = '';
      if (startDate || endDate) {
        subtitle = `Period: ${startDate || 'Start'} to ${endDate || 'End'}`;
      } else {
        subtitle = 'All Time';
      }
      doc.setFontSize(10);
      doc.text(subtitle, 14, 22);

      // Prepare table data
      const tableData = allEntries.map((entry: LedgerEntry) => [
        formatDateShort(entry.createdAt),
        entry.product.name,
        entry.movementType.replace(/_/g, ' '),
        entry.direction,
        entry.direction === 'IN' ? `+${entry.quantity}` : `-${entry.quantity}`,
        entry.runningBalance.toString(),
        entry.branch?.name || 'Main',
        entry.user.name,
        entry.reference || '-',
        entry.note || '-',
      ]);

      // Add table
      autoTable(doc, {
        head: [['Date', 'Product', 'Movement Type', 'Direction', 'Quantity Change', 'Balance After', 'Branch', 'User', 'Reference', 'Note']],
        body: tableData,
        startY: 28,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { top: 28 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 30 },
          3: { cellWidth: 20 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
          6: { cellWidth: 30 },
          7: { cellWidth: 30 },
          8: { cellWidth: 30 },
          9: { cellWidth: 40 },
        },
      });

      // Save PDF
      const fileName = `stock-movement-history-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

      toast.success(t('inventory.exportPDFSuccess') || 'PDF file exported successfully');
    } catch (error: any) {
      console.error('Error exporting to PDF:', error);
      toast.error(t('inventory.exportPDFError') || 'Failed to export PDF file');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          {t('inventory.stockMovementHistory') || 'Stock Movement History'}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            onClick={exportToExcel}
            variant="outline"
            size="sm"
            className={theme === 'dark'
              ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {t('inventory.exportExcel') || 'Export Excel'}
          </Button>
          <Button
            onClick={exportToPDF}
            variant="outline"
            size="sm"
            className={theme === 'dark'
              ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }
          >
            <FileText className="h-4 w-4 mr-2" />
            {t('inventory.exportPDF') || 'Export PDF'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
            <Filter className="h-5 w-5" />
            {t('common.filters') || 'Filters'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}>
                {t('inventory.productId') || 'Product ID'}
              </Label>
              <Input
                type="number"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder={t('inventory.enterProductId') || 'Enter product ID'}
                className={theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400'
                  : 'bg-white border-gray-300 text-gray-900'
                }
              />
            </div>
            <div className="space-y-2">
              <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}>
                {t('inventory.branch') || 'Branch'}
              </Label>
              <Input
                type="number"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder={t('inventory.enterBranchId') || 'Enter branch ID'}
                className={theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400'
                  : 'bg-white border-gray-300 text-gray-900'
                }
              />
            </div>
            <div className="space-y-2">
              <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}>
                {t('inventory.movementType') || 'Movement Type'}
              </Label>
              <Input
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                placeholder={t('inventory.enterMovementType') || 'e.g., PURCHASE, SALE'}
                className={theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400'
                  : 'bg-white border-gray-300 text-gray-900'
                }
              />
            </div>
            <div className="space-y-2">
              <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}>
                {t('common.startDate') || 'Start Date'}
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
                }
              />
            </div>
            <div className="space-y-2">
              <Label className={theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}>
                {t('common.endDate') || 'End Date'}
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
                }
              />
            </div>
            <div className="space-y-2 flex items-end">
              <Button
                onClick={handleResetFilters}
                variant="outline"
                className={`w-full ${theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600 hover:text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                {t('common.reset') || 'Reset'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Entries Table */}
      <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
        <CardHeader>
          <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
            {t('inventory.stockMovements') || 'Stock Movements'} ({totalItems})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className={`text-center py-12 ${theme === 'dark' ? 'text-red-400' : 'text-red-500'}`}>
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('inventory.noStockMovements') || 'No stock movements found'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className={theme === 'dark' ? 'border-gray-700' : ''}>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('common.date')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('common.product')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.movementType')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.direction')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap text-right ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.quantityChange') || 'Quantity Change'}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap text-right ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.balanceAfter') || 'Balance After'}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.branch')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.user')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('inventory.reference')}
                      </TableHead>
                      <TableHead className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                        {t('common.note')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : 'hover:bg-gray-50'}
                      >
                        <TableCell className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          {formatDate(entry.createdAt)}
                        </TableCell>
                        <TableCell className={`whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                          <div>
                            <div className="font-medium">{entry.product.name}</div>
                            {entry.product.category && (
                              <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                {entry.product.category}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getMovementTypeColor(entry.direction)}>
                            {entry.movementType.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {entry.direction === 'IN' ? (
                              <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            <span className={entry.direction === 'IN' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              {entry.direction}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          {entry.direction === 'IN' ? '+' : '-'}{entry.quantity}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                          {entry.runningBalance}
                        </TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          {entry.branch ? entry.branch.name : '-'}
                        </TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          {entry.user.name}
                        </TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                          {entry.reference || '-'}
                        </TableCell>
                        <TableCell className={`text-xs max-w-[200px] truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} title={entry.note || ''}>
                          {entry.note || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('common.rowsPerPage') || 'Rows per page:'}
                  </span>
                  <select
                    className={`border rounded-md px-2 py-1 text-sm ${theme === 'dark'
                      ? 'bg-gray-700 border-gray-600 text-gray-300'
                      : 'bg-white border-gray-300 text-gray-700'
                      }`}
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                    {t('customers.pageXOfY', { current: currentPage, total: totalPages })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className={theme === 'dark'
                      ? 'border-gray-700 text-white hover:bg-gray-700 hover:text-white disabled:text-gray-500'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:text-gray-400'
                    }
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> {t('common.prev')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                    className={theme === 'dark'
                      ? 'border-gray-700 text-white hover:bg-gray-700 hover:text-white disabled:text-gray-500'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:text-gray-400'
                    }
                  >
                    {t('common.next')} <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
