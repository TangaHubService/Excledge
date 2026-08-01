import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { Input } from '../../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { format } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Loader2, Search, Download, Eye,
  RefreshCw, X, Plus, TrendingUp, Users, Package, Receipt,
  ArrowUpRight, MoreHorizontal, UserCircle,
} from 'lucide-react';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '../../../components/ui/drawer';
import { Label } from '../../../components/ui/label';
import { toast } from 'react-toastify';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import SalesInvoicePDF, { type SaleEbmTransaction } from '../../../components/invoice/SalesInvoicePDF';
import { fiscalBlockFromSale } from '../../../utils/invoiceFiscal';
import { buildInvoiceQrDataUrl } from '../../../utils/qrCode';
import { useOrganization } from '../../../context/OrganizationContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { useNavigate } from 'react-router-dom';

// ── helpers ──────────────────────────────────────────────────────────────────

const getPaymentMethodLabel = (paymentType: string): string => {
  if (!paymentType) return '';
  return paymentType
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
};

const getPaymentMethods = (sale: Sale): Array<{ method: string; amount: number }> => {
  const methods: Array<{ method: string; amount: number }> = [];
  if (parseFloat(sale.cashAmount) > 0) methods.push({ method: 'CASH', amount: parseFloat(sale.cashAmount) });
  if (parseFloat(sale.insuranceAmount) > 0) methods.push({ method: 'INSURANCE', amount: parseFloat(sale.insuranceAmount) });
  if (parseFloat(sale.debtAmount) > 0) methods.push({ method: 'DEBT', amount: parseFloat(sale.debtAmount) });
  return methods;
};

const fmtCurrency = (amount: string | number) =>
  `RF ${Number(amount).toLocaleString('en-RW', { minimumFractionDigits: 0 })}`;

// ── method pill colours ───────────────────────────────────────────────────────

const methodStyle: Record<string, string> = {
  CASH:         'bg-emerald-100 text-emerald-700',
  MOBILE_MONEY: 'bg-orange-100 text-orange-700',
  INSURANCE:    'bg-blue-100 text-blue-700',
  CREDIT_CARD:  'bg-purple-100 text-purple-700',
  CARD:         'bg-purple-100 text-purple-700',
  DEBT:         'bg-red-100 text-red-600',
  MIXED:        'bg-amber-100 text-amber-700',
};

const statusStyle: Record<string, string> = {
  COMPLETED:         'bg-emerald-100 text-emerald-700',
  PENDING:           'bg-yellow-100 text-yellow-700',
  PROCESSING:        'bg-blue-100 text-blue-700',
  CANCELLED:         'bg-red-100 text-red-600',
  REFUNDED:          'bg-purple-100 text-purple-700',
  PARTIALLY_REFUNDED:'bg-violet-100 text-violet-700',
};

// ── types ─────────────────────────────────────────────────────────────────────

type Sale = {
  id: string;
  saleNumber: string;
  invoiceNumber?: string;
  customer: { name: string; email?: string; phone?: string };
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

// ── KPI card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  trend: string;
  trendUp?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, iconBg, label, value, trend, trendUp }) => (
  <div className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex-1 min-w-[180px]">
    <div className={cn('p-3 rounded-xl', iconBg)}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className={cn('text-xs font-semibold flex items-center gap-0.5 mt-0.5', trendUp ? 'text-emerald-600' : 'text-gray-400')}>
        {trendUp && <ArrowUpRight className="h-3 w-3" />}
        {trend}
      </p>
    </div>
  </div>
);

