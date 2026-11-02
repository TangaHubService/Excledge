import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, AlertTriangle, Search, Clock, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import 'jspdf-autotable';
import { apiClient } from "../../../lib/api-client";
import { useBranch } from '../../../context/BranchContext';
import { useDebounce } from '../../../hooks/use-debounce';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { type ProductsReport } from '../../../types';
import { PageHeader } from "../../../components/common/PageHeader";




export const InventoryReport = () => {
    const { t } = useTranslation();
    const { selectedBranchId } = useBranch();
    const [inventoryData, setInventoryData] = useState<ProductsReport[]>([]);
    const [summary, setSummary] = useState({
        totalValue: 0,
        totalItems: 0,
        criticalItems: 0,
        lowStockItems: 0
    });
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedProduct, setSelectedProduct] = useState<ProductsReport | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const prepareExportData = () => {
        return filteredInventory.map(item => ({
            [t('inventory.product')]: item.product,
            'SKU': item.sku,
            [t('cashFlowReport.category')]: item.category,
            [t('inventoryReport.currentStock')]: item.currentStock,
            [t('inventoryReport.prev')]: item.previousStock,
            [t('inventory.minStock')]: item.minStock,
            [t('inventory.maxStock')]: item.maxStock,
            [t('salesReport.unitPrice')]: item.unitPrice,
            [t('inventoryReport.value')]: (item.currentStock * item.unitPrice).toFixed(2) + ' Frw',
            [t('common.status')]: t(`inventoryReport.${getStockStatus(item) === 'in-stock' ? 'inStock' : getStockStatus(item) === 'out-of-stock' ? 'outOfStock' : getStockStatus(item) === 'critical' ? 'criticalStock' : getStockStatus(item) === 'low' ? 'lowStock' : getStockStatus(item) === 'overstocked' ? 'overstocked' : getStockStatus(item) + 'Stock'}`)
        }));
    };

    const exportToExcel = () => {
        const data: any[] = prepareExportData();

        // Calculate totals
        const totalStock = filteredInventory.reduce((sum, item) => sum + item.currentStock, 0);
        const totalValue = filteredInventory.reduce((sum, item) => sum + (item.currentStock * item.unitPrice), 0);

        // Append totals row
        data.push({
            [t('inventory.product')]: t('common.total').toUpperCase(),
            'SKU': '',
            [t('cashFlowReport.category')]: '',
            [t('inventoryReport.currentStock')]: totalStock,
            [t('inventoryReport.prev')]: '',
            [t('inventory.minStock')]: '',
            [t('inventory.maxStock')]: '',
            [t('salesReport.unitPrice')]: '',
            [t('inventoryReport.value')]: totalValue.toLocaleString() + ' Frw',
            [t('common.status')]: ''
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Report');

        // Auto-size columns
        const wscols = [
            { wch: 25 }, // Product
            { wch: 15 }, // SKU
            { wch: 20 }, // Category
            { wch: 15 }, // Current Stock
            { wch: 15 }, // Previous Stock
            { wch: 12 }, // Min Stock
            { wch: 12 }, // Max Stock
            { wch: 12 }, // Unit Price
            { wch: 15 }, // Stock Value
            { wch: 15 }, // Status
        ];
        worksheet['!cols'] = wscols;

        XLSX.writeFile(workbook, `inventory_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const exportToPdf = () => {
        const data = prepareExportData();
        const doc = new jsPDF('landscape') as jsPDF & { autoTable: (options: UserOptions) => void };
        const date = new Date().toLocaleDateString();

        // Calculate totals
        const totalStock = filteredInventory.reduce((sum, item) => sum + item.currentStock, 0);
        const totalValue = filteredInventory.reduce((sum, item) => sum + (item.currentStock * item.unitPrice), 0);

        // Add title and date
        doc.setFontSize(18);
        doc.text(t('inventoryReport.title'), 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${date}`, 14, 28);

        // Add the data table
        autoTable(doc, {
            head: [[t('inventory.product'), 'SKU', t('cashFlowReport.category'), t('inventoryReport.currentStock'), t('inventory.minStock'), t('inventory.maxStock'), t('salesReport.unitPrice'), t('inventoryReport.value'), t('common.status')]],
            body: data.map(item => [
                item[t('inventory.product')],
                item['SKU'],
                item[t('cashFlowReport.category')],
                item[t('inventoryReport.currentStock')],
                item[t('inventory.minStock')],
                item[t('inventory.maxStock')],
                item[t('salesReport.unitPrice')],
                item[t('inventoryReport.value')],
                item[t('common.status')]
            ]),
            foot: [[
                t('common.total').toUpperCase(),
                '',
                '',
                totalStock,
                '',
                '',
                '',
                totalValue.toLocaleString() + ' Frw',
                ''
            ]],
            startY: 35,
            styles: {
                fontSize: 8,
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
                3: { halign: 'right' }, // Current Stock
                4: { halign: 'right' }, // Min Stock
                5: { halign: 'right' }, // Max Stock
                6: { halign: 'right' }, // Unit Price
                7: { halign: 'right' }, // Stock Value
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            },
        });

        // Save the PDF
        doc.save(`inventory_report_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const getStockStatus = (item: ProductsReport): string => {
        if (item.currentStock <= 0) return 'out-of-stock';
        if (item.currentStock <= item.minStock * 0.3) return 'critical';
        if (item.currentStock <= item.minStock) return 'low';
        if (item.currentStock > item.maxStock) return 'overstocked';
        return 'in-stock';
    };

    useEffect(() => {
        const fetchInventory = async () => {
            try {
                setLoading(true);
                const queryParams: Record<string, string> = {};
                if (debouncedSearchTerm) queryParams.search = debouncedSearchTerm;
                if (filterCategory !== 'all') queryParams.category = filterCategory;
                if (filterStatus !== 'all') queryParams.status = filterStatus;
                if (selectedBranchId !== null) queryParams.branchId = selectedBranchId.toString();

                const response = await apiClient.getInventoryReport(queryParams);


                setInventoryData(response.inventoryData || []);
                setSummary({
                    totalValue: response.summary?.totalValue || 0,
                    totalItems: response.summary?.totalItems || 0,
                    criticalItems: response.summary?.criticalItems || 0,
                    lowStockItems: response.summary?.lowStockItems || 0
                });
                setCategories(response.categories || []);
                setError(null);
            } catch (err) {
                console.error('Error fetching inventory:', err);
                setError(t('inventoryReport.errorLoading'));
            } finally {
                setLoading(false);
            }
        };

        fetchInventory();
    }, [debouncedSearchTerm, filterCategory, filterStatus, selectedBranchId]);

    const filteredInventory = useMemo(() => {
        return inventoryData.filter(item => {
            const matchesSearch = searchTerm === '' ||
                item.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.sku.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCategory = filterCategory === 'all' || item.category === filterCategory;

            const matchesStatus = filterStatus === 'all' ||
                (filterStatus === 'critical' && item.status === 'critical') ||
                (filterStatus === 'low' && (item.status === 'low' || item.status === 'critical')) ||
                (filterStatus === 'normal' && item.status === 'normal') ||
                (filterStatus === 'high' && item.status === 'high');

            return matchesSearch && matchesCategory && matchesStatus;
        });
    }, [inventoryData, searchTerm, filterCategory, filterStatus]);

    const paginatedInventory = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredInventory.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredInventory, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filterCategory, filterStatus]);

    const getStockChange = (item: ProductsReport) => {
        return item.currentStock - item.previousStock;
    };
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'critical': return 'text-danger bg-danger/15';
            case 'low': return 'text-orange-600 bg-orange-500/15';
            case 'high': return 'text-primary bg-primary/15';
            case 'normal':
            default: return 'text-success bg-success/15';
        }
    };


    if (loading) {
        return (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                {loading ? (
                    <TableSkeleton
                        rows={8}
                        columns={8}
                        className="w-full"
                        rowHeight="h-4"
                    />
                ) : (
                    <></>
                )}
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 sm:p-6">
                <div className="bg-danger/10 dark:bg-danger/20 border-l-4 border-red-500 p-4 rounded">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <AlertTriangle className="h-5 w-5 text-danger" />
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-danger dark:text-red-200">
                                {t('inventoryReport.errorLoading')}
                            </h3>
                            <div className="mt-2 text-sm text-danger dark:text-red-300">
                                <p>{error}</p>
                            </div>
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={() => setLoading(true)}
                                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-danger bg-danger/15 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-danger/30 dark:text-red-200 dark:hover:bg-danger/40"
                                >
                                    {t('inventoryReport.tryAgain')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader
              title={t('inventoryReport.title') || 'Inventory Report'}
              description={<>Monitor your stock levels, item values, and identify reorder points</>}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        label: t('inventoryReport.totalValue'),
                        value: `${summary.totalValue.toLocaleString()} Frw`,
                        icon: TrendingUp,
                        light: 'bg-success/10 dark:bg-success/20',
                        text: 'text-success dark:text-emerald-400',
                    },
                    {
                        label: t('inventoryReport.totalItems'),
                        value: summary.totalItems,
                        icon: Clock,
                        light: 'bg-primary/10',
                        text: 'text-primary',
                    },
                    {
                        label: t('inventoryReport.lowStockItems'),
                        value: summary.lowStockItems,
                        icon: AlertTriangle,
                        light: 'bg-orange-500/10 dark:bg-orange-900/20',
                        text: 'text-orange-600 dark:text-orange-400',
                    },
                    {
                        label: t('inventoryReport.criticalStockItems'),
                        value: summary.criticalItems,
                        icon: AlertTriangle,
                        light: 'bg-danger/10 dark:bg-danger/20',
                        text: 'text-danger dark:text-red-400',
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
                            <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter Bar */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                <div className="flex flex-col lg:flex-row justify-between gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-grow">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
                            <input
                                type="text"
                                placeholder={t('inventoryReport.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                                <option value="all">{t('inventoryReport.allCategories')}</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                                <option value="all">{t('inventoryReport.allStatus')}</option>
                                <option value="critical">{t('inventoryReport.criticalStock')}</option>
                                <option value="low">{t('inventoryReport.lowStock')}</option>
                                <option value="normal">{t('inventoryReport.normalStock')}</option>
                                <option value="high">{t('inventoryReport.highStock')}</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => exportToExcel()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-white text-xs font-semibold rounded-lg hover:bg-success/90 transition-colors shadow-xs"
                        >
                            <Download size={13} />
                            Excel
                        </button>
                        <button
                            onClick={exportToPdf}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-danger text-white text-xs font-semibold rounded-lg hover:bg-danger/90 transition-colors shadow-xs"
                        >
                            <Download size={13} />
                            PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Table Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-subtle border-b border-border text-left">
                            <tr>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('inventory.product')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('cashFlowReport.category')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('inventoryReport.prev')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('inventoryReport.currentStock')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('inventory.minStock')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('inventory.maxStock')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">{t('inventoryReport.change')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">{t('common.status')}</th>
                                <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('inventoryReport.value')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {paginatedInventory.map((item: any) => {
                                const stockChange = getStockChange(item);
                                const status = getStockStatus(item);
                                const stockValue = item.currentStock * item.unitPrice;

                                return (
                                    <tr key={item.id} className="hover:bg-surface-subtle/50 transition border-b border-border">
                                        <td className="py-3 px-4 text-xs font-mono text-muted-foreground">#{item.id}</td>
                                        <td className="py-3 px-4 font-semibold text-foreground">{item.product}</td>
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-foreground">{item.previousStock.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right font-semibold text-foreground">{item.currentStock.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-muted-foreground">{item.minStock.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-muted-foreground">{item.maxStock.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-center">
                                            <div className={`flex items-center justify-center gap-1 font-semibold text-xs ${stockChange > 0 ? 'text-success dark:text-green-400' : stockChange < 0 ? 'text-danger dark:text-red-400' : 'text-muted-foreground'}`}>
                                                {stockChange > 0 ? (
                                                    <TrendingUp size={13} />
                                                ) : stockChange < 0 ? (
                                                    <TrendingDown size={13} />
                                                ) : null}
                                                <span>
                                                    {stockChange > 0 ? '+' : ''}{stockChange}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center whitespace-nowrap">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${getStatusColor(status)}`}>
                                                {status === 'critical' && <AlertTriangle size={11} />}
                                                {t(`inventoryReport.${status === 'in-stock' ? 'inStock' : status === 'out-of-stock' ? 'outOfStock' : status === 'critical' ? 'criticalStock' : status === 'low' ? 'lowStock' : status === 'overstocked' ? 'overstocked' : status + 'Stock'}`)}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-foreground font-mono">
                                            {stockValue.toLocaleString()} <span className="text-xxs font-medium text-muted-foreground">RWF</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-surface-subtle/50 font-semibold border-t border-border">
                            <tr className="text-foreground">
                                <td className="py-3 px-4" colSpan={3}>
                                    {t('common.total').toUpperCase()}
                                </td>
                                <td className="py-3 px-4 text-right font-bold">
                                    {filteredInventory.reduce((sum, item) => sum + item.previousStock, 0).toLocaleString()}
                                </td>
                                <td className="py-3 px-4 text-right font-bold">
                                    {filteredInventory.reduce((sum, item) => sum + item.currentStock, 0).toLocaleString()}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    {filteredInventory.reduce((sum, item) => sum + item.minStock, 0).toLocaleString()}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    {filteredInventory.reduce((sum, item) => sum + item.maxStock, 0).toLocaleString()}
                                </td>
                                <td className="py-3 px-4" colSpan={2}></td>
                                <td className="py-3 px-4 text-right font-bold text-primary font-mono">
                                    {filteredInventory.reduce((sum, item) => sum + (item.currentStock * item.unitPrice), 0).toLocaleString()} <span className="text-xxs font-semibold">RWF</span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-card border border-border rounded-xl shadow-xs gap-4">
                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between">
                        <div className="text-sm text-muted-foreground">
                            {t('common.showing')} <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-semibold">{Math.min(currentPage * itemsPerPage, filteredInventory.length)}</span> of <span className="font-semibold">{filteredInventory.length}</span> {t('inventoryReport.results').toLowerCase()}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{t('common.rowsPerPage')}:</span>
                            <select
                                className="border border-border rounded-lg px-2 py-1 text-sm bg-card dark:text-white focus:outline-none"
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                            >
                                {[10, 20, 50, 100].map(size => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 text-sm font-semibold text-foreground bg-card border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {t('common.previous')}
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 text-sm font-semibold text-foreground bg-card border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {t('common.next')}
                        </button>
                    </div>
                </div>
            )}

            {/* Product detail Modal */}
            {selectedProduct && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-card rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden border flex flex-col">
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-foreground">{selectedProduct.product}</h2>
                                <p className="text-sm text-muted-foreground mt-0.5">SKU: {selectedProduct.sku}</p>
                            </div>
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="text-muted-foreground hover:text-muted-foreground text-lg font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-surface-subtle rounded-xl p-4">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('inventoryReport.currentStock')}</p>
                                    <p className="text-2xl font-bold text-foreground mt-1">{selectedProduct.currentStock}</p>
                                </div>
                                <div className="bg-surface-subtle rounded-xl p-4">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('inventoryReport.lastRestocked')}</p>
                                    <p className="text-base font-bold text-foreground mt-1.5">{selectedProduct.lastRestocked}</p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                                    <Clock size={18} />
                                    {t('inventoryReport.stockMovement')}
                                </h3>

                                <div className="space-y-3">
                                    {selectedProduct.changes.map((change: any, idx) => (
                                        <div key={idx} className="border border-border rounded-xl p-4 hover:shadow-xs transition-shadow">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold text-muted-foreground">{change.date}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${change.type === 'restock' ? 'bg-success/10 text-success dark:bg-success/20 dark:text-green-400' : 'bg-danger/10 text-danger dark:bg-danger/20 dark:text-red-400'}`}>
                                                    {change.type === 'restock' ? t('inventoryReport.restock') : t('inventoryReport.sale')}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-4">
                                                <p className="text-sm text-foreground font-medium">{change.note}</p>
                                                <div className="text-right shrink-0">
                                                    <p className={`text-base font-bold ${change.quantity > 0 ? 'text-success dark:text-green-400' : 'text-danger'}`}>
                                                        {change.quantity > 0 ? '+' : ''}{change.quantity}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">{t('inventoryReport.newStock')}: {change.newStock}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
