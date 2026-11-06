import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../context/ThemeContext';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { ArrowLeft, Loader2, Printer, Download, Share2, Copy } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";
import { saveAs } from 'file-saver';
import { getInvoiceFilename, unwrapInvoice } from '../../../lib/invoice';
import {
    canCopyReceipt,
    downloadReceiptCopy,
    issueInvoicePdfBlob,
    printReceiptCopy,
    shareInvoicePdf,
    type InvoicePdfFormat,
} from '../../../lib/invoice-pdf';
import type { SaleEbmTransaction } from '../../../utils/invoiceFiscal';
import { Badge } from '../../../components/ui/badge';

type Sale = {
    id: string;
    saleNumber: string;
    invoiceNumber?: string;
    customer: {
        name: string;
        email?: string;
        phone?: string;
    };
    user: {
        name: string;
    };
    paymentType: string;
    cashAmount: string;
    insuranceAmount: string;
    debtAmount: string;
    totalAmount: string;
    vatAmount?: string;
    taxableAmount?: string;
    createdAt: string;
    status: string;
    rcptLabel?: string | null;
    isProforma?: boolean;
    originalSaleId?: number | null;
    saleItems: Array<{
        id: string;
        product: {
            name: string;
            batchNumber?: string;
        };
        quantity: number;
        unitPrice: string;
        totalPrice: string;
        dcRate?: string | number;
        taxAmount?: string;
        taxCode?: string;
        costPrice?: string;
        profit?: string;
    }>;
    ebmTransactions?: SaleEbmTransaction[];
};

/** GET sale returns success(sale) → { success, data }. */
function saleFromApiResponse(res: unknown): Sale | null {
    if (!res || typeof res !== 'object') return null;
    const r = res as Record<string, unknown>;
    if (r.success === true && r.data != null && typeof r.data === 'object') {
        return r.data as Sale;
    }
    return res as Sale;
}

