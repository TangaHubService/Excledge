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
            case 'critical': return 'text-red-600 bg-red-100';
            case 'low': return 'text-orange-600 bg-orange-100';
            case 'high': return 'text-blue-600 bg-blue-100';
            case 'normal':
            default: return 'text-green-600 bg-green-100';
        }
    };


    if (loading) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden dark:bg-gray-900 dark:border-gray-700">
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
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                                {t('inventoryReport.errorLoading')}
                            </h3>
                            <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                                <p>{error}</p>
                            </div>
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={() => setLoading(true)}
                                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/40"
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('inventoryReport.totalValue')}</p>
                                    <p className="text-lg font-normal text-gray-900 dark:text-white">{summary.totalValue.toLocaleString()} Frw</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('inventoryReport.totalItems')}</p>
                                    <p className="text-lg font-normal text-gray-900 dark:text-white">{summary.totalItems}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
                                    <AlertTriangle size={20} />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('inventoryReport.lowStockItems')}</p>
                                    <p className="text-lg font-normal text-gray-900 dark:text-white">{summary.lowStockItems}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
                                    <AlertTriangle size={20} />
                                </div>
                                <div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('inventoryReport.criticalStockItems')}</p>
                                    <p className="text-lg font-normal text-gray-900 dark:text-white">{summary.criticalItems}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex flex-col md:flex-row justify-between gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-grow">
                            <div className="relative dark:border-gray-700">
                                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    placeholder={t('inventoryReport.searchPlaceholder')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-transparent focus:ring-0 dark:bg-gray-700 dark:border-gray-700 dark:text-gray-200"
                                />
                            </div>

                            <div>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-700 dark:text-gray-200"
                                >
                                    <option value="all" className="dark:text-gray-200 dark:bg-gray-700">{t('inventoryReport.allCategories')}</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat} className="dark:text-gray-200 dark:bg-gray-700">{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-700 dark:text-gray-200"
                                >
                                    <option value="all" className="dark:text-gray-200 dark:bg-gray-700">{t('inventoryReport.allStatus')}</option>
                                    <option value="critical" className="dark:text-gray-200 dark:bg-gray-700">{t('inventoryReport.criticalStock')}</option>
                                    <option value="low" className="dark:text-gray-200 dark:bg-gray-700">{t('inventoryReport.lowStock')}</option>
                                    <option value="normal" className="dark:text-gray-200 dark:bg-gray-700">{t('inventoryReport.normalStock')}</option>
                                    <option value="high" className="dark:text-gray-200 dark:bg-gray-700">{t('inventoryReport.highStock')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => exportToExcel()}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                            >
                                <Download size={14} />
                                Excel
                            </button>
                            <button
                                onClick={exportToPdf}
                                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                            >
                                <Download size={14} />
                                PDF
                            </button>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                <tr>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">ID</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">{t('inventory.product')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">{t('cashFlowReport.category')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('inventoryReport.prev')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('inventoryReport.currentStock')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('inventory.minStock')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('inventory.maxStock')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('inventoryReport.change')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('common.status')}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">{t('inventoryReport.value')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedInventory.map((item: any) => {
                                    const stockChange = getStockChange(item);
                                    const status = getStockStatus(item);
                                    const stockValue = item.currentStock * item.unitPrice;

                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition border-b border-gray-100 dark:border-gray-700">
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <div className="text-xs font-mono text-gray-600 dark:text-gray-400">{item.id}</div>
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <div className="font-medium text-sm text-gray-900 dark:text-white">{item.product}</div>
                                            </td>
                                            <td className="py-3 px-4 text-left whitespace-nowrap">
                                                <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <div className="text-sm font-normal text-gray-900 dark:text-white">{item.previousStock.toLocaleString()}</div>
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <div className="text-sm font-normal text-gray-900 dark:text-white">{item.currentStock.toLocaleString()}</div>
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <div className="text-sm font-normal text-gray-600 dark:text-gray-300">{item.minStock.toLocaleString()}</div>
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <div className="text-sm font-normal text-gray-600 dark:text-gray-300">{item.maxStock.toLocaleString()}</div>
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                <div className={`flex items-center justify-center gap-1 ${stockChange > 0 ? 'text-green-600 dark:text-green-400' : stockChange < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'
                                                    }`}>
                                                    {stockChange > 0 ? (
                                                        <TrendingUp size={14} />
                                                    ) : stockChange < 0 ? (
                                                        <TrendingDown size={14} />
                                                    ) : null}
                                                    <span className="font-normal text-sm">
                                                        {stockChange > 0 ? '+' : ''}{stockChange}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${getStatusColor(status)}`}>
                                                    {status === 'critical' && <AlertTriangle size={12} />}
                                                    {t(`inventoryReport.${status === 'in-stock' ? 'inStock' : status === 'out-of-stock' ? 'outOfStock' : status === 'critical' ? 'criticalStock' : status === 'low' ? 'lowStock' : status === 'overstocked' ? 'overstocked' : status + 'Stock'}`)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <div className="font-normal text-sm text-gray-900 dark:text-white">{stockValue.toLocaleString()}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Frw</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-gray-100 dark:bg-gray-800 font-semibold border-t-2 border-gray-300 dark:border-gray-600">
                                <tr>
                                    <td className="py-3 px-4 text-left text-sm text-gray-900 dark:text-white" colSpan={3}>
                                        {t('common.total').toUpperCase()}
                                    </td>
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <div className="text-sm font-normal text-gray-900 dark:text-white">
                                            {filteredInventory.reduce((sum, item) => sum + item.previousStock, 0).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <div className="text-sm font-normal text-gray-900 dark:text-white">
                                            {filteredInventory.reduce((sum, item) => sum + item.currentStock, 0).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <div className="text-sm font-normal text-gray-900 dark:text-white">
                                            {filteredInventory.reduce((sum, item) => sum + item.minStock, 0).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <div className="text-sm font-normal text-gray-900 dark:text-white">
                                            {filteredInventory.reduce((sum, item) => sum + item.maxStock, 0).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4" colSpan={1}></td>
                                    <td className="py-3 px-4" colSpan={1}></td>
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                        <div className="text-sm font-normal text-blue-600 dark:text-blue-400">
                                            {filteredInventory.reduce((sum, item) => sum + (item.currentStock * item.unitPrice), 0).toLocaleString()}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">Frw</div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {totalPages > 1 && (
                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm gap-4">
                        <div className="flex items-center gap-6 w-full sm:w-auto justify-between">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                {t('common.showing')} <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredInventory.length)}</span> of <span className="font-medium">{filteredInventory.length}</span> {t('inventoryReport.results').toLowerCase()}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('common.rowsPerPage')}:</span>
                                <select
                                    className="border rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 dark:border-gray-600"
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
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('common.previous')}
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('common.next')}
                            </button>
                        </div>
                    </div>
                )}


                {selectedProduct && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 dark:bg-gray-700 dark:bg-opacity-50 dark:text-gray-200">
                        <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden dark:bg-gray-700 dark:border-gray-700 dark:text-gray-200">
                            <div className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-2xl font-bold">{selectedProduct.product}</h2>
                                        <p className="text-gray-600 dark:text-gray-200">SKU: {selectedProduct.sku}</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="text-gray-600 dark:text-gray-200 hover:bg-gray-100 hover:bg-gray-400 border border-gray-200 dark:border-gray-200 rounded-full p-2 transition"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)] dark:text-gray-200">
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-600">
                                        <p className="text-sm text-gray-600 dark:text-gray-200">{t('inventoryReport.currentStock')}</p>
                                        <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{selectedProduct.currentStock}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-600">
                                        <p className="text-sm text-gray-600 dark:text-gray-200">{t('inventoryReport.lastRestocked')}</p>
                                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{selectedProduct.lastRestocked}</p>
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 dark:text-gray-200">
                                    <Clock size={20} />
                                    {t('inventoryReport.stockMovement')}
                                </h3>

                                <div className="space-y-3">
                                    {selectedProduct.changes.map((change: any, idx) => (
                                        <div key={idx} className="border border-gray-200 dark:border-gray-600 dark:text-gray-200 rounded-lg p-4 hover:shadow-md transition">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{change.date}</span>
                                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${change.type === 'restock' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {change.type === 'restock' ? t('inventoryReport.restock') : t('inventoryReport.sale')}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-gray-600 dark:text-gray-200">{change.note}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-lg font-bold ${change.quantity > 0 ? 'text-green-600' : 'text-red-600'
                                                        }`}>
                                                        {change.quantity > 0 ? '+' : ''}{change.quantity}
                                                    </p>
                                                    <p className="text-sm text-gray-500 dark:text-gray-200">{t('inventoryReport.newStock')}: {change.newStock}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
