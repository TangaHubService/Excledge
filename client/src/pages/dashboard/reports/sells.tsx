import { useState, useEffect, useMemo } from 'react';
import { Calendar, TrendingUp, Package, DollarSign, FileText, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { jsPDF as JsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { useBranch } from '../../../context/BranchContext';
import { useDebounce } from '../../../hooks/use-debounce';
import { useSales } from '../../../hooks/useSales';

interface SalesTransaction {
    id: number; // Sale Item ID
    saleId: number; // Sale/Transaction ID
    productId: number; // Product ID
    sellerId: number; // Seller/User ID
    date: string;
    product: string;
    category: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status: 'COMPLETED' | 'REFUNDED' | 'CANCELLED' | 'PARTIALLY_REFUNDED';
    seller?: string; // Added seller name
    sellerEmail?: string;
}



export const SalesReport = () => {
    const { t } = useTranslation();
    const { selectedBranchId } = useBranch();

    // Date filter state - default to date range
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1); // Default to last month
        return date.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    // Additional filter state
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedSeller, setSelectedSeller] = useState<number | 'all'>('all');
    const [productSearch, setProductSearch] = useState('');
    const debouncedSearch = useDebounce(productSearch, 500);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const salesFilters = useMemo(() => ({
        startDate,
        endDate,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        sellerId: selectedSeller === 'all' ? undefined : selectedSeller.toString(),
        product: debouncedSearch,
        page: currentPage,
        limit: itemsPerPage,
        branchId: selectedBranchId
    }), [startDate, endDate, selectedCategory, selectedSeller, debouncedSearch, currentPage, itemsPerPage, selectedBranchId]);

    const { data, isLoading, isError, error: queryError } = useSales(salesFilters);

    // Filter options from API
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [availableSellers, setAvailableSellers] = useState<Array<{ id: number, name: string, email: string }>>([]);

    const transactions = useMemo(() => data?.transactions || [], [data]);
    const totalItems = data?.totalItems || transactions.length;

    useEffect(() => {
        if (data?.filters) {
            setAvailableCategories(data.filters.categories || []);
            setAvailableSellers(data.filters.sellers || []);
        }
    }, [data]);

    const summary = useMemo(() => {
        const totalSales = transactions.reduce((sum: number, t: SalesTransaction) => {
            return sum + (t.status === 'REFUNDED' ? -t.total : t.total);
        }, 0);

        const totalQuantity = transactions.reduce((sum: number, t: SalesTransaction) => {
            return sum + (t.status === 'REFUNDED' ? -t.quantity : t.quantity);
        }, 0);

        const uniqueSaleIds = new Set(transactions.map((t: SalesTransaction) => t.saleId)).size;

        return {
            totalSales,
            totalQuantity,
            totalTransactions: uniqueSaleIds,
            avgTransaction: uniqueSaleIds > 0 ? totalSales / uniqueSaleIds : 0
        };
    }, [transactions]);

    const error = isError ? (queryError as any)?.message || 'Failed to load sales data' : null;

    const exportToPdf = async (data: any[], columns: any[], fileName: string, title: string, footer?: any[][]) => {
        try {
            setIsGeneratingPdf(true);
            const doc = new jsPDF('landscape') as JsPDF & { autoTable: (options: UserOptions) => void };
            const date = new Date().toLocaleDateString();

            // Add title and date
            doc.setFontSize(18);
            doc.text(title, 14, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated on: ${date}`, 14, 28);

            // Prepare table data with proper formatting
            const tableData = data.map(row => {
                const rowData: Record<string, any> = {};
                columns.forEach(col => {
                    const value = row[col.key];
                    // Convert all values to strings and format numbers
                    if (value !== null && value !== undefined) {
                        if (typeof value === 'number') {
                            rowData[col.key] = value.toLocaleString('en-US');
                        } else if (col.key.toLowerCase().includes('price') || col.key.toLowerCase().includes('total')) {
                            // Handle already formatted strings
                            rowData[col.key] = value.toString();
                        } else {
                            rowData[col.key] = value.toString();
                        }
                    } else {
                        rowData[col.key] = '';
                    }
                });
                return rowData;
            });

            // Add the data table
            autoTable(doc, {
                head: [columns.map(col => col.header)],
                body: tableData.map(row =>
                    columns.map(col => row[col.key])
                ),
                foot: footer,
                startY: 35,
                styles: {
                    fontSize: 9,
                    cellPadding: 2,
                    overflow: 'linebreak',
                    cellWidth: 'wrap',
                    valign: 'middle',
                    halign: 'left',
                },
                headStyles: {
                    fillColor: [41, 128, 185],
                    textColor: 255,
                    fontStyle: 'bold',
                },
                footStyles: {
                    fillColor: [240, 240, 240],
                    textColor: 0,
                    fontStyle: 'bold',
                },
                columnStyles: {
                    // Right-align numeric columns
                    'Quantity': { halign: 'right' },
                    'Total Sales (RWF)': { halign: 'right' },
                    'Unit Price (RWF)': { halign: 'right' },
                    'Total (RWF)': { halign: 'right' },
                },
                alternateRowStyles: {
                    fillColor: [245, 245, 245]
                },
            });

            // Add page numbers
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text(
                    `Page ${i} of ${pageCount}`,
                    doc.internal.pageSize.width - 30,
                    doc.internal.pageSize.height - 10
                );
            }

            doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const exportToExcel = (data: any[], sheetName: string, fileName: string) => {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // Auto-size columns
        const wscols = [
            { wch: 20 }, // Date/Product
            { wch: 20 }, // Category
            { wch: 15 }, // Quantity
            { wch: 15 }, // Unit Price/Total
            { wch: 15 }, // Total (for transactions)
        ];
        worksheet['!cols'] = wscols;

        XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    /* const exportToCSV = (data: any[], fileName: string) => {
        const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data));
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }; */


    const exportTransactionDetails = (format: 'excel' | 'pdf' = 'excel') => {
        const baseData = transactions.map((transaction: SalesTransaction) => {
            const isRefunded = transaction.status === 'REFUNDED';
            const amountMultiplier = isRefunded ? -1 : 1;

            return {
                [t('salesReport.saleId')]: transaction.saleId,
                [t('common.date')]: new Date(transaction.date).toLocaleDateString(),
                [t('inventory.product')]: transaction.product,
                [t('cashFlowReport.category')]: transaction.category,
                [t('salesReport.seller')]: transaction.seller || 'N/A',
                [t('common.quantity')]: isRefunded ? -transaction.quantity : transaction.quantity,
                [t('salesReport.unitPrice')]: transaction.unitPrice,
                [`${t('salesReport.unitPrice')} (RWF)`]: formatCurrency(transaction.unitPrice).replace('RWF', '').trim(),
                [t('common.total')]: transaction.total * amountMultiplier,
                [`${t('common.total')} (RWF)`]: formatCurrency(transaction.total * amountMultiplier).replace('RWF', '').trim(),
                [t('common.status')]: t(`salesReport.${transaction.status.toLowerCase()}`)
            };
        });

        if (format === 'excel') {
            exportToExcel(baseData, 'Sales Report', 'sales_report');
        } else if (format === 'pdf') {
            const pdfData = transactions.map((transaction: SalesTransaction) => {
                const isRefunded = transaction.status === 'REFUNDED';
                const amountMultiplier = isRefunded ? -1 : 1;

                return {
                    'SaleID': transaction.saleId,
                    'Date': new Date(transaction.date).toLocaleDateString(),
                    'Product': transaction.product,
                    'Category': transaction.category,
                    'Seller': transaction.seller || 'N/A',
                    'Quantity': (isRefunded ? '-' : '') + (transaction.quantity * amountMultiplier).toString(),
                    'UnitPrice': (isRefunded ? '-' : '') + formatCurrency(transaction.unitPrice * amountMultiplier).replace('RWF', '').trim(),
                    'Total': (isRefunded ? '-' : '') + formatCurrency(transaction.total * amountMultiplier).replace('RWF', '').trim(),
                    'Status': t(`salesReport.${transaction.status.toLowerCase()}`)
                };
            });

            const columns = [
                { header: t('salesReport.saleId'), key: 'SaleID' },
                { header: t('common.date'), key: 'Date' },
                { header: t('inventory.product'), key: 'Product' },
                { header: t('cashFlowReport.category'), key: 'Category' },
                { header: t('salesReport.seller'), key: 'Seller' },
                { header: t('common.quantity'), key: 'Quantity' },
                { header: `${t('salesReport.unitPrice')} (RWF)`, key: 'UnitPrice' },
                { header: `${t('common.total')} (RWF)`, key: 'Total' },
                { header: t('common.status'), key: 'Status' },
            ];

            const totalQuantity = transactions.reduce((sum: number, t: SalesTransaction) => sum + (t.status === 'REFUNDED' ? -t.quantity : t.quantity), 0);
            const totalSales = transactions.reduce((sum: number, t: SalesTransaction) => sum + (t.status === 'REFUNDED' ? -t.total : t.total), 0);

            const footer = [[
                t('common.total').toUpperCase(),
                '',
                '',
                '',
                '',
                totalQuantity.toLocaleString(),
                '',
                formatCurrency(totalSales).replace('RWF', '').trim(),
                ''
            ]];

            exportToPdf(pdfData, columns, 'sales_report', t('salesReport.transactionDetails'), footer);
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

    if (isLoading) {
        return (
            <div className="min-h-screen dark:bg-gray-900 p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mb-6 animate-pulse"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3 animate-pulse"></div>
                                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <TableSkeleton rows={5} columns={6} className="rounded-t-lg" />
                    </div>
                    <div className="mt-6 flex justify-between items-center">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse"></div>
                        <div className="flex space-x-2">
                            <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                            <div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen dark:bg-gray-900 p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen dark:bg-gray-900 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}

                <h1 className="text-xl md:text-xl font-semibold text-gray-800 dark:text-white py-4">{t('salesReport.title')}</h1>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 dark:bg-gray-900">
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{t('salesReport.totalSales')}</p>
                                <p className="text-xl font-semibold text-gray-800 dark:text-white mt-1">{formatCurrency(summary.totalSales)}</p>
                            </div>
                            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-full">
                                <DollarSign className="text-green-600 dark:text-green-400" size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{t('salesReport.totalItemsSold')}</p>
                                <p className="text-xl font-semibold text-gray-800 dark:text-white mt-1">{summary.totalQuantity.toLocaleString()}</p>
                            </div>
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                                <Package className="text-blue-600 dark:text-blue-400" size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{t('salesReport.totalTransactions')}</p>
                                <p className="text-xl font-semibold text-gray-800 dark:text-white mt-1">{summary.totalTransactions.toLocaleString()}</p>
                            </div>
                            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-full">
                                <Calendar className="text-purple-600 dark:text-purple-400" size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{t('salesReport.avgTransaction')}</p>
                                <p className="text-xl font-semibold text-gray-800 dark:text-white mt-1">{formatCurrency(summary.avgTransaction)}</p>
                            </div>
                            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-full">
                                <TrendingUp className="text-orange-600 dark:text-orange-400" size={20} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter Controls - All on one line */}
                <div className="flex flex-wrap items-end gap-3 mb-4">
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-normal text-gray-700 mb-1.5 dark:text-white">{t('common.startDate')}</label>
                        <input
                            type="date"
                            value={startDate}
                            max={endDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-normal text-gray-700 mb-1.5 dark:text-white">{t('common.endDate')}</label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-normal text-gray-700 mb-1.5 dark:text-white">{t('cashFlowReport.category')}</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
                        >
                            <option value="all">{t('common.all')}</option>
                            {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-normal text-gray-700 mb-1.5 dark:text-white">{t('salesReport.seller')}</label>
                        <select
                            value={selectedSeller}
                            onChange={(e) => setSelectedSeller(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
                        >
                            <option value="all">{t('common.all')}</option>
                            {availableSellers.map(seller => (
                                <option key={seller.id} value={seller.id.toString()}>{seller.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-normal text-gray-700 mb-1.5 dark:text-white">{t('inventory.product')}</label>
                        <input
                            type="text"
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder={t('common.search')}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    {(selectedCategory !== 'all' || selectedSeller !== 'all' || productSearch) && (
                        <div>
                            <button
                                onClick={() => {
                                    setSelectedCategory('all');
                                    setSelectedSeller('all');
                                    setProductSearch('');
                                    setCurrentPage(1);
                                }}
                                className="px-4 py-2 text-sm font-normal text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                            >
                                {t('common.clearFilters')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Unified Sales Report Table */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{t('salesReport.transactionDetails')}</h2>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} {t('inventoryReport.history').toLowerCase()}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('common.export')}:</span>
                            <button
                                onClick={() => exportTransactionDetails('pdf')}
                                className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors disabled:bg-red-400 disabled:cursor-not-allowed min-w-[70px] justify-center"
                                disabled={transactions.length === 0 || isGeneratingPdf}
                                title={t('common.download') + " PDF"}
                            >
                                {isGeneratingPdf ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <FileText size={14} />
                                )}
                                {isGeneratingPdf ? t('common.loading') : 'PDF'}
                            </button>
                            <button
                                onClick={() => exportTransactionDetails('excel')}
                                className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                                disabled={transactions.length === 0}
                                title={t('common.download') + " Excel"}
                            >
                                <FileText size={14} />
                                Excel
                            </button>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto -mx-2">
                    {transactions.length > 0 ? (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-gray-50/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('salesReport.saleId')}</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('common.date')}</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('inventory.product')}</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('cashFlowReport.category')}</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('salesReport.seller')}</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('salesReport.qty')}</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('salesReport.unitPrice')}</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('common.total')}</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('common.status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {transactions.map((transaction: SalesTransaction) => (
                                    <tr key={transaction.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm font-mono whitespace-nowrap">
                                            #{transaction.saleId}
                                        </td>
                                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300 text-sm whitespace-nowrap">
                                            {new Date(transaction.date).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 px-4 text-gray-900 dark:text-white text-sm font-medium whitespace-nowrap">{transaction.product}</td>
                                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm capitalize whitespace-nowrap">{transaction.category.toLowerCase()}</td>
                                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm whitespace-nowrap">{transaction.seller || 'N/A'}</td>
                                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300 text-sm whitespace-nowrap">{transaction.quantity}</td>
                                        <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400 text-sm whitespace-nowrap">{formatCurrency(transaction.unitPrice)}</td>
                                        <td className={`py-3 px-4 text-right font-medium text-sm whitespace-nowrap ${transaction.status === 'REFUNDED' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                            {transaction.status === 'REFUNDED' ? '-' : ''}{formatCurrency(transaction.total)}
                                        </td>
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${transaction.status === 'COMPLETED'
                                                ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 border border-green-200 dark:border-green-500/20'
                                                : transaction.status === 'REFUNDED'
                                                    ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                                                    : transaction.status === 'PARTIALLY_REFUNDED'
                                                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20'
                                                        : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20'
                                                }`}>
                                                {t(`salesReport.${transaction.status.toLowerCase()}`)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {/* Total Row */}
                                <tr className="bg-gray-50 dark:bg-gray-800/50 font-medium">
                                    <td className="py-3 px-4 text-gray-900 dark:text-white text-sm" colSpan={5}>{t('common.total').toUpperCase()}</td>
                                    <td className="py-3 px-4 text-right text-gray-900 dark:text-white text-sm">
                                        {transactions.reduce((sum: number, t: SalesTransaction) => sum + (t.status === 'REFUNDED' ? -t.quantity : t.quantity), 0).toLocaleString()}
                                    </td>
                                    <td className="py-3 px-4"></td>
                                    <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400 text-sm">
                                        {formatCurrency(transactions.reduce((sum: number, t: SalesTransaction) => sum + (t.status === 'REFUNDED' ? -t.total : t.total), 0))}
                                    </td>
                                    <td className="py-3 px-4"></td>
                                </tr>
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            {t('salesReport.noTransactions')}
                        </div>
                    )}
                </div>

                {/* Pagination Controls */}
                {transactions.length > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-700 dark:text-gray-300">
                                {t('common.itemsPerPage')}:
                            </label>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="border border-gray-300 rounded-lg px-3 py-1 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                {t('common.showing')} {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} {t('common.of')} {totalItems}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700"
                            >
                                {t('common.previous')}
                            </button>
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                {t('common.page')} {currentPage} {t('common.of')} {Math.ceil(totalItems / itemsPerPage)}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalItems / itemsPerPage), prev + 1))}
                                disabled={currentPage >= Math.ceil(totalItems / itemsPerPage)}
                                className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700"
                            >
                                {t('common.next')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};
