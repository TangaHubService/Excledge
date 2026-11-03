import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { format } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Loader2, Search, Download, Eye,
  RefreshCw, X, Plus, TrendingUp, Users, Package, Receipt,
  ArrowUpRight, MoreHorizontal, UserCircle, Copy,
} from 'lucide-react';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '../../../components/ui/drawer';
import { Label } from '../../../components/ui/label';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";
import { getInvoiceFilename, unwrapInvoice } from '../../../lib/invoice';
import { canCopyReceipt, downloadInvoicePdf, downloadReceiptCopy, printReceiptCopy, type InvoicePdfFormat } from '../../../lib/invoice-pdf';
import type { SaleEbmTransaction } from '../../../utils/invoiceFiscal';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ProformaConvertDialog from '../../../components/sales/ProformaConvertDialog';
import SaleSuccessModal, { type SaleSuccessData } from '../../../components/pos/SaleSuccessModal';
import { useBranch } from '../../../context/BranchContext';
import { useNavigate } from 'react-router-dom';

// ── helpers ──────────────────────────────────────────────────────────────────

const getPaymentMethodLabel = (paymentType: string): string => {
  if (!paymentType) return '';
  return paymentType
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
};

const fmtCurrency = (amount: string | number) =>
  `RF ${Number(amount).toLocaleString('en-RW', { minimumFractionDigits: 0 })}`;

// ── method pill colours ───────────────────────────────────────────────────────

const methodStyle: Record<string, string> = {
  CASH:         'bg-success/10 text-success',
  MOBILE_MONEY: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  INSURANCE:    'bg-primary/10 text-primary',
  CREDIT_CARD:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  CARD:         'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  DEBT:         'bg-danger/10 text-danger',
  MIXED:        'bg-warning/10 text-warning',
};

// Status pills carry a leading dot (see StatusPill) so colour isn't the only signal.
const statusStyle: Record<string, string> = {
  COMPLETED:         'bg-success/10 text-success',
  PENDING:           'bg-warning/10 text-warning',
  PROCESSING:        'bg-primary/10 text-primary',
  CANCELLED:         'bg-danger/10 text-danger',
  REFUNDED:          'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  PARTIALLY_REFUNDED:'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

// ── types ─────────────────────────────────────────────────────────────────────

type Sale = {
  id: string;
  saleNumber: string;
  invoiceNumber?: string;
  rcptLabel?: string | null;
  isProforma?: boolean;
  proformaSourceId?: number | null;
  convertedSale?: { id: string | number; invoiceNumber?: string | null; saleNumber?: string | null } | null;
  customer: { id?: string | number; name: string; email?: string; phone?: string };
  user: { name: string };
  paymentType: string;
  cashAmount: string;
  insuranceAmount: string;
  debtAmount: string;
  totalAmount: string;
  vatAmount?: string;
  taxableAmount?: string;
  createdAt: string;
  status: string;
  saleItems: Array<{
    id: string;
    product?: { name: string; batchNumber?: string } | null;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    taxAmount?: string;
    taxCode?: string;
    costPrice?: string;
    profit?: string;
    itemType?: string;
    serviceName?: string | null;
    serviceDescription?: string | null;
  }>;
  ebmTransactions?: SaleEbmTransaction[];
};

type Pagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalItems?: number;
  totalPages?: number;
};

type SalesResponse = {
  success?: boolean;
  data?: Sale[] | { data?: Sale[]; pagination?: Pagination };
  pagination?: Pagination;
};

// ── KPI card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  caption: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, iconBg, label, value, caption }) => (
  <div className="panel flex items-start gap-3.5 p-4">
    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconBg)}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num mt-1 truncate text-xl font-semibold leading-tight tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p>
    </div>
  </div>
);

const StatusPill: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium', className)}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
    {children}
  </span>
);

