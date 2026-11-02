import { useState, useEffect } from 'react';
import { Calendar, Package, ArrowUpRight, ArrowDownRight, History, FileText, Loader2, Search, Filter, X, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { jsPDF as JsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { useTheme } from '../../../context/ThemeContext';
import { PageHeader } from "../../../components/common/PageHeader";

interface StockReportItem {
    productId: number;
    productName: string;
    batchNumber: string;
    unitPrice: number;
    openingStock: number;
    stockIn: number;
    stockOut: number;
    closingStock: number;
    stockValue: number;
}

interface StockSummary {
    totalOpening: number;
    totalIn: number;
    totalOut: number;
    totalClosing: number;
    totalValue: number;
}

interface StockMovement {
    id: number;
    createdAt: string;
    movementType: string;
    direction: 'IN' | 'OUT';
    quantity: number;
    previousStock: number;
    newStock: number;
    note: string;
    reference: string;
    productId: number;
    product: { name: string; batchNumber: string };
    user: { name: string };
}

export const StockReports = () => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<'report' | 'history'>('report');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]); // Start of month
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [movementType, setMovementType] = useState('ALL');

    // Data
    const [reportData, setReportData] = useState<StockReportItem[]>([]);
    const [summary, setSummary] = useState<StockSummary | null>(null);
    const [historyData, setHistoryData] = useState<StockMovement[]>([]);
    const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalItems: 0 });
    
    // Pagination for report tab
    const [reportCurrentPage, setReportCurrentPage] = useState(1);
    const [reportItemsPerPage, setReportItemsPerPage] = useState(10);

    useEffect(() => {
        fetchData();
    }, [activeTab, startDate, endDate, movementType, pagination.currentPage]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            if (activeTab === 'report') {
                const data = await apiClient.getStockReport({
                    startDate,
                    endDate,
                });
                setReportData(data.data);
                setSummary(data.summary);
            } else {
                const data = await apiClient.getStockHistory({
                    startDate,
                    endDate,
                    type: movementType === 'ALL' ? undefined : movementType,
                    page: pagination.currentPage,
                    limit: 20
                });
                console.log('Stock History Response:', data); // Debug
                setHistoryData(data.data || []);
                const paginationData = {
                    currentPage: data.pagination?.currentPage || 1,
                    totalPages: data.pagination?.totalPages || 1,
                    totalItems: data.pagination?.totalItems || (data.data?.length || 0)
                };
                console.log('Setting Pagination:', paginationData); // Debug
                setPagination(paginationData);
            }
        } catch (err: any) {
            console.error('Error fetching stock data:', err);
            setError(err.message || t('reports.failedToLoadStockData') || 'Failed to load stock data');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    };

    const exportToExcel = (data: any[], fileName: string) => {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
        XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportExcel = () => {
        if (activeTab === 'report') {
            const data = reportData.map(item => ({
                'Product Name': item.productName,
                'Batch Number': item.batchNumber || 'N/A',
                'Opening Stock': item.openingStock,
                'Stock In': item.stockIn,
                'Stock Out': item.stockOut,
                'Closing Stock': item.closingStock,
                'Unit Price': item.unitPrice,
                'Inventory Value': item.stockValue
            }));
            exportToExcel(data, 'stock_report');
        } else {
            const data = historyData.map(item => ({
                'Date': new Date(item.createdAt).toLocaleString(),
                'Product': item.product.name,
                'Batch': item.product.batchNumber || 'N/A',
                'Type': item.movementType,
                'Quantity': item.quantity,
                'Previous Stock': item.previousStock,
                'New Stock': item.newStock,
                'User': item.user.name,
                'Note': item.note,
                'Reference': item.reference
            }));
            exportToExcel(data, 'stock_history');
        }
    };

    const handleExportPdf = async () => {
        try {
            setIsGeneratingPdf(true);
            const doc = new jsPDF('landscape') as JsPDF & { autoTable: (options: UserOptions) => void };
            const title = activeTab === 'report' ? 'Stock Movement Report' : 'Stock Movement History';
            const fileName = activeTab === 'report' ? 'stock_report' : 'stock_history';

            doc.setFontSize(18);
            doc.text(title, 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 34);

            let columns: any[] = [];
            let body: any[] = [];

            if (activeTab === 'report') {
                columns = [
                    { header: 'Product', key: 'name' },
                    { header: 'Batch', key: 'batch' },
                    { header: 'Opening', key: 'opening' },
                    { header: 'In', key: 'in' },
                    { header: 'Out', key: 'out' },
                    { header: 'Closing', key: 'closing' },
                    { header: 'Value', key: 'value' }
                ];
                body = reportData.map(item => [
                    item.productName,
                    item.batchNumber || 'N/A',
                    item.openingStock,
                    item.stockIn,
                    item.stockOut,
                    item.closingStock,
                    formatCurrency(item.stockValue)
                ]);
            } else {
                columns = [
                    { header: 'Date', key: 'date' },
                    { header: 'Product', key: 'product' },
                    { header: 'Type', key: 'type' },
                    { header: 'Qty', key: 'qty' },
                    { header: 'Prev', key: 'prev' },
                    { header: 'New', key: 'new' },
                    { header: 'User', key: 'user' }
                ];
                body = historyData.map(item => [
                    new Date(item.createdAt).toLocaleString(),
                    item.product.name,
                    item.movementType,
                    item.quantity,
                    item.previousStock,
                    item.newStock,
                    item.user.name
                ]);
            }

            autoTable(doc, {
                head: [columns.map(col => col.header)],
                body: body,
                startY: 40,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [41, 128, 185] },
            });

            doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const filteredReport = reportData.filter(item =>
        item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.batchNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Paginate filtered report
    const reportTotalPages = Math.ceil(filteredReport.length / reportItemsPerPage);
    const paginatedReport = filteredReport.slice(
        (reportCurrentPage - 1) * reportItemsPerPage,
        reportCurrentPage * reportItemsPerPage
    );

    // Reset report page when filters change
    useEffect(() => {
        setReportCurrentPage(1);
    }, [searchQuery, startDate, endDate]);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader
              title={t('inventoryReport.title') || 'Stock Movement Report'}
              description={<>Manage and track your inventory stock levels and history details</>}
              actions={
                <>
                  <button
                      onClick={handleExportPdf}
                      disabled={loading || isGeneratingPdf}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                      {isGeneratingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText size={14} />}
                      PDF
                  </button>
                  <button
                      onClick={handleExportExcel}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                      <FileText size={14} />
                      Excel
                  </button>
                </>
              }
            />

            {/* Tabs */}
            <div className="flex border-b border-border bg-card rounded-t-xl px-4">
                <button
                    className={`px-5 py-3 font-semibold text-sm transition-colors border-b-2 ${activeTab === 'report' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('report')}
                >
                    <div className="flex items-center gap-2">
                        <Package size={16} />
                        Stock Summary
                    </div>
                </button>
                <button
                    className={`px-5 py-3 font-semibold text-sm transition-colors border-b-2 ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('history')}
                >
                    <div className="flex items-center gap-2">
                        <History size={16} />
                        Detailed History
                    </div>
                </button>
            </div>

            {/* Filters */}
            <div className="bg-card p-4 rounded-b-xl border border-t-0 border-border shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Start Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring/20 focus:border-primary dark:text-white text-sm focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">End Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring/20 focus:border-primary dark:text-white text-sm focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Search Product</label>
                        <div className="relative group">
                            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                                searchQuery ? 'text-primary' : 'text-muted-foreground group-focus-within:text-primary'
                            }`} size={15} />
                            <input
                                type="text"
                                placeholder="Search by name or batch..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-9 pr-9 py-2 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary text-sm ${
                                    theme === "dark" 
                                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500" 
                                        : "bg-card border-border text-foreground placeholder-gray-400 hover:border-border shadow-sm"
                                }`}
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-danger transition-colors"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                    </div>
                    {activeTab === 'history' && (
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Movement Type</label>
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                                <select
                                    value={movementType}
                                    onChange={(e) => setMovementType(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring/20 focus:border-primary bg-card dark:text-white appearance-none text-sm focus:outline-none"
                                >
                                    <option value="ALL">All Types</option>
                                    <option value="SALE">Sales</option>
                                    <option value="PURCHASE">Purchases</option>
                                    <option value="RETURN">Returns</option>
                                    <option value="ADJUSTMENT">Adjustments</option>
                                    <option value="DAMAGE">Damage</option>
                                    <option value="EXPIRED">Expired</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Cards (Report Tab) */}
            {activeTab === 'report' && summary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                        {
                            label: 'Opening Stock',
                            value: summary.totalOpening.toLocaleString(),
                            icon: Package,
                            light: 'bg-surface-subtle',
                            text: 'text-muted-foreground',
                        },
                        {
                            label: 'Total Stock In',
                            value: `+${summary.totalIn.toLocaleString()}`,
                            icon: ArrowUpRight,
                            light: 'bg-success/10 dark:bg-success/20',
                            text: 'text-success dark:text-green-400',
                        },
                        {
                            label: 'Total Stock Out',
                            value: `-${summary.totalOut.toLocaleString()}`,
                            icon: ArrowDownRight,
                            light: 'bg-danger/10 dark:bg-danger/20',
                            text: 'text-danger dark:text-red-400',
                        },
                        {
                            label: 'Closing Stock',
                            value: summary.totalClosing.toLocaleString(),
                            icon: Package,
                            light: 'bg-indigo-500/10 dark:bg-indigo-900/20',
                            text: 'text-indigo-600 dark:text-indigo-400',
                        },
                        {
                            label: 'Inventory Value',
                            value: formatCurrency(summary.totalValue),
                            icon: DollarSign,
                            light: 'bg-primary/10',
                            text: 'text-primary',
                        },
                    ].map(({ label, value, icon: Icon, light, text }) => (
                        <div
                            key={label}
                            className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4"
                        >
                            <div className={`flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0 ${light}`}>
                                <Icon className={`h-5 w-5 ${text}`} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Content Table */}
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                {loading ? (
                    <div className="p-6">
                        <TableSkeleton rows={10} columns={activeTab === 'report' ? 9 : 8} />
                    </div>
                    ) : error ? (
                        <div className="p-8 text-center text-danger">{error}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            {activeTab === 'report' ? (
                                <table className="w-full">
                                    <thead className="bg-surface-subtle">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product ID</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('inventory.product')}</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opening</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock In</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock Out</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Closing</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Price</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {paginatedReport.map((item) => (
                                            <tr key={item.productId} className="hover:bg-muted transition-colors">
                                                <td className="px-6 py-4 text-xs font-medium text-muted-foreground font-mono">{item.productId}</td>
                                                <td className="px-6 py-4 text-sm font-medium text-foreground capitalize">{item.productName}</td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground">{item.batchNumber || 'N/A'}</td>
                                                <td className="px-6 py-4 text-sm text-right text-muted-foreground dark:text-white">{item.openingStock.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right text-success">+{item.stockIn.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right text-danger">-{item.stockOut.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right font-semibold text-foreground">{item.closingStock.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                                                <td className="px-6 py-4 text-sm text-right font-semibold text-primary">{formatCurrency(item.stockValue)}</td>
                                            </tr>
                                        ))}
                                        {/* Totals Row */}
                                        {paginatedReport.length > 0 && summary && (
                                            <tr className="bg-surface-subtle border-t-2 border-border font-semibold">
                                                <td colSpan={3} className="px-6 py-4 text-sm font-bold text-foreground">TOTAL</td>
                                                <td className="px-6 py-4 text-sm text-right font-bold text-foreground">{summary.totalOpening.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right font-bold text-success">+{summary.totalIn.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right font-bold text-danger">-{summary.totalOut.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right font-bold text-foreground">{summary.totalClosing.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-right text-muted-foreground">—</td>
                                                <td className="px-6 py-4 text-sm text-right font-bold text-primary">{formatCurrency(summary.totalValue)}</td>
                                            </tr>
                                        )}
                                        {paginatedReport.length === 0 && (
                                            <tr>
                                                <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">No products found for the selected filters.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full">
                                    <thead className="bg-surface-subtle">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date & Time</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product ID</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quantity</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prev</th>
                                            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">New</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {historyData.map((item) => (
                                            <tr key={item.id} className="hover:bg-muted transition-colors">
                                                <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                                                    {new Date(item.createdAt).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-xs font-medium text-muted-foreground font-mono">
                                                    {item.productId}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-foreground">
                                                    {item.product.name}
                                                    <div className="text-xs text-muted-foreground">{item.product.batchNumber || 'No Batch'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${item.quantity > 0 ? 'bg-success/15 text-success dark:bg-success/30' : 'bg-danger/15 text-danger dark:bg-danger/30'
                                                        }`}>
                                                        {item.movementType}
                                                    </span>
                                                </td>
                                                <td className={`px-6 py-4 text-sm text-right font-semibold ${item.direction === 'IN' ? 'text-success' : 'text-danger'}`}>
                                                    {item.direction === 'IN' ? '+' : '-'}{item.quantity}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-right text-muted-foreground">{item.previousStock}</td>
                                                <td className="px-6 py-4 text-sm text-right font-semibold text-foreground">{item.newStock}</td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground dark:text-white">{item.user.name}</td>
                                            </tr>
                                        ))}
                                        {historyData.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">No stock movements found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>

                {/* Pagination (Report Tab) */}
                {activeTab === 'report' && !loading && filteredReport.length > 0 && (
                    <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-muted-foreground">
                                Showing {((reportCurrentPage - 1) * reportItemsPerPage) + 1}-{Math.min(reportCurrentPage * reportItemsPerPage, filteredReport.length)} of {filteredReport.length} {filteredReport.length === 1 ? 'product' : 'products'}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground whitespace-nowrap">Items per page:</span>
                                <select
                                    className="border border-border rounded-lg px-2 py-1 text-sm bg-card dark:text-white"
                                    value={reportItemsPerPage}
                                    onChange={(e) => {
                                        setReportItemsPerPage(Number(e.target.value));
                                        setReportCurrentPage(1);
                                    }}
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>
                        {reportTotalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={reportCurrentPage === 1}
                                    onClick={() => setReportCurrentPage(prev => Math.max(1, prev - 1))}
                                    className="px-4 py-2 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted dark:text-white transition-colors"
                                >
                                    Previous
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, reportTotalPages) }, (_, i) => {
                                        let pageNum;
                                        if (reportTotalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (reportCurrentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (reportCurrentPage >= reportTotalPages - 2) {
                                            pageNum = reportTotalPages - 4 + i;
                                        } else {
                                            pageNum = reportCurrentPage - 2 + i;
                                        }
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setReportCurrentPage(pageNum)}
                                                className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                                                    reportCurrentPage === pageNum
                                                        ? 'bg-primary text-white border-primary'
                                                        : 'border-border hover:bg-muted dark:text-white'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    disabled={reportCurrentPage === reportTotalPages}
                                    onClick={() => setReportCurrentPage(prev => Math.min(reportTotalPages, prev + 1))}
                                    className="px-4 py-2 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted dark:text-white transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Pagination (History Tab) */}
                {activeTab === 'history' && !loading && (
                    <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-lg border border-border shadow-sm">
                        <div className="text-sm text-muted-foreground">
                            {pagination.totalItems > 0 ? (
                                <>
                                    Showing {((pagination.currentPage - 1) * 20) + 1}-{Math.min(pagination.currentPage * 20, pagination.totalItems)} of {pagination.totalItems} {pagination.totalItems === 1 ? 'movement' : 'movements'}
                                </>
                            ) : (
                                t('reports.noMovementsFound')
                            )}
                        </div>
                        {pagination.totalPages > 1 ? (
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={pagination.currentPage === 1}
                                    onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
                                    className="px-4 py-2 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted dark:text-white transition-colors"
                                >
                                    Previous
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (pagination.totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (pagination.currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (pagination.currentPage >= pagination.totalPages - 2) {
                                            pageNum = pagination.totalPages - 4 + i;
                                        } else {
                                            pageNum = pagination.currentPage - 2 + i;
                                        }
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setPagination(p => ({ ...p, currentPage: pageNum }))}
                                                className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                                                    pagination.currentPage === pageNum
                                                        ? 'bg-primary text-white border-primary'
                                                        : 'border-border hover:bg-muted dark:text-white'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    disabled={pagination.currentPage === pagination.totalPages}
                                    onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
                                    className="px-4 py-2 border border-border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted dark:text-white transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        ) : pagination.totalItems > 0 ? (
                            <div className="text-sm text-muted-foreground">
                                All {pagination.totalItems} {pagination.totalItems === 1 ? 'movement' : 'movements'} shown
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
    );
};