// ── main component ────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState({ totalSales: 0, totalCustomers: 0, totalItemsSold: 0, totalReceipts: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
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
  const [isRefunding, setIsRefunding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getSales({
        page: currentPage,
        limit: pageSize,
        search: searchTerm,
        status: statusFilter,
        paymentType: paymentFilter,
        startDate,
        endDate,
      }) as any;

      const list: Sale[] = Array.isArray(response?.data) ? response.data
        : Array.isArray(response) ? response : [];

      setSales(list);

      const pagination = response?.pagination;
      const pages = typeof pagination?.totalPages === 'number' && pagination.totalPages >= 1
        ? pagination.totalPages : 1;
      setTotalPages(pages);
      setTotalCount(pagination?.total ?? list.length);

      // compute KPIs from current response
      const totalSalesAmt = list.reduce((s: number, sale: Sale) => s + parseFloat(sale.totalAmount || '0'), 0);
      const uniqueCustomers = new Set(list.map((s: Sale) => s.customer?.name)).size;
      const itemsSold = list.reduce((s: number, sale: Sale) => s + sale.saleItems.reduce((ss, i) => ss + i.quantity, 0), 0);
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
  }, [currentPage, pageSize, searchTerm, statusFilter, paymentFilter, startDate, endDate]);

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
    setIsRefundModalOpen(true);
  };

  const handleRefundSubmit = async () => {
    if (!saleToRefund) return;
    if (!refundReason.trim()) { toast.error(t('sales.reasonRequired') || 'Refund reason is required'); return; }
    try {
      setIsRefunding(true);
      await apiClient.refundSale(saleToRefund.id, { reason: refundReason });
      toast.success(t('sales.refundSuccess'));
      await fetchSales();
      setIsRefundModalOpen(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('sales.refundError');
      toast.error(msg);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleDownloadInvoice = async (sale: Sale) => {
    setIsDownloadingInvoice(sale.id);
    try {
      const qrDataUrl = await buildInvoiceQrDataUrl(fiscalBlockFromSale(sale));
      const blob = await pdf(<SalesInvoicePDF
        sale={sale}
        organizationName={organization?.name}
        organizationLogo={organization?.avatar}
        organizationTin={(organization as any)?.TIN ?? (organization as any)?.tin}
        organizationAddress={(organization as any)?.address}
        organizationPhone={(organization as any)?.phone}
        organizationEmail={(organization as any)?.email}
        organizationVrn={(organization as any)?.VRN}
        qrDataUrl={qrDataUrl}
      />).toBlob();
      saveAs(blob, `invoice-${sale.saleNumber}.pdf`);
      toast.success(t('sales.invoiceDownloadSuccess'));
    } catch {
      toast.error(t('sales.invoiceGenerationError'));
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  const resetFilters = () => {
    setStartDate(''); setEndDate(''); setStatusFilter('');
    setPaymentFilter(''); setSearchTerm(''); setCurrentPage(1);
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-2xl bg-blue-50">
            <TrendingUp className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('sales.salesHistory')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('sales.salesHistoryDesc')}</p>
          </div>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="flex gap-4 flex-wrap">
        <KpiCard
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Total Sales"
          value={`RF ${stats.totalSales.toLocaleString()}`}
          trend="12% vs last week"
          trendUp
        />
        <KpiCard
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Total Customers"
          value={stats.totalCustomers.toString()}
          trend="8% vs last week"
          trendUp
        />
        <KpiCard
          icon={<Package className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
          label="Total Items Sold"
          value={stats.totalItemsSold.toString()}
          trend="14% vs last week"
          trendUp
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label="Total Receipts"
          value={stats.totalReceipts.toString()}
          trend="0% vs last week"
          trendUp={false}
        />
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Start Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all w-38"
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all w-38"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Method */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Method</label>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            >
              <option value="">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="INSURANCE">Insurance</option>
              <option value="DEBT">Debt</option>
              <option value="MIXED">Mixed</option>
            </select>
          </div>

          {/* Reset */}
          {(startDate || endDate || statusFilter || paymentFilter || searchTerm) && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 px-3 rounded-xl text-sm font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 border border-gray-200 transition-colors flex items-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </button>
          )}

          {/* Search + New Sale */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search sales by invoice, customer..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="h-9 pl-9 pr-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard/sales/pos')}
              className="h-9 flex items-center gap-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm shadow-blue-500/20"
            >
              <Plus className="h-4 w-4" />
              New Sale
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={6} columns={9} rowHeight="h-4" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Receipt className="h-12 w-12" />
            <p className="text-sm">{t('sales.noSalesFound')}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-gray-50 border-b border-gray-100">
              <TableRow className="hover:bg-transparent">
                {['Time', 'Sale Number', 'Customer', 'Items', 'Tax', 'Method', 'Paid', 'Debt', 'Status', 'Total', 'Actions'].map(h => (
                  <TableHead key={h} className="text-xs font-semibold text-gray-600 whitespace-nowrap py-3">
                    <span className="flex items-center gap-1">
                      {h}
                      {['Time', 'Sale Number', 'Customer', 'Items', 'Method', 'Paid', 'Debt', 'Status', 'Total'].includes(h) && (
                        <svg className="h-3 w-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map(sale => {
                const itemCount = sale.saleItems.reduce((s, i) => s + i.quantity, 0);
                const paid = parseFloat(sale.cashAmount) + parseFloat(sale.insuranceAmount);
                const debt = parseFloat(sale.debtAmount);
                const vat = parseFloat(sale.vatAmount ?? '0');

                return (
                  <TableRow
                    key={sale.id}
                    className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer"
                    onClick={() => handleViewSale(sale.id)}
                  >
                    {/* Time */}
                    <TableCell className="py-3.5 text-xs text-gray-500 whitespace-nowrap">
                      <p className="font-medium text-gray-700">{format(new Date(sale.createdAt), 'EEE, MMM d')}</p>
                      <p>{format(new Date(sale.createdAt), 'HH:mm')}</p>
                    </TableCell>

                    {/* Sale number */}
                    <TableCell className="py-3.5">
                      <button
                        onClick={e => { e.stopPropagation(); handleViewSale(sale.id); }}
                        className="text-xs font-mono font-semibold text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                      >
                        {sale.invoiceNumber || sale.saleNumber}
                      </button>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <UserCircle className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800 whitespace-nowrap">{sale.customer.name}</p>
                          {sale.customer.phone && <p className="text-[10px] text-gray-400">{sale.customer.phone}</p>}
                        </div>
                      </div>
                    </TableCell>

                    {/* Items */}
                    <TableCell className="py-3.5 text-sm font-medium text-gray-700">{itemCount}</TableCell>

                    {/* Tax */}
                    <TableCell className="py-3.5">
                      {vat > 0 ? (
                        <span className="text-xs font-semibold text-blue-600 tabular-nums">RF {vat.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </TableCell>

                    {/* Method */}
                    <TableCell className="py-3.5">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide',
                        methodStyle[sale.paymentType] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {sale.paymentType === 'MOBILE_MONEY' ? 'MOBILE\nMONEY' : getPaymentMethodLabel(sale.paymentType)}
                      </span>
                    </TableCell>

                    {/* Paid */}
                    <TableCell className="py-3.5">
                      <div>
                        <span className="text-sm font-semibold text-gray-800 tabular-nums">{fmtCurrency(paid)}</span>
                        {sale.paymentType === 'MIXED' && <p className="text-[10px] text-gray-400 mt-0.5">Total</p>}
                      </div>
                    </TableCell>

                    {/* Debt */}
                    <TableCell className="py-3.5">
                      {debt > 0 ? (
                        <span className="text-sm font-bold text-rose-500 tabular-nums">{fmtCurrency(debt)}</span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3.5">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold',
                        statusStyle[sale.status] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {sale.status.charAt(0) + sale.status.slice(1).toLowerCase().replace('_', ' ')}
                      </span>
                    </TableCell>

                    {/* Total */}
                    <TableCell className="py-3.5">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{fmtCurrency(sale.totalAmount)}</span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleViewSale(sale.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); setOpenRowMenu(openRowMenu === sale.id ? null : sale.id); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openRowMenu === sale.id && (
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-100 z-30 py-1 text-sm">
                              <button
                                onClick={() => { handleDownloadInvoice(sale); setOpenRowMenu(null); }}
                                disabled={isDownloadingInvoice === sale.id}
                                className="w-full text-left px-3 py-2 flex items-center gap-2 text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                {isDownloadingInvoice === sale.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Download className="h-3.5 w-3.5" />}
                                Download Invoice
                              </button>
                              {sale.status === 'COMPLETED' && (
                                <button
                                  onClick={() => { handleOpenRefundModal(sale); setOpenRowMenu(null); }}
                                  className="w-full text-left px-3 py-2 flex items-center gap-2 text-amber-600 hover:bg-amber-50 transition-colors"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Refund Sale
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
        {!isLoading && sales.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} transactions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1 || isLoading}
                className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      'h-8 w-8 rounded-lg text-xs font-semibold transition-colors',
                      currentPage === page
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-100',
                    )}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages || isLoading}
                className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Per-page selector */}
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="h-8 pl-2 pr-6 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all appearance-none"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Sale detail drawer ───────────────────────────────────────────── */}
      <Drawer open={!!selectedSale} onOpenChange={open => !open && setSelectedSale(null)}>
        <DrawerContent className="sm:max-w-2xl bg-white overflow-y-auto">
          <DrawerHeader className="border-b border-gray-100 px-5 py-4">
            <DrawerTitle className="text-base font-bold text-gray-900">
              {t('sales.saleDetails') || 'Sale Details'}
            </DrawerTitle>
            <DrawerDescription className="text-xs text-gray-400 mt-0.5">
              {selectedSale?.invoiceNumber || selectedSale?.saleNumber}
            </DrawerDescription>
          </DrawerHeader>

          {selectedSale && (
            <div className="px-5 py-4 space-y-5">
              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t('sales.table.dateTime'), value: format(new Date(selectedSale.createdAt), 'MMM d, yyyy HH:mm') },
                  { label: t('sales.table.customer'), value: selectedSale.customer.name },
                  { label: t('sales.table.method'), value: getPaymentMethodLabel(selectedSale.paymentType) },
                  { label: t('sales.table.status'), value: selectedSale.status },
                ].map(m => (
                  <div key={m.label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-medium text-gray-400 mb-0.5">{m.label}</p>
                    <p className="text-xs font-bold text-gray-800">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                  {t('sales.table.items')} ({selectedSale.saleItems.length})
                </h4>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="text-xs">{t('inventory.product')}</TableHead>
                        <TableHead className="text-xs text-right">{t('inventory.qty')}</TableHead>
                        <TableHead className="text-xs text-right">{t('inventory.unitPrice')}</TableHead>
                        <TableHead className="text-xs text-right">{t('sales.table.tax') || 'Tax'}</TableHead>
                        <TableHead className="text-xs text-right">{t('common.total')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSale.saleItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm font-medium">
                            {item.serviceName || item.product?.name || 'Service'}
                            {item.taxCode && (
                              <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-400">{item.taxCode}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-right">{item.quantity}</TableCell>
                          <TableCell className="text-sm text-right">{fmtCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-sm text-right">
                            {parseFloat(item.taxAmount ?? '0') > 0
                              ? <span className="text-blue-600">{fmtCurrency(item.taxAmount!)}</span>
                              : <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell className="text-sm text-right font-semibold">{fmtCurrency(item.totalPrice)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment breakdown */}
              {getPaymentMethods(selectedSale).length > 1 && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 space-y-2">
                  <p className="text-xs font-bold text-gray-700 mb-2">{t('sales.paymentBreakdown') || 'Payment Breakdown'}</p>
                  {getPaymentMethods(selectedSale).map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{getPaymentMethodLabel(p.method)}</span>
                      <span className={cn('font-semibold', p.method === 'DEBT' ? 'text-amber-600' : 'text-gray-800')}>
                        {fmtCurrency(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                {parseFloat(selectedSale.vatAmount ?? '0') > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax (VAT)</span>
                    <span className="font-semibold text-blue-600">{fmtCurrency(selectedSale.vatAmount!)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Total</span>
                  <span className="text-xl font-bold text-gray-900">{fmtCurrency(selectedSale.totalAmount)}</span>
                </div>
              </div>
            </div>
          )}

          <DrawerFooter className="border-t border-gray-100 px-5 py-4 flex-row gap-2">
            <button
              onClick={() => setSelectedSale(null)}
              className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t('common.close')}
            </button>
            {selectedSale && (
              <button
                onClick={() => handleDownloadInvoice(selectedSale)}
                disabled={isDownloadingInvoice === selectedSale?.id}
                className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                {isDownloadingInvoice === selectedSale?.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
                {t('sales.downloadInvoice') || 'Download PDF'}
              </button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Refund drawer ────────────────────────────────────────────────── */}
      <Drawer open={isRefundModalOpen} onOpenChange={setIsRefundModalOpen}>
        <DrawerContent className="sm:max-w-lg bg-white">
          <DrawerHeader>
            <DrawerTitle>{t('sales.processRefund', { number: saleToRefund?.saleNumber })}</DrawerTitle>
            <DrawerDescription>{t('sales.refundDesc')}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-sm text-amber-800 font-medium">{t('sales.fullRefundOnlyNote')}</p>
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
          </div>
          <DrawerFooter className="flex-row gap-2 border-t border-gray-100 px-5 py-4">
            <button
              onClick={() => setIsRefundModalOpen(false)}
              className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleRefundSubmit}
              disabled={isRefunding}
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
            >
              {isRefunding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('sales.processRefund') || 'Process Refund'}
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
