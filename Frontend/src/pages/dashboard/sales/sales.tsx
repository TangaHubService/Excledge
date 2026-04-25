import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../lib/utils';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Search, Download, Eye, RefreshCw, X } from 'lucide-react';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { toast } from 'react-toastify';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import SalesInvoicePDF, { type PrintableSale as Sale } from '../../../components/invoice/SalesInvoicePDF';
import { useOrganization } from '../../../context/OrganizationContext';
import { useTheme } from '../../../context/ThemeContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'HH:mm');
};

// Helper function to get payment method translation
const getPaymentMethodLabel = (paymentType: string, t: (key: string, options?: Record<string, unknown>) => string): string => {
    if (!paymentType) return '';

    const translationKey = `pos.paymentMethods.${paymentType}`;
    const translated = t(translationKey, { defaultValue: paymentType });

    // If translation returns the key itself or starts with the namespace (not found), use fallback
    if (translated === translationKey || translated.startsWith('pos.paymentMethods.')) {
        // Fallback: format the payment type nicely (e.g., "MIXED" -> "Mixed", "CREDIT_CARD" -> "Credit Card")
        return paymentType
            .split('_')
            .map(word => word.charAt(0) + word.slice(1).toLowerCase())
            .join(' ');
    }
    return translated;
};

// Helper function to get payment methods as an array based on amounts
const getPaymentMethods = (sale: Sale): Array<{ method: string; amount: number }> => {
    const methods: Array<{ method: string; amount: number }> = [];

    if (parseFloat(sale.cashAmount) > 0) {
        methods.push({ method: 'CASH', amount: parseFloat(sale.cashAmount) });
    }
    if (parseFloat(sale.insuranceAmount) > 0) {
        methods.push({ method: 'INSURANCE', amount: parseFloat(sale.insuranceAmount) });
    }
    if (parseFloat(sale.debtAmount) > 0) {
        methods.push({ method: 'DEBT', amount: parseFloat(sale.debtAmount) });
    }

    return methods;
};

function saleFromApiResponse(res: unknown): Sale | null {
    if (!res || typeof res !== 'object') return null;
    const r = res as Record<string, unknown>;
    if (r.success === true && r.data != null && typeof r.data === 'object') {
        return r.data as Sale;
    }
    return res as Sale;
}