// ── main component ────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState({ totalSales: 0, totalCustomers: 0, totalItemsSold: 0, totalReceipts: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [rcptLabelFilter, setRcptLabelFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [saleToRefund, setSaleToRefund] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundRsnCd, setRefundRsnCd] = useState('');
  const [refundReasons, setRefundReasons] = useState<Array<{ code: string; name: string }>>([]);
  const [isRefunding, setIsRefunding] = useState(false);
  // Refundable detail (original + per-line remaining + prior refunds) loaded from GET
  // .../refundable when the drawer opens; per-line qty inputs are kept as strings and parsed on
  // submit.
  const [refundDetail, setRefundDetail] = useState<any>(null);
  const [refundDetailLoading, setRefundDetailLoading] = useState(false);
  const [refundLineQty, setRefundLineQty] = useState<Record<string, string>>({});
  const [refundRecipient, setRefundRecipient] = useState('');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);
  // Named distinctly from date-fns's `format` (imported above) to avoid shadowing it.
  const [invoiceFormat, setInvoiceFormat] = useState<InvoicePdfFormat>('A4');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [proformaToConvert, setProformaToConvert] = useState<Sale | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<SaleSuccessData | null>(null);
  const [convertedSaleRaw, setConvertedSaleRaw] = useState<Sale | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const { selectedBranchId } = useBranch();
  const fetchSales = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getSales({
        page: currentPage,
        limit: pageSize,
        search: searchTerm,
        status: statusFilter,
        paymentType: paymentFilter,
        rcptLabel: rcptLabelFilter,
        startDate,
        endDate,
      }) as SalesResponse;

      // The sales API now returns `success({ data, pagination })`. Keep the
      // direct-array fallback for older deployments during a rolling update.
      const payload = Array.isArray(response?.data) ? undefined : response?.data;
      const list: Sale[] = Array.isArray(payload?.data) ? payload.data
        : Array.isArray(response?.data) ? response.data
        : [];
      const pagination = payload?.pagination ?? response?.pagination;
      const pages = typeof pagination?.totalPages === 'number' && pagination.totalPages >= 1
        ? pagination.totalPages
        : 1;
      const total = Number(pagination?.total ?? pagination?.totalItems ?? list.length);

      // A filter or deletion can make the active page no longer valid. Return
      // to the final page and fetch it instead of leaving an empty table.
      if (currentPage > pages) {
        setCurrentPage(pages);
        return;
      }

      setSales(list);
      setTotalPages(pages);
      setTotalCount(Number.isFinite(total) ? total : list.length);

      // compute KPIs from current response
      const totalSalesAmt = list.reduce((s: number, sale: Sale) => s + parseFloat(sale.totalAmount || '0'), 0);
      const uniqueCustomers = new Set(list.map((s: Sale) => s.customer?.name)).size;
      const itemsSold = list.reduce((s: number, sale: Sale) => s + sale.saleItems.reduce((ss, i) => ss + Number(i.quantity ?? 0), 0), 0);
      setStats({
        totalSales: totalSalesAmt,
        totalCustomers: uniqueCustomers,
        totalItemsSold: itemsSold,
        totalReceipts: list.length,
      });
    } catch (error) {
      console.error('Failed to fetch sales:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, statusFilter, paymentFilter, rcptLabelFilter, startDate, endDate]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // close row menu on outside click
  useEffect(() => {
    if (!openRowMenu) return;
    const h = () => setOpenRowMenu(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [openRowMenu]);

  const handleViewSale = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (sale) setSelectedSale(sale);
  };

  const confirmDelete = async () => {
    if (!saleToDelete) return;
    try {
      setIsDeleting(true);
      setSales(prev => prev.filter(s => s.id !== saleToDelete.id));
      toast.success(t('messages.deleteSuccess'));
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setSaleToDelete(null);
    }
  };

  const handleOpenRefundModal = (sale: Sale) => {
    setSaleToRefund(sale);
    setRefundReason('');
    setRefundRsnCd('');
    setRefundRecipient(sale.customer?.name ?? '');
    setRefundLineQty({});
    setRefundDetail(null);
    setIsRefundModalOpen(true);
    // What is still refundable (remaining per line, prior refunds). The inputs default to the full
    // remaining quantity; the operator lowers them for a partial refund.
    setRefundDetailLoading(true);
    apiClient.getRefundable(sale.id)
      .then((res: any) => {
        const d = res?.data ?? res;
        setRefundDetail(d);
        const init: Record<string, string> = {};
        for (const l of d?.lines ?? []) init[String(l.saleItemId)] = String(l.remaining ?? 0);
        setRefundLineQty(init);
      })
      .catch(() => { /* drawer still allows a full refund; backend validates */ })
      .finally(() => setRefundDetailLoading(false));
    // RRA refund reason codes (code class 32) — same list the backend
    // enforces, so the operator can never pick a code VSDC rejects.
    apiClient.getRraRefundReasons()
      .then((res: any) => {
        const list = res?.data?.reasons ?? res?.reasons ?? [];
        if (Array.isArray(list) && list.length) setRefundReasons(list);
        const def = res?.data?.default ?? res?.default;
        if (typeof def === 'string' && def) setRefundRsnCd(def);
        else if (Array.isArray(list) && list[0]?.code) setRefundRsnCd(list[0].code);
      })
      .catch(() => { /* keep the last-resort list below */ });
  };

  const refundPreviewTotal = (refundDetail?.lines ?? []).reduce((s: number, l: any) => {
    const q = Number(refundLineQty[String(l.saleItemId)] ?? 0);
    return s + (Number.isFinite(q) && q > 0 ? q * Number(l.unitPrice || 0) : 0);
  }, 0);

  const handleRefundSubmit = async () => {
    if (!saleToRefund) return;
    if (!refundReason.trim()) { toast.error(t('sales.reasonRequired') || 'Refund reason is required'); return; }
    if (refundRsnCd === '13' && refundReason.trim().length < 5) {
      toast.error(t('sales.otherReasonHint') || 'Code 13 (Other reason) needs an explanation of at least 5 characters');
      return;
    }
    const selectedItems = (refundDetail?.lines ?? [])
      .map((l: any) => ({ saleItemId: l.saleItemId, quantity: Number(refundLineQty[String(l.saleItemId)] ?? 0) }))
      .filter((r: { quantity: number }) => Number.isFinite(r.quantity) && r.quantity > 0);
    if (refundDetail && selectedItems.length === 0) {
      toast.error(t('sales.refundNoItems') || 'Select at least one item quantity to refund');
      return;
    }
    try {
      setIsRefunding(true);
      const refundRes: any = await apiClient.refundSale(saleToRefund.id, {
        reason: refundReason.trim(),
        rfdRsnCd: refundRsnCd || undefined,
        // Omit items when the detail failed to load: backend treats it as a
        // full refund of every remaining line (and still validates).
        items: refundDetail ? selectedItems : undefined,
        recipientName: refundRecipient.trim() || undefined,
        // The mode this drawer was opened in; the backend refuses if it changed since.
        receiptMode: typeof refundDetail?.trainingMode === 'boolean'
          ? (refundDetail.trainingMode ? 'TRAINING' : 'NORMAL')
          : undefined,
      });
      const fiscalStatus = refundRes?.data?.fiscalization?.status;
      const refundLabel = refundDetail?.refundLabel === 'TR' ? 'TR' : 'NR';
      if (fiscalStatus === 'failed') {
        toast.error(t('sales.refundFiscalFailed', { label: refundLabel }));
      } else if (fiscalStatus === 'pending') {
        toast.success(t('sales.refundFiscalPending', { label: refundLabel }));
      } else {
        toast.success(t('sales.refundSuccess'));
      }
      await fetchSales();
      setIsRefundModalOpen(false);
    } catch (error: unknown) {
      toastError(error, t('sales.refundError'));
    } finally {
      setIsRefunding(false);
    }
  };

  const handleOpenCancelModal = (sale: Sale) => {
    setSaleToCancel(sale);
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const handleCancelSubmit = async () => {
    if (!saleToCancel) return;
    if (cancelReason.trim().length < 5) { toast.error(t('sales.cancelReasonRequired') || 'Cancellation reason is required (at least 5 characters)'); return; }
    try {
      setIsCancelling(true);
      await apiClient.cancelSale(saleToCancel.id, { reason: cancelReason.trim() });
      toast.success(t('sales.cancelSuccess') || 'Sale cancelled successfully');
      await fetchSales();
      setIsCancelModalOpen(false);
    } catch (error: unknown) {
      toastError(error, t('sales.cancelError'));
    } finally {
      setIsCancelling(false);
    }
  };

  /** CIS/VSDC spec §7.18/§15: "print only one original receipt. */
  const handleDownloadInvoice = async (sale: Sale, downloadFormat: InvoicePdfFormat = invoiceFormat) => {
    setIsDownloadingInvoice(sale.id);
    try {
      const invoice = unwrapInvoice(await apiClient.getInvoice(sale.id, { allowPending: true }));
      const ok = await downloadInvoicePdf(
        sale.id,
        getInvoiceFilename(invoice, sale.saleNumber, downloadFormat),
        downloadFormat
      );
      if (!ok) throw new Error('PDF generation failed');
      toast.success(t('sales.invoiceDownloadSuccess'));
    } catch (error) {
      console.error('Failed to download invoice:', error);
      toast.error(t('sales.invoiceGenerationError'));
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  /** CS/CR: explicit copy of an existing NS/NR receipt with its original fiscal data. */
  const handlePrintReceiptCopy = async (sale: Sale, copyFormat: InvoicePdfFormat) => {
    setIsDownloadingInvoice(sale.id);
    try {
      const label = await printReceiptCopy(sale.id, copyFormat);
      toast.success(`${label ?? 'Copy'} receipt sent to the printer`);
    } catch (error) {
      console.error('Failed to print receipt copy:', error);
      toastError(error, "Could not print the receipt copy");
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  const handleDownloadReceiptCopy = async (sale: Sale, copyFormat: InvoicePdfFormat) => {
    setIsDownloadingInvoice(sale.id);
    try {
      const label = await downloadReceiptCopy(sale.id, copyFormat);
      toast.success(`${label ?? 'Copy'} receipt downloaded`);
    } catch (error) {
      console.error('Failed to download receipt copy:', error);
      toastError(error, "Could not download the receipt copy");
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  const resetFilters = () => {
    setStartDate(''); setEndDate(''); setStatusFilter('');
    setPaymentFilter(''); setRcptLabelFilter('');
    setSearchTerm(''); setCurrentPage(1);
  };

  // Poll GET /invoices/:saleId until VSDC confirms (200) or the wait gives up — the endpoint
  // returns 425 while fiscalization is still in flight.
  const pollFiscalization = useCallback(async (saleId: string | number) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        await apiClient.getInvoice(saleId);
        setConvertSuccess(prev => (prev && String(prev.id) === String(saleId) ? { ...prev, fiscalizationStatus: 'success' } : prev));
        return;
      } catch (e: any) {
        if (e?.response?.status === 425) continue;
        break;
      }
    }
    setConvertSuccess(prev => (prev && String(prev.id) === String(saleId) ? { ...prev, fiscalizationStatus: 'failed' } : prev));
  }, []);

  const handleProformaConverted = useCallback((newSale: any) => {
    setProformaToConvert(null);
    fetchSales();
    if (!newSale?.id) return;
    const fiscalizationStatus: 'success' | 'pending' | 'failed' =
      newSale?.fiscalization?.status ?? 'success';
    setConvertedSaleRaw(newSale as Sale);
    setConvertSuccess({
      id: newSale.id,
      invoiceNumber: newSale.invoiceNumber,
      receiptNumber: newSale?.fiscalization?.sdcRcptNo != null ? String(newSale.fiscalization.sdcRcptNo) : undefined,
      customerName: newSale?.customer?.name,
      totalAmount: Number(newSale.totalAmount ?? 0),
      totalItems: Array.isArray(newSale.saleItems)
        ? newSale.saleItems.reduce((s: number, i: any) => s + Number(i.quantity ?? 0), 0)
        : undefined,
      paymentLabel: getPaymentMethodLabel(newSale.paymentType ?? ''),
      amountPaid: Number(newSale.cashAmount ?? 0) + Number(newSale.insuranceAmount ?? 0),
      changeReturned: 0,
      date: newSale.createdAt ? new Date(newSale.createdAt) : new Date(),
      fiscalizationStatus,
    });
    if (fiscalizationStatus === 'pending') pollFiscalization(newSale.id);
  }, [fetchSales, pollFiscalization]);

  const pageWindowStart = Math.max(1, Math.min(currentPage - 2, Math.max(1, totalPages - 4)));
  const visiblePages = Array.from(
    { length: Math.min(totalPages, 5) },
    (_, index) => pageWindowStart + index,
  );
  const firstShown = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastShown = totalCount === 0 ? 0 : Math.min(firstShown + sales.length - 1, totalCount);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('sales.salesHistory')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('sales.salesHistoryDesc')}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/pos')}
          className="flex h-10 items-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          New sale
        </button>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      {/* Amount/customers/items are summed from the rows on screen, so they
          say "on this page"; receipts uses the server total for the filters. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          iconBg="bg-chart-sales/10 text-chart-sales"
          label="Sales amount"
          value={`RF ${stats.totalSales.toLocaleString()}`}
          caption="On this page"
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          iconBg="bg-success/10 text-success"
          label="Customers"
          value={stats.totalCustomers.toLocaleString()}
          caption="On this page"
        />
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          iconBg="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          label="Items sold"
          value={stats.totalItemsSold.toLocaleString()}
          caption="On this page"
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          iconBg="bg-warning/10 text-warning"
          label="Receipts"
          value={totalCount.toLocaleString()}
          caption="Matching filters"
        />
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Start Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="h-9 w-38 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15"
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="h-9 w-38 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Method */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Method</label>
            <select
              value={paymentFilter}
              onChange={e => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15"
            >
              <option value="">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="INSURANCE">Insurance</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBT">Debt</option>
              <option value="MIXED">Mixed</option>
            </select>
          </div>

          {/* Receipt Type (RcptLabel) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Receipt Type</label>
            <select
              value={rcptLabelFilter}
              onChange={e => { setRcptLabelFilter(e.target.value); setCurrentPage(1); }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15"
            >
              <option value="">All Types</option>
              <option value="NS">Normal Sale</option>
              <option value="NR">Normal Refund</option>
              <option value="TS">Training Sale</option>
              <option value="TR">Training Refund</option>
              <option value="PS">Proforma</option>
            </select>
          </div>

          {/* Reset */}
          {(startDate || endDate || statusFilter || paymentFilter || rcptLabelFilter || searchTerm) && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </button>
          )}

          {/* Search + New Sale */}
          <div className="relative w-full sm:ml-auto sm:w-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search invoice or customer…"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-ring/15 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} columns={9} rowHeight="h-4" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Receipt className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">{t('sales.noSalesFound')}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="border-b border-border/80 bg-surface-subtle">
              <TableRow className="hover:bg-transparent">
                {['Time', 'Invoice', 'Customer', 'Items', 'Tax', 'Method', 'Paid', 'Debt', 'Status', 'Type', 'Total', ''].map((h, i) => (
                  <TableHead
                    key={h || `col-${i}`}
                    className={cn(
                      'h-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                      ['Items', 'Tax', 'Paid', 'Debt', 'Total'].includes(h) && 'text-right',
                    )}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map(sale => {
                const itemCount = sale.saleItems.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
                const paid = parseFloat(sale.cashAmount) + parseFloat(sale.insuranceAmount);
                const debt = parseFloat(sale.debtAmount);
                const vat = parseFloat(sale.vatAmount ?? '0');

                return (
                  <TableRow
                    key={sale.id}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
                    onClick={() => handleViewSale(sale.id)}
                  >
                    {/* Time */}
                    <TableCell className="whitespace-nowrap py-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{format(new Date(sale.createdAt), 'EEE, MMM d')}</p>
                      <p className="num">{format(new Date(sale.createdAt), 'HH:mm')}</p>
                    </TableCell>

                    {/* Sale number */}
                    <TableCell className="py-3">
                      <button
                        onClick={e => { e.stopPropagation(); handleViewSale(sale.id); }}
                        className="whitespace-nowrap font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {sale.invoiceNumber || sale.saleNumber}
                      </button>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                          {sale.customer.name?.charAt(0)?.toUpperCase() || <UserCircle className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="whitespace-nowrap text-xs font-medium text-foreground">{sale.customer.name}</p>
                          {sale.customer.phone && <p className="text-[10px] text-muted-foreground">{sale.customer.phone}</p>}
                        </div>
                      </div>
                    </TableCell>

                    {/* Items */}
                    <TableCell className="num py-3 text-right text-sm text-foreground">{itemCount}</TableCell>

                    {/* Tax */}
                    <TableCell className="py-3 text-right">
                      {vat > 0 ? (
                        <span className="num text-xs text-muted-foreground">{vat.toLocaleString()}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    {/* Method */}
                    <TableCell className="py-3">
                      <span className={cn(
                        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium',
                        methodStyle[sale.paymentType] ?? 'bg-muted text-muted-foreground',
                      )}>
                        {getPaymentMethodLabel(sale.paymentType)}
                      </span>
                    </TableCell>

                    {/* Paid */}
                    <TableCell className="py-3 text-right">
                      <span className="num whitespace-nowrap text-sm text-foreground">{fmtCurrency(paid)}</span>
                    </TableCell>

                    {/* Debt */}
                    <TableCell className="py-3 text-right">
                      {debt > 0 ? (
                        <span className="num whitespace-nowrap text-sm font-medium text-danger">{fmtCurrency(debt)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      <StatusPill className={statusStyle[sale.status] ?? 'bg-muted text-muted-foreground'}>
                        {sale.status.charAt(0) + sale.status.slice(1).toLowerCase().replace('_', ' ')}
                      </StatusPill>
                    </TableCell>

                    {/* Receipt Type (RcptLabel) */}
                    <TableCell className="whitespace-nowrap py-3">
                      {sale.rcptLabel ? (
                        <span className={cn(
                          'inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] font-semibold',
                          (sale as any).rcptLabel === 'CS' || (sale as any).rcptLabel === 'CR' ? 'border-primary/30 text-primary' :
                          (sale as any).rcptLabel === 'PS' ? 'border-warning/40 text-warning' :
                          (sale as any).rcptLabel === 'TS' || (sale as any).rcptLabel === 'TR' ? 'border-violet-500/40 text-violet-600 dark:text-violet-400' :
                          'border-border text-muted-foreground',
                        )}>
                          {(sale as any).rcptLabel}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                      {(sale.status === 'CONVERTED' || sale.convertedSale) && (
                        <button
                          onClick={e => { e.stopPropagation(); if (sale.convertedSale) handleViewSale(String(sale.convertedSale.id)); }}
                          className="ml-1 inline-flex items-center rounded bg-success/10 px-1.5 py-px text-[10px] font-semibold text-success hover:bg-success/20"
                          title={sale.convertedSale?.invoiceNumber ? `Converted → ${sale.convertedSale.invoiceNumber}` : 'Converted'}
                        >
                          Converted
                        </button>
                      )}
                    </TableCell>

                    {/* Total */}
                    <TableCell className="py-3 text-right">
                      <span className="num whitespace-nowrap text-sm font-semibold text-foreground">{fmtCurrency(sale.totalAmount)}</span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => handleViewSale(sale.id)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setOpenRowMenu(openRowMenu === sale.id ? null : sale.id); }}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openRowMenu === sale.id && (
                            <div className="panel absolute right-0 z-30 mt-1 w-48 p-1 text-sm shadow-dropdown">
                              <button
                                onClick={() => { handleDownloadInvoice(sale, 'A4'); setOpenRowMenu(null); }}
                                disabled={isDownloadingInvoice === sale.id}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted"
                              >
                                {isDownloadingInvoice === sale.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Download className="h-3.5 w-3.5" />}
                                Download A4
                              </button>
                              <button
                                onClick={() => { handleDownloadInvoice(sale, 'A5'); setOpenRowMenu(null); }}
                                disabled={isDownloadingInvoice === sale.id}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download A5
                              </button>
                              <button
                                onClick={() => { handleDownloadInvoice(sale, '80mm'); setOpenRowMenu(null); }}
                                disabled={isDownloadingInvoice === sale.id}
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted"
                              >
                                {isDownloadingInvoice === sale.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Download className="h-3.5 w-3.5" />}
                                Download 80mm
                              </button>
                              {canCopyReceipt(sale) && (['A4', '80mm'] as const).map((copyFormat) => (
                                <button
                                  key={copyFormat}
                                  onClick={() => { handlePrintReceiptCopy(sale, copyFormat); setOpenRowMenu(null); }}
                                  disabled={isDownloadingInvoice === sale.id}
                                  title="Reprint as a COPY (CS for a sale, CR for a refund) with the original fiscal data"
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  Print copy {copyFormat}
                                </button>
                              ))}
                              <div className="my-1 border-t border-border/70" />
                              {sale.rcptLabel === 'PS' && sale.status !== 'CONVERTED' && !sale.convertedSale && (
                                <button
                                  onClick={() => { setProformaToConvert(sale); setOpenRowMenu(null); }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-success transition-colors hover:bg-success/10"
                                >
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                  Convert to sale
                                </button>
                              )}
                              {(sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED') && (sale.rcptLabel === 'NS' || sale.rcptLabel === 'TS' || sale.rcptLabel == null) && !sale.isProforma && (
                                <button
                                  onClick={() => { handleOpenRefundModal(sale); setOpenRowMenu(null); }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-warning transition-colors hover:bg-warning/10"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Refund Sale
                                </button>
                              )}
                              {sale.status === 'COMPLETED' && sale.rcptLabel !== 'PS' && (
                                <button
                                  onClick={() => { handleOpenCancelModal(sale); setOpenRowMenu(null); }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-danger transition-colors hover:bg-danger/10"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Cancel Sale (Void)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* ── Pagination ───────────────────────────────────────────── */}
        {!isLoading && totalCount > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="num text-xs text-muted-foreground">
              Showing {firstShown}–{lastShown} of {totalCount} transactions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage <= 1 || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {visiblePages.map((page) => {
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      'num h-8 min-w-[2rem] rounded-lg px-2 text-xs font-medium transition-colors',
                      currentPage === page
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Per-page selector */}
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="ml-1 h-8 rounded-lg border border-border bg-background pl-2 pr-2 text-xs font-medium text-muted-foreground transition-all focus:outline-none focus:ring-4 focus:ring-ring/15"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Sale detail drawer ───────────────────────────────────────────── */}
      <Drawer open={!!selectedSale} onOpenChange={open => !open && setSelectedSale(null)}>
        <DrawerContent className="max-h-[100vh] overflow-y-auto bg-card p-0 sm:max-w-2xl">
          <DrawerHeader className="border-b border-border/80 px-5 py-4 pr-12">
            <DrawerTitle className="text-base font-semibold text-foreground">Sale details</DrawerTitle>
            <DrawerDescription className="mt-0.5 font-mono text-xs text-muted-foreground">
              {selectedSale?.invoiceNumber || selectedSale?.saleNumber}
            </DrawerDescription>
          </DrawerHeader>

          {selectedSale && (
            <div className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/80 bg-surface-subtle p-3">
                  <p className="eyebrow">Sale number</p>
                  <p className="mt-1 break-all font-mono text-sm font-medium text-foreground">{selectedSale.saleNumber}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-surface-subtle p-3">
                  <p className="eyebrow">Date & time</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{format(new Date(selectedSale.createdAt), 'dd MMM yyyy')}</p>
                  <p className="num text-xs text-muted-foreground">{format(new Date(selectedSale.createdAt), 'HH:mm')}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-surface-subtle p-3">
                  <p className="eyebrow">Status</p>
                  <div className="mt-1">
                    <StatusPill className={statusStyle[selectedSale.status] ?? 'bg-muted text-muted-foreground'}>
                      {selectedSale.status.charAt(0) + selectedSale.status.slice(1).toLowerCase().replace('_', ' ')}
                    </StatusPill>
                  </div>
                </div>
                <div className="rounded-xl border border-border/80 bg-surface-subtle p-3">
                  <p className="eyebrow">Payment</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{getPaymentMethodLabel(selectedSale.paymentType)}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-surface-subtle p-3">
                  <p className="eyebrow">Sold by</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{selectedSale.user?.name || '—'}</p>
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                  <p className="eyebrow text-primary">Total</p>
                  <p className="num mt-1 text-lg font-semibold text-foreground">{fmtCurrency(selectedSale.totalAmount)}</p>
                </div>
              </div>

              <section className="rounded-xl border border-border/80">
                <div className="border-b border-border/70 px-4 py-3">
                  <h3 className="panel-title">Customer</h3>
                </div>
                <div className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Name</p><p className="mt-1 font-medium text-foreground">{selectedSale.customer?.name || 'Walk-in customer'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Phone</p><p className="mt-1 text-foreground">{selectedSale.customer?.phone || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="mt-1 break-all text-foreground">{selectedSale.customer?.email || '—'}</p></div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-border/80">
                <div className="border-b border-border/70 px-4 py-3">
                  <h3 className="panel-title">Items</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-surface-subtle text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-3 py-2.5 text-center">Qty</th>
                        <th className="px-3 py-2.5 text-right">Unit price</th>
                        <th className="px-3 py-2.5 text-right">Tax</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {selectedSale.saleItems.map((item) => (
                        <tr key={item.id} className="text-foreground">
                          <td className="px-4 py-3 font-medium">{item.serviceName || item.product?.name || 'Item'}</td>
                          <td className="num px-3 py-3 text-center">{item.quantity}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{fmtCurrency(item.unitPrice)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{Number(item.taxAmount || 0) > 0 ? fmtCurrency(item.taxAmount || 0) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtCurrency(item.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-border/80 p-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="num font-semibold text-foreground">{fmtCurrency(Number(selectedSale.cashAmount || 0) + Number(selectedSale.insuranceAmount || 0))}</span>
                </div>
                {Number(selectedSale.debtAmount || 0) > 0 && (
                  <div className="mt-3 flex items-center justify-between gap-4 border-t border-border/70 pt-3 text-sm">
                    <span className="text-muted-foreground">Outstanding debt</span>
                    <span className="num font-semibold text-danger">{fmtCurrency(selectedSale.debtAmount)}</span>
                  </div>
                )}
              </section>
            </div>
          )}

          <DrawerFooter className="flex-row flex-wrap items-center gap-2 border-t border-border/80 px-5 py-4">
            <button
              onClick={() => setSelectedSale(null)}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('common.close')}
            </button>
            <div className="flex items-center rounded-lg bg-muted p-0.5">
              {(['A4', 'A5', '80mm'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setInvoiceFormat(option)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    invoiceFormat === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            {selectedSale && (
              <button
                onClick={() => handleDownloadInvoice(selectedSale, invoiceFormat)}
                disabled={isDownloadingInvoice === selectedSale?.id}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {isDownloadingInvoice === selectedSale?.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
                {t('sales.downloadInvoice') || 'Download PDF'}
              </button>
            )}
            {selectedSale && canCopyReceipt(selectedSale) && (
              <button
                onClick={() => handleDownloadReceiptCopy(selectedSale, invoiceFormat)}
                disabled={isDownloadingInvoice === selectedSale.id}
                title="Reprint as a COPY (CS for a sale, CR for a refund) with the original fiscal data"
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Copy className="h-4 w-4" />
                Download Copy ({selectedSale.rcptLabel === 'NR' ? 'CR' : 'CS'})
              </button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Proforma → sale conversion ───────────────────────────────────── */}
      <ProformaConvertDialog
        sale={proformaToConvert as any}
        branchId={selectedBranchId as any}
        open={!!proformaToConvert}
        onClose={() => setProformaToConvert(null)}
        onConverted={handleProformaConverted}
      />

      <SaleSuccessModal
        isOpen={!!convertSuccess}
        saleData={convertSuccess}
        onPrint={() => convertedSaleRaw && handleDownloadInvoice(convertedSaleRaw, '80mm')}
        onDownload={() => convertedSaleRaw && handleDownloadInvoice(convertedSaleRaw, invoiceFormat)}
        onShare={() => convertedSaleRaw && handleDownloadInvoice(convertedSaleRaw, invoiceFormat)}
        onNewSale={() => { setConvertSuccess(null); setConvertedSaleRaw(null); }}
        onViewInvoice={() => {
          const id = convertSuccess?.id;
          setConvertSuccess(null);
          setConvertedSaleRaw(null);
          if (id != null) handleViewSale(String(id));
        }}
      />

      {/* ── Refund drawer ────────────────────────────────────────────────── */}
      <Drawer open={isRefundModalOpen} onOpenChange={setIsRefundModalOpen}>
        <DrawerContent className="bg-card sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{t('sales.processRefund', { number: saleToRefund?.saleNumber })}</DrawerTitle>
            <DrawerDescription>{t('sales.refundDesc')}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 px-5 py-4 max-h-[65vh] overflow-y-auto">
            {refundDetailLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('sales.refundLoading') || 'Loading refundable details…'}
              </div>
            )}
            {!refundDetailLoading && Array.isArray(refundDetail?.errors) && refundDetail.errors.length > 0 && (
              <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl space-y-1">
                {refundDetail.errors.map((e: string, i: number) => (
                  <p key={i} className="text-sm text-danger font-medium">{e}</p>
                ))}
              </div>
            )}
            {refundDetail?.refundLabel === 'TR' && (
              <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl text-sm font-semibold text-orange-700 dark:text-orange-300">
                TRAINING REFUND (TR) — not an official receipt. No stock, customer balance or accounting record changes.
              </div>
            )}
            {refundDetail?.original && (
              <div className="space-y-1 rounded-xl border border-border/80 bg-surface-subtle p-4 text-sm">
                <p className="font-semibold text-foreground">{t('sales.refundOriginal') || 'Original transaction (being refunded)'}</p>
                <p className="text-muted-foreground">#{refundDetail.original.saleNumber} · INV {refundDetail.original.invoiceNumber ?? '—'}{refundDetail.original.vsdcInvcNo != null ? ` · VSDC ${refundDetail.original.vsdcInvcNo}` : ''}</p>
                <p className="text-muted-foreground">{refundDetail.original.customer?.name ?? ''}{refundDetail.original.customer?.TIN ? ` · TIN ${refundDetail.original.customer.TIN}` : ''}</p>
                <p className="text-muted-foreground">{t('sales.refundOriginalTotal') || 'Original total'}: RF {Number(refundDetail.original.totalAmount || 0).toLocaleString('en-RW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            )}
            {Array.isArray(refundDetail?.lines) && refundDetail.lines.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{t('sales.refundSelectItems') || 'Select items and quantities to refund'}</p>
                {refundDetail.lines.map((l: any) => (
                  <div key={l.saleItemId} className="flex items-center gap-3 rounded-xl border border-border/80 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{l.productName ?? l.serviceName ?? `#${l.saleItemId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('sales.refundSold') || 'Sold'}: {l.quantity} · {t('sales.refunded') || 'Refunded'}: {l.refunded} · {t('sales.refundRemaining') || 'Remaining'}: {l.remaining}{l.taxCode ? ` · ${l.taxCode}` : ''}
                      </p>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-muted-foreground">{t('sales.refundQtyToRefund') || 'Qty'}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={l.remaining}
                        step="any"
                        disabled={l.remaining <= 0}
                        value={refundLineQty[String(l.saleItemId)] ?? ''}
                        onChange={e => setRefundLineQty(prev => ({ ...prev, [String(l.saleItemId)]: e.target.value }))}
                        className="h-9 text-right"
                      />
                    </div>
                  </div>
                ))}
                <p className="text-sm text-foreground text-right">
                  {t('sales.refundTotalPreview') || 'Refund total'}: <span className="font-semibold">RF {refundPreviewTotal.toLocaleString('en-RW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              </div>
            )}
            {Array.isArray(refundDetail?.priorRefunds) && refundDetail.priorRefunds.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{t('sales.refundPriorRefunds') || 'Prior refunds'}</p>
                {refundDetail.priorRefunds.map((r: any) => (
                  <p key={r.id} className="text-xs text-muted-foreground">
                    #{r.saleNumber} · RF {Number(r.totalAmount || 0).toLocaleString('en-RW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {r.fiscalStatus ?? r.status}
                  </p>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="refundRsnCd">{t('sales.refundReasonCode') || 'RRA refund reason'}</Label>
              <select
                id="refundRsnCd"
                value={refundRsnCd}
                onChange={e => setRefundRsnCd(e.target.value)}
                className="w-full rounded-md border border-amber-200 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {(refundReasons.length ? refundReasons : [
                  { code: '01', name: 'Missing Quantity' },
                  { code: '02', name: 'Missing Waiting' },
                  { code: '03', name: 'Damaged' },
                  { code: '04', name: 'Wasted' },
                  { code: '05', name: 'Raw Material Shortage' },
                  { code: '06', name: 'Refund' },
                  { code: '07', name: 'Wrong Customer TIN' },
                  { code: '08', name: 'Wrong Customer name' },
                  { code: '09', name: 'Wrong Amount/price' },
                  { code: '10', name: 'Wrong Quantity' },
                  { code: '11', name: 'Wrong Item(s)' },
                  { code: '12', name: 'Wrong tax type' },
                  { code: '13', name: 'Other reason' },
                ]).map(r => (
                  <option key={r.code} value={r.code}>{r.code} — {r.name}</option>
                ))}
              </select>
              {refundRsnCd === '13' && (
                <p className="text-xs text-amber-700">{t('sales.otherReasonHint') || 'Code 13 (Other reason) needs an explanation of at least 5 characters below.'}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refundReason">{t('sales.refundReason')}</Label>
              <Input
                id="refundReason"
                placeholder={t('sales.refundReasonPlaceholder')}
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                className="focus:ring-amber-500 border-amber-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refundRecipient">{t('sales.refundRecipient') || 'Refund recipient'}</Label>
              <Input
                id="refundRecipient"
                placeholder={t('sales.refundRecipientPlaceholder') || 'Person receiving the refund'}
                value={refundRecipient}
                onChange={e => setRefundRecipient(e.target.value)}
                className="focus:ring-amber-500 border-amber-200"
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2 border-t border-border/80 px-5 py-4">
            <button
              onClick={() => setIsRefundModalOpen(false)}
              className="h-10 flex-1 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleRefundSubmit}
              disabled={isRefunding || refundDetailLoading || (refundDetail != null && !refundDetail.eligible)}
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {isRefunding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('sales.processRefund') || 'Process Refund'}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Cancel (Void) drawer ──────────────────────────────────────────── */}
      <Drawer open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DrawerContent className="bg-card sm:max-w-lg">
          <DrawerHeader>
            <DrawerTitle>{t('sales.processCancel', { number: saleToCancel?.saleNumber }) || `Cancel Sale ${saleToCancel?.saleNumber ?? ''}`}</DrawerTitle>
            <DrawerDescription>
              {t('sales.cancelDesc') || 'The original invoice will be voided, stock restored, and a VOID receipt sent to the VSDC. This cannot be undone.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl">
              <p className="text-sm text-danger font-medium">
                {t('sales.cancelWarning') || 'Only use this when the sale was made in error (e.g. wrong items or customer). For genuine returns, use Refund Sale instead.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancelReason">{t('sales.cancelReason') || 'Cancellation reason'}</Label>
              <Input
                id="cancelReason"
                placeholder={t('sales.cancelReasonPlaceholder') || 'Why is this sale being cancelled? (min 5 characters)'}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="focus:ring-red-500 border-red-200"
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2 border-t border-border/80 px-5 py-4">
            <button
              onClick={() => setIsCancelModalOpen(false)}
              className="h-10 flex-1 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCancelSubmit}
              disabled={isCancelling}
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
            >
              {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {t('sales.processCancel') || 'Cancel Sale'}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Confirm delete ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        title={t('sales.deleteSale') || 'Delete Sale'}
        message={t('sales.deleteConfirm') || 'Are you sure you want to delete this sale?'}
        confirmText={t('common.delete') || 'Delete'}
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  );
}