export default function SaleDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { theme } = useTheme();
    const [sale, setSale] = useState<Sale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
    const [isPrintingInvoice, setIsPrintingInvoice] = useState(false);
    const [isSharingInvoice, setIsSharingInvoice] = useState(false);
    const [isCopying, setIsCopying] = useState<'print' | 'download' | null>(null);
    const [isSendingToPos, setIsSendingToPos] = useState(false);
    // Named distinctly from date-fns's `format` (imported above) to avoid shadowing it.
    const [invoiceFormat, setInvoiceFormat] = useState<InvoicePdfFormat>('A4');

    useEffect(() => {
        if (id) {
            fetchSaleDetails();
        }
    }, [id]);

    const fetchSaleDetails = async () => {
        try {
            setIsLoading(true);
            // Ensure we're using the ID from URL params (should be numeric)
            const saleId = id!;
            const saleData = await apiClient.getSale(saleId);
            setSale(saleFromApiResponse(saleData));
        } catch (error: any) {
            console.error('Failed to fetch sale details:', error);
            toastError(error, t('sales.fetchError') || 'Failed to load sale details');
            navigate('/dashboard/sales');
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: string) => {
        return new Intl.NumberFormat('en-RW', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(parseFloat(amount));
    };

    const formatTime = (dateString: string) => {
        return format(new Date(dateString), 'HH:mm');
    };

    /** CIS/VSDC spec §7.18/§15: "print only one original receipt. */
    const buildInvoicePdfBlob = async () => {
        if (!id) throw new Error('Sale ID is missing');

        const blob = await issueInvoicePdfBlob(id, invoiceFormat);
        const invoice = unwrapInvoice(await apiClient.getInvoice(id, { allowPending: true }));
        if (!invoice) throw new Error('Invoice was not returned by the backend.');
        return { blob, invoice };
    };

    /** CS/CR: explicit copy of this NS/NR receipt with its original VSDC fiscal data. */
    const handleReceiptCopy = async (mode: 'print' | 'download') => {
        if (!id) return;
        setIsCopying(mode);
        try {
            const label = mode === 'print'
                ? await printReceiptCopy(id, invoiceFormat)
                : await downloadReceiptCopy(id, invoiceFormat);
            toast.success(`${label ?? 'Copy'} receipt ${mode === 'print' ? 'sent to the printer' : 'downloaded'}`);
        } catch (error) {
            console.error('Failed to produce receipt copy:', error);
            toastError(error, "Could not produce the receipt copy");
        } finally {
            setIsCopying(null);
        }
    };

    // Helper function to get payment method translation
    const getPaymentMethodLabel = (paymentType: string, t: (key: string, options?: any) => string): string => {
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

    const handleDownloadInvoice = async () => {
        if (!sale) return;

        setIsDownloadingInvoice(true);
        try {
            const { blob, invoice } = await buildInvoicePdfBlob();
            saveAs(blob, getInvoiceFilename(invoice, sale.saleNumber, invoiceFormat));
            toast.success(t('sales.invoiceDownloadSuccess') || 'Invoice downloaded successfully');
        } catch (error) {
            console.error('Failed to generate invoice:', error);
            toast.error(t('sales.invoiceGenerationError') || 'Failed to generate invoice');
        } finally {
            setIsDownloadingInvoice(false);
        }
    };

    const handleSendToPos = async () => {
        if (!id) return;
        setIsSendingToPos(true);
        try {
            const res = await apiClient.enqueuePosPrint(id, 1) as {
                success?: boolean;
                message?: string;
                data?: { alreadyQueued?: boolean };
            };
            if (res?.data?.alreadyQueued) {
                toast.info(res.message || 'Already queued — waiting for the POS to print');
            } else {
                toast.success(res?.message || 'Sent to POS printer — keep the POS app open');
            }
        } catch (error) {
            console.error('Failed to queue POS print:', error);
            toastError(error, "Could not send print job to POS");
        } finally {
            setIsSendingToPos(false);
        }
    };

    const handlePrintInvoice = async () => {
        if (!sale) return;

        setIsPrintingInvoice(true);
        try {
            const { blob } = await buildInvoicePdfBlob();
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.print();
                    URL.revokeObjectURL(url);
                };
            } else {
                toast.error(t('sales.printWindowError') || 'Failed to open print window');
            }
            toast.success(t('sales.invoicePrintSuccess') || 'Invoice sent to printer');
        } catch (error) {
            console.error('Failed to generate invoice for printing:', error);
            toast.error(t('sales.invoiceGenerationError') || 'Failed to generate invoice');
        } finally {
            setIsPrintingInvoice(false);
        }
    };

    const handleShareInvoice = async () => {
        if (!id || !sale) return;

        setIsSharingInvoice(true);
        try {
            const invoice = unwrapInvoice(await apiClient.getInvoice(id, { allowPending: true }));
            if (!invoice) throw new Error('Invoice was not returned by the backend.');
            const filename = getInvoiceFilename(invoice, sale.saleNumber, invoiceFormat);
            const shared = await shareInvoicePdf(id, filename, invoiceFormat);
            toast.success(shared ? 'Invoice ready to share' : 'Your browser downloaded the invoice instead');
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            console.error('Failed to share invoice:', error);
            toast.error(t('sales.invoiceGenerationError') || 'Failed to prepare invoice sharing');
        } finally {
            setIsSharingInvoice(false);
        }
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'COMPLETED': 'bg-success/15 text-success dark:bg-success dark:text-green-100',
            'PENDING': 'bg-warning/15 text-warning dark:bg-warning dark:text-yellow-100',
            'PROCESSING': 'bg-primary/15 text-primary',
            'CANCELLED': 'bg-danger/15 text-danger dark:bg-danger dark:text-red-100',
            'REFUNDED': 'bg-purple-500/15 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
            'PARTIALLY_REFUNDED': 'bg-purple-500/15 text-purple-500 dark:bg-purple-600 dark:text-purple-500',
        };
        return colors[status] || 'bg-muted text-foreground';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!sale) {
        return (
            <div className="p-6">
                <div className="text-center py-12">
                    <p className={`text-lg ${theme === 'dark' ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                        {t('sales.saleNotFound') || 'Sale not found'}
                    </p>
                    <Button
                        onClick={() => navigate('/dashboard/sales')}
                        variant="outline"
                        className="mt-4"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {t('common.back') || 'Back to Sales'}
                    </Button>
                </div>
            </div>
        );
    }

    const lineItems = sale.saleItems ?? [];
    const totalProfit = lineItems.reduce((sum, item) => {
        const p = item.profit;
        const n = typeof p === 'number' ? p : parseFloat(String(p ?? '0'));
        return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    return (
        <div className="space-y-6">
            {/* Back Button */}
            <div>
                <Button
                    onClick={() => navigate('/dashboard/sales')}
                    variant="outline"
                    size="sm"
                    className={theme === 'dark'
                        ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700'
                        : 'bg-card border-border text-foreground hover:bg-muted'
                    }
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('common.back') || 'Back'}
                </Button>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                        {t('sales.saleDetails') || 'Sale Details'}
                    </h1>
                    <p className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                        {sale.invoiceNumber || sale.saleNumber}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`flex items-center rounded-lg border p-0.5 ${theme === 'dark' ? 'border-gray-700' : 'border-border'}`}>
                        {(['A4', 'A5', '80mm'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setInvoiceFormat(option)}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                    invoiceFormat === option
                                        ? 'bg-primary text-white'
                                        : theme === 'dark'
                                            ? 'text-muted-foreground/60 hover:bg-gray-700'
                                            : 'text-muted-foreground hover:bg-muted'
                                }`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                    <Button
                        onClick={handlePrintInvoice}
                        disabled={isPrintingInvoice}
                        variant="outline"
                        size="sm"
                        className={theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
                            : 'bg-card border-border text-foreground hover:bg-muted hover:text-foreground'
                        }
                    >
                        {isPrintingInvoice ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Printer className="h-4 w-4 mr-2" />
                        )}
                        {t('sales.printInvoice') || 'Print Invoice'}
                    </Button>
                    <Button
                        onClick={handleSendToPos}
                        disabled={isSendingToPos}
                        variant="outline"
                        size="sm"
                        className={theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
                            : 'bg-card border-border text-foreground hover:bg-muted hover:text-foreground'
                        }
                        title="Queue this 80mm receipt on a logged-in POS device"
                    >
                        {isSendingToPos ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Printer className="h-4 w-4 mr-2" />
                        )}
                        {t('sales.sendToPos') || 'Send to POS'}
                    </Button>
                    <Button
                        onClick={handleDownloadInvoice}
                        disabled={isDownloadingInvoice}
                        variant="outline"
                        size="sm"
                        className={theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
                            : 'bg-card border-border text-foreground hover:bg-muted hover:text-foreground'
                        }
                    >
                        {isDownloadingInvoice ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4 mr-2" />
                        )}
                        {t('sales.downloadInvoice') || 'Download PDF'}
                    </Button>
                    <Button
                        onClick={handleShareInvoice}
                        disabled={isSharingInvoice}
                        variant="outline"
                        size="sm"
                        className={theme === 'dark'
                            ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
                            : 'bg-card border-border text-foreground hover:bg-muted hover:text-foreground'
                        }
                    >
                        {isSharingInvoice ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Share2 className="h-4 w-4 mr-2" />
                        )}
                        Share Invoice
                    </Button>
                    {canCopyReceipt(sale) && (['print', 'download'] as const).map((mode) => (
                        <Button
                            key={mode}
                            onClick={() => handleReceiptCopy(mode)}
                            disabled={isCopying !== null}
                            variant="outline"
                            size="sm"
                            title="Reprint this receipt as a COPY (CS for a sale, CR for a refund) with its original fiscal data"
                            className={theme === 'dark'
                                ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700 hover:text-white'
                                : 'bg-card border-border text-foreground hover:bg-muted hover:text-foreground'
                            }
                        >
                            {isCopying === mode ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Copy className="h-4 w-4 mr-2" />
                            )}
                            {mode === 'print' ? 'Print Copy' : 'Download Copy'} ({sale.rcptLabel === 'NR' || (!sale.rcptLabel && sale.originalSaleId != null) ? 'CR' : 'CS'})
                        </Button>
                    ))}
                </div>
            </div>

            {/* Sale Information */}
            <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader>
                    <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
                        {t('sales.saleInformation') || 'Sale Information'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                {t('sales.saleNumber') || 'Sale Number'}
                            </p>
                            <p className={`mt-1 text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {sale.saleNumber}
                            </p>
                        </div>
                        {sale.invoiceNumber && (
                            <div>
                                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                    {t('sales.invoiceNumber') || 'Invoice Number'}
                                </p>
                                <p className={`mt-1 text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                    {sale.invoiceNumber}
                                </p>
                            </div>
                        )}
                        <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                {t('sales.table.dateTime') || 'Date & Time'}
                            </p>
                            <p className={`mt-1 text-base ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {format(new Date(sale.createdAt), 'MMM d, yyyy')} at {formatTime(sale.createdAt)}
                            </p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                {t('sales.table.status') || 'Status'}
                            </p>
                            <Badge className={`mt-1 ${getStatusColor(sale.status)}`}>
                                {t(`sales.statuses.${sale.status}`, sale.status)}
                            </Badge>
                        </div>
                        <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                {t('sales.paymentMethod') || 'Payment Method'}
                            </p>
                            <p className={`mt-1 text-base ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {getPaymentMethodLabel(sale.paymentType, t)}
                            </p>
                        </div>
                        <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                {t('sales.soldBy') || 'Sold By'}
                            </p>
                            <p className={`mt-1 text-base ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {sale.user.name}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {sale.ebmTransactions && sale.ebmTransactions.length > 0 && (
                <Card className={theme === 'dark' ? 'bg-gray-800 border-primary/40 border' : 'border-primary/30 bg-primary/40'}>
                    <CardHeader>
                        <CardTitle className={theme === 'dark' ? 'text-white' : 'text-primary'}>
                            RRA EBM / VSDC
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {sale.ebmTransactions.map((tx) => (
                            <div
                                key={String(tx.id ?? `${tx.operation}-${tx.submissionStatus}`)}
                                className={`text-sm rounded-lg p-3 ${theme === 'dark' ? 'bg-gray-900/80' : 'bg-card'}`}
                            >
                                <p className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-foreground'}`}>
                                    {tx.operation ?? 'SALE'} — {tx.submissionStatus}
                                </p>
                                {tx.ebmInvoiceNumber && (
                                    <p className={theme === 'dark' ? 'text-muted-foreground/60' : 'text-foreground'}>
                                        EBM invoice #: {tx.ebmInvoiceNumber}
                                    </p>
                                )}
                                {tx.errorMessage && (
                                    <p className="text-danger dark:text-red-400 mt-1">{tx.errorMessage}</p>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Customer Information */}
            <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader>
                    <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
                        {t('sales.customer') || 'Customer'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                {t('sales.customerName') || 'Name'}
                            </p>
                            <p className={`mt-1 text-base ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {sale.customer.name}
                            </p>
                        </div>
                        {sale.customer.phone && (
                            <div>
                                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                    {t('sales.phone') || 'Phone'}
                                </p>
                                <p className={`mt-1 text-base ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                    {sale.customer.phone}
                                </p>
                            </div>
                        )}
                        {sale.customer.email && (
                            <div>
                                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                    {t('sales.email') || 'Email'}
                                </p>
                                <p className={`mt-1 text-base ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                    {sale.customer.email}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Sale Items */}
            <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader>
                    <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
                        {t('sales.table.items') || 'Items'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className={theme === 'dark' ? 'bg-gray-700' : 'bg-muted'}>
                                <TableRow className={theme === 'dark' ? 'border-gray-600' : ''}>
                                    <TableHead className={theme === 'dark' ? 'text-gray-200' : 'text-foreground'}>
                                        {t('inventory.product') || 'Product'}
                                    </TableHead>
                                    <TableHead className={`text-right ${theme === 'dark' ? 'text-gray-200' : 'text-foreground'}`}>
                                        {t('inventory.qty') || 'Quantity'}
                                    </TableHead>
                                    <TableHead className={`text-right ${theme === 'dark' ? 'text-gray-200' : 'text-foreground'}`}>
                                        {t('inventory.unitPrice') || 'Unit Price'}
                                    </TableHead>
                                    <TableHead className={`text-right ${theme === 'dark' ? 'text-gray-200' : 'text-foreground'}`}>
                                        {t('sales.table.tax') || 'Tax'}
                                    </TableHead>
                                    <TableHead className={`text-right ${theme === 'dark' ? 'text-gray-200' : 'text-foreground'}`}>
                                        {t('common.total') || 'Total'}
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lineItems.map((item) => (
                                    <TableRow
                                        key={item.id}
                                        className={theme === 'dark' ? 'border-gray-700 hover:bg-gray-800' : 'hover:bg-muted'}
                                    >
                                        <TableCell className={theme === 'dark' ? 'text-muted-foreground/60' : 'text-foreground'}>
                                            <div>
                                                <p className="font-medium">
                                                    {item.product.name}
                                                    {item.taxCode && (
                                                        <span className="ml-1.5 text-[10px] font-medium px-1 py-0.5 rounded bg-muted text-muted-foreground">
                                                            {item.taxCode}
                                                        </span>
                                                    )}
                                                </p>
                                                {item.product.batchNumber && (
                                                    <p className={`text-xs ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                                        {t('inventory.batchNumber')}: {item.product.batchNumber}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className={`text-right ${theme === 'dark' ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                                            {item.quantity}
                                        </TableCell>
                                        <TableCell className={`text-right ${theme === 'dark' ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                                            {formatCurrency(item.unitPrice)}
                                            {Number(item.dcRate || 0) > 0 && (
                                                <span className="block text-xs text-muted-foreground">discount -{Number(item.dcRate)}%</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {parseFloat(item.taxAmount ?? '0') > 0
                                                ? <span className="text-primary font-medium">{formatCurrency(item.taxAmount!)}</span>
                                                : <span className={theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}>—</span>}
                                        </TableCell>
                                        <TableCell className={`text-right font-medium ${theme === 'dark' ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                                            {formatCurrency(item.totalPrice)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Summary */}
            <Card className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader>
                    <CardTitle className={theme === 'dark' ? 'text-white' : ''}>
                        {t('sales.summary') || 'Summary'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Show payment breakdown - always show if multiple methods or MIXED payment type */}
                        {(sale.paymentType === 'MIXED' || getPaymentMethods(sale).length > 1) && (
                            <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-primary/10 border-primary/30'}`}>
                                <p className={`text-sm font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                    {t('sales.paymentBreakdown')}
                                </p>
                                <div className="space-y-2">
                                    {getPaymentMethods(sale).map((payment, index) => (
                                        <div key={index} className="flex justify-between items-center">
                                            <span className={`text-sm ${theme === 'dark' ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                                                {getPaymentMethodLabel(payment.method, t)}:
                                            </span>
                                            <span className={`font-medium ${payment.method === 'DEBT'
                                                    ? 'text-warning dark:text-amber-400'
                                                    : theme === 'dark' ? 'text-white' : 'text-foreground'
                                                }`}>
                                                {formatCurrency(payment.amount.toString())}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Show individual payment amounts for non-MIXED payments */}
                        {sale.paymentType !== 'MIXED' && (
                            <>
                                {sale.paymentType === 'CASH' && parseFloat(sale.cashAmount) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                            {t('sales.table.paid') || 'Cash Paid'}
                                        </span>
                                        <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                            {formatCurrency(sale.cashAmount)}
                                        </span>
                                    </div>
                                )}
                                {sale.paymentType === 'INSURANCE' && parseFloat(sale.insuranceAmount) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                            {t('sales.insuranceAmount') || 'Insurance'}
                                        </span>
                                        <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                            {formatCurrency(sale.insuranceAmount)}
                                        </span>
                                    </div>
                                )}
                                {sale.paymentType === 'DEBT' && parseFloat(sale.debtAmount) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                            {t('sales.table.debt') || 'Debt'}
                                        </span>
                                        <span className={`font-medium text-warning dark:text-amber-400`}>
                                            {formatCurrency(sale.debtAmount)}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                        {parseFloat(sale.vatAmount ?? '0') > 0 && (
                            <div className="border-t pt-4 flex justify-between items-center">
                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                    {t('sales.table.tax') || 'Tax (VAT)'}
                                </span>
                                <span className="text-sm font-semibold text-primary">
                                    {formatCurrency(sale.vatAmount!)}
                                </span>
                            </div>
                        )}
                        <div className="border-t pt-4 flex justify-between items-center">
                            <span className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {t('sales.table.total') || 'Grand Total'}
                            </span>
                            <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-foreground'}`}>
                                {formatCurrency(sale.totalAmount)}
                            </span>
                        </div>
                        {totalProfit !== 0 && (
                            <div className="border-t pt-4 flex justify-between items-center">
                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                    {t('sales.table.profit')}
                                </span>
                                <span className={`text-base font-semibold ${totalProfit >= 0
                                        ? 'text-success dark:text-green-400'
                                        : 'text-danger dark:text-red-400'
                                    }`}>
                                    {formatCurrency(totalProfit.toString())}
                                </span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