export default function SalesPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const { organization } = useOrganization();
    const [sales, setSales] = useState<Sale[]>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
    const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
    const [saleToRefund, setSaleToRefund] = useState<Sale | null>(null);
    const [refundReason, setRefundReason] = useState('');
    const [isRefunding, setIsRefunding] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);

    const limit = 50;

    const fetchSales = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await apiClient.getSales({
                page: currentPage,
                limit,
                search: searchTerm,
                status: statusFilter,
                paymentType: paymentFilter,
                startDate,
                endDate,
            });
            const list = Array.isArray((response as { data?: unknown })?.data)
                ? (response as { data: Sale[] }).data
                : Array.isArray(response)
                  ? (response as Sale[])
                  : [];
            setSales(list);
            const pagination = (response as { pagination?: { totalPages?: number } })?.pagination;
            setTotalPages(
                typeof pagination?.totalPages === 'number' && pagination.totalPages >= 1
                    ? pagination.totalPages
                    : 1
            );
        } catch (error) {
            console.error('Failed to fetch sales:', error);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, searchTerm, statusFilter, paymentFilter, startDate, endDate]);

    useEffect(() => {
        fetchSales();
    }, [fetchSales]);


    const formatCurrency = (amount: string) => {
        return new Intl.NumberFormat('en-RW', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(parseFloat(amount));
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
    };

    const handleViewSale = (saleId: string) => {
        navigate(`/dashboard/sales/${saleId}`);
    };

    const confirmDelete = async () => {
        if (!saleToDelete) return;

        try {
            setIsDeleting(true);
            // TODO: Implement delete API call
            // await apiClient.delete(`/sales/${saleToDelete.id}`);

            // Update local state
            setSales(prevSales => prevSales.filter(sale => sale.id !== saleToDelete.id));
            toast.success(t('messages.deleteSuccess'));
        } catch (error) {
            console.error('Error deleting sale:', error);
            toast.error(t('messages.deleteError'));
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
            setSaleToDelete(null);
        }
    };
    // 3. Add these handler functions
    const handleOpenRefundModal = (sale: Sale) => {
        setSaleToRefund(sale);
        setRefundReason('');
        setIsRefundModalOpen(true);
    };

    const handleRefundSubmit = async () => {
        if (!saleToRefund) return;
        if (!refundReason.trim()) {
            toast.error(t('sales.reasonRequired') || 'Refund reason is required');
            return;
        }

        try {
            setIsRefunding(true);

            // Strict Full Refund: We don't send individual items anymore
            await apiClient.refundSale(saleToRefund.id, {
                reason: refundReason,
            });

            toast.success(t('sales.refundSuccess'));
            await fetchSales();
            setIsRefundModalOpen(false);
        } catch (error: unknown) {
            console.error('Error processing refund:', error);
            const errorMessage = error instanceof Error ? error.message : t('sales.refundError');
            toast.error(errorMessage);
        } finally {
            setIsRefunding(false);
        }
    };

    // Handle invoice download
    const handleDownloadInvoice = async (sale: Sale) => {
        setIsDownloadingInvoice(sale.id);
        try {
            const saleForPdf = {
                ...sale,
                reprintCount: (sale.reprintCount ?? 0) + 1,
            };
            const blob = await pdf(<SalesInvoicePDF
                sale={saleForPdf}
                organizationName={organization?.name}
                organizationLogo={organization?.avatar}
                organizationTin={organization?.TIN ?? organization?.tin}
                organizationAddress={[organization?.address, organization?.city, organization?.country].filter(Boolean).join(', ')}
                organizationPhone={organization?.phone}
                organizationEmail={organization?.email}
                organizationDeviceId={organization?.ebmDeviceId}
                organizationSerialNo={organization?.ebmSerialNo}
            />).toBlob();

            try {
                const response = await apiClient.recordSaleReprint(sale.id);
                const updatedSale = saleFromApiResponse(response);
                if (updatedSale) {
                    setSales((prevSales) =>
                        prevSales.map((currentSale) =>
                            currentSale.id === updatedSale.id ? updatedSale : currentSale
                        )
                    );
                } else {
                    setSales((prevSales) =>
                        prevSales.map((currentSale) =>
                            currentSale.id === sale.id ? saleForPdf : currentSale
                        )
                    );
                }
            } catch (error) {
                console.error('Failed to record sale reprint:', error);
                toast.warn('Receipt copy generated, but reprint tracking could not be updated.');
                setSales((prevSales) =>
                    prevSales.map((currentSale) =>
                        currentSale.id === sale.id ? saleForPdf : currentSale
                    )
                );
            }

            // Download the file
            saveAs(blob, `receipt-${sale.saleNumber}.pdf`);
            toast.success(t('sales.invoiceDownloadSuccess'));
        } catch (error) {
            console.error('Failed to generate invoice:', error);
            toast.error(t('sales.invoiceGenerationError'));
        } finally {
            setIsDownloadingInvoice(null);
        }
    };


    return (
        <div className="space-y-6">
            <div className="dark:bg-background/50 dark:text-gray-100">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('sales.salesHistory')}</h1>
                    <p className="text-muted-foreground">{t('sales.salesHistoryDesc')}</p>
                </div>

                <Card className='border-none'>
                    <CardHeader className="pb-0">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 w-full mb-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">{t('common.startDate')}</Label>
                                    <Input
                                        type="date"
                                        className="h-9 w-40 text-xs"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">{t('common.endDate')}</Label>
                                    <Input
                                        type="date"
                                        className="h-9 w-40 text-xs"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">{t('sales.status')}</Label>
                                    <select
                                        className="h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                    >
                                        <option value="">{t('common.allStatuses') || 'All Statuses'}</option>
                                        <option value="COMPLETED">{t('sales.statuses.COMPLETED')}</option>
                                        <option value="REFUNDED">{t('sales.statuses.REFUNDED')}</option>
                                        <option value="CANCELLED">{t('sales.statuses.CANCELLED')}</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs">{t('sales.table.method')}</Label>
                                    <select
                                        className="h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={paymentFilter}
                                        onChange={(e) => setPaymentFilter(e.target.value)}
                                    >
                                        <option value="">{t('sales.allPaymentMethods')}</option>
                                        <option value="CASH">{t('pos.paymentMethods.CASH')}</option>
                                        <option value="MOBILE_MONEY">{t('pos.paymentMethods.MOBILE_MONEY')}</option>
                                        <option value="INSURANCE">{t('pos.paymentMethods.INSURANCE')}</option>
                                        <option value="DEBT">{t('pos.paymentMethods.DEBT')}</option>
                                        <option value="MIXED">{t('pos.paymentMethods.MIXED')}</option>
                                    </select>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="mt-5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    onClick={() => {
                                        setStartDate('');
                                        setEndDate('');
                                        setStatusFilter('');
                                        setPaymentFilter('');
                                        setSearchTerm('');
                                    }}
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    {t('common.reset') || 'Reset'}
                                </Button>
                            </div>

                            <form onSubmit={handleSearch} className="flex items-center space-x-2 group lg:ml-auto">
                                <div className="relative">
                                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 transition-colors ${searchTerm ? 'text-blue-500' : 'text-muted-foreground group-focus-within:text-blue-500'
                                        }`} />
                                    <Input
                                        type="search"
                                        placeholder={t('sales.searchPlaceholder')}
                                        className="pl-9 pr-9 w-[200px] lg:w-[250px] transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-lg"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    {searchTerm && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </CardHeader>
                    <CardContent className="">
                        {isLoading ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-48 mb-2"></div>
                                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-64"></div>
                                    </div>
                                    <div className="flex space-x-2">
                                        <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-32"></div>
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-md w-64"></div>
                                </div>
                                <TableSkeleton
                                    rows={5}
                                    columns={7}
                                    className="w-full"
                                    rowHeight="h-4"
                                />
                            </div>
                        ) : sales.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">{t('sales.noSalesFound')}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-lg overflow-hidden border border-border/50">
                                    <Table>
                                        <TableHeader className="bg-gray-200 dark:bg-gray-800">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.id') || 'ID'}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.dateTime')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.saleNumber') || 'Sale Number'}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.customer')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.items')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.method')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.paid')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.debt')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.status')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.total')}
                                                </TableHead>
                                                <TableHead className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                                    {t('sales.table.actions')}
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody >
                                            {sales.map((sale) => (
                                                <TableRow
                                                    key={sale.id}
                                                    className="group border-t border-gray-100 dark:border-gray-800 hover:bg-muted/10 dark:hover:bg-muted/20 transition-colors duration-200"
                                                >
                                                    <TableCell className="py-4">
                                                        <button
                                                            onClick={() => handleViewSale(sale.id)}
                                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                                        >
                                                            # {sale.id}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className={`text-sm whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                            {format(new Date(sale.createdAt), 'MMM d, yyyy')} {formatTime(sale.createdAt)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                            {sale.invoiceNumber || sale.saleNumber}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex flex-col">
                                                            <span className={`text-sm font-medium whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                                {sale.customer.name}
                                                            </span>
                                                            {sale.customer.phone && (
                                                                <span className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                                                    {sale.customer.phone}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="space-y-1.5 text-center">
                                                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                                {sale.saleItems.length}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`inline-flex uppercase items-center px-3 py-1 rounded-full text-xs font-medium ${sale.paymentType === 'CASH'
                                                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                                : sale.paymentType === 'INSURANCE'
                                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                                                }`}>
                                                                {getPaymentMethodLabel(sale.paymentType, t)}
                                                            </span>
                                                            {/* Show breakdown for MIXED payments or when multiple methods are used */}
                                                            {(sale.paymentType === 'MIXED' || getPaymentMethods(sale).length > 1) && (
                                                                <div className={`text-xs mt-1 space-y-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                                                    {getPaymentMethods(sale).map((payment, index) => (
                                                                        <div key={index} className="flex justify-between gap-2">
                                                                            <span>{getPaymentMethodLabel(payment.method, t)}:</span>
                                                                            <span className={`font-medium ${payment.method === 'DEBT'
                                                                                ? 'text-amber-600 dark:text-amber-400'
                                                                                : ''
                                                                                }`}>
                                                                                {formatCurrency(payment.amount.toString())}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        {sale.paymentType === 'MIXED' ? (
                                                            <div className="flex flex-col gap-1">
                                                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                                    {formatCurrency(sale.totalAmount)}
                                                                </span>
                                                                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                                                    {t('sales.totalAmount') || 'Total'}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                                {formatCurrency(sale.totalAmount)}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <div className="flex items-center gap-2">
                                                            {parseFloat(sale.debtAmount) > 0 ? (
                                                                <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border border-amber-100 dark:border-amber-900/30">
                                                                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                                                        {formatCurrency(sale.debtAmount)}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className={`text-xs italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                                                    {t('sales.noDebt')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                                                {
                                                                    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100': sale.status === 'COMPLETED',
                                                                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100': sale.status === 'PENDING',
                                                                    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100': sale.status === 'PROCESSING',
                                                                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100': sale.status === 'CANCELLED',
                                                                    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100': sale.status === 'REFUNDED',
                                                                    'bg-purple-100 text-purple-500 dark:bg-purple-600 dark:text-purple-500': sale.status === 'PARTIALLY_REFUNDED',
                                                                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100': !['COMPLETED', 'PENDING', 'PROCESSING', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(sale.status)
                                                                }
                                                            )}
                                                        >
                                                            {t(`sales.statuses.${sale.status}`, sale.status)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-4 text-center">
                                                        <span className={`font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-900'}`}>
                                                            {formatCurrency(sale.totalAmount)}
                                                        </span>
                                                    </TableCell>

                                                    <TableCell className="py-4">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleViewSale(sale.id);
                                                                }}
                                                                className={`h-8 px-2 ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300 hover:bg-gray-700' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'}`}
                                                                title={t('sales.viewDetails') || 'View Details'}
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            {sale.status === 'COMPLETED' && (
                                                                <>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDownloadInvoice(sale);
                                                                        }}
                                                                        disabled={isDownloadingInvoice === sale.id}
                                                                        className={`h-8 px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'}`}
                                                                        title={t('sales.downloadInvoice') || 'Download Invoice'}
                                                                    >
                                                                        {isDownloadingInvoice === sale.id ? (
                                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                                        ) : (
                                                                            <Download className="h-4 w-4" />
                                                                        )}
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleOpenRefundModal(sale);
                                                                        }}
                                                                        className={`h-8 px-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 ${theme === 'dark' ? 'hover:bg-amber-900/30' : 'hover:bg-amber-50'}`}
                                                                        title={t('sales.refund') || 'Refund'}
                                                                    >
                                                                        <RefreshCw className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="flex items-center justify-between px-2">
                                    <div className="text-sm text-muted-foreground">
                                        {t('sales.showingPage', { current: currentPage, total: totalPages })}
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-border/30">
                                        <p className="text-sm text-muted-foreground">
                                            {t('sales.showingPage', { current: currentPage, total: totalPages })}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1 || isLoading}
                                                className="h-9 px-3 border-border/50 hover:bg-muted/50"
                                            >
                                                <ChevronLeft className="h-4 w-4 mr-1.5" />
                                                {t('common.prev')}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={true}
                                                className="h-9 w-12 p-0 border-border/50 bg-muted/20"
                                            >
                                                {currentPage}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                                disabled={currentPage === totalPages || isLoading}
                                                className="h-9 px-3 border-border/50 hover:bg-muted/50"
                                            >
                                                {t('common.next')}
                                                <ChevronRight className="h-4 w-4 ml-1.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Refund Modal */}
                <Dialog open={isRefundModalOpen} onOpenChange={setIsRefundModalOpen}>
                    <DialogContent className="sm:max-w-2xl bg-background border-border/50 bg-white dark:bg-[#111827] dark:text-white">
                        <DialogHeader>
                            <DialogTitle>{t('sales.processRefund', { number: saleToRefund?.saleNumber })}</DialogTitle>
                            <DialogDescription>
                                {t('sales.refundDesc')}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-lg">
                                <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                                    {t('sales.fullRefundOnlyNote')}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="refundReason">{t('sales.refundReason')}</Label>
                                <Input
                                    id="refundReason"
                                    placeholder={t('sales.refundReasonPlaceholder')}
                                    value={refundReason}
                                    onChange={(e) => setRefundReason(e.target.value)}
                                    className="focus:ring-amber-500 border-amber-200"
                                />
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead>{t('inventory.product')}</TableHead>
                                            <TableHead className="text-right">{t('inventory.sellingPrice')}</TableHead>
                                            <TableHead className="text-right">{t('sales.sold')}</TableHead>
                                            <TableHead className="text-right">{t('sales.table.total')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {saleToRefund?.saleItems.map((item) => (
                                            <TableRow key={item.id} className="hover:bg-transparent">
                                                <TableCell className="font-medium">{item.product.name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell className="text-right font-semibold">{formatCurrency(item.totalPrice)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg">
                                <span className="font-bold">{t('sales.totalRefund')}:</span>
                                <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                                    {saleToRefund ? formatCurrency(saleToRefund.totalAmount) : ''}
                                </span>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsRefundModalOpen(false)}
                                disabled={isRefunding}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                onClick={handleRefundSubmit}
                                disabled={isRefunding}
                                className="bg-amber-600 hover:bg-amber-700"
                            >
                                {isRefunding ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t('pos.processing')}
                                    </>
                                ) : (
                                    t('sales.refund')
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ConfirmDialog
                    open={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={confirmDelete}
                    title={t('sales.deleteSale') || "Delete Sale"}
                    message={t('sales.deleteConfirm') || "Are you sure you want to delete this sale? This action cannot be undone."}
                    confirmText={t('common.delete') || "Delete"}
                    variant="destructive"
                    loading={isDeleting}
                />
            </div>
        </div>
    );
};
