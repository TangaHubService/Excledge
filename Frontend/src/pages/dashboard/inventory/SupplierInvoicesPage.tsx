import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ScanLine,
  Search,
  Trash2,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { CardContent } from '../../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { apiClient } from '../../../lib/api-client';
import { useTheme } from '../../../context/ThemeContext';
import { cn } from '../../../lib/utils';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";
import { format } from 'date-fns';
import { PageHeader } from "../../../components/common/PageHeader";

type InvoiceStatus = 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'APPROVED' | 'IMPORTED' | 'FAILED';

interface SupplierInvoice {
  id: number;
  invoiceNumber?: string;
  supplierName?: string;
  currency: string;
  totalAmount?: number;
  status: InvoiceStatus;
  createdAt: string;
  importedAt?: string;
  _count: { items: number };
  supplier?: { id: number; name: string };
  createdBy: { id: number; name: string };
  files: Array<{ id: number; originalName: string; mimeType: string }>;
}

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; icon: React.ReactNode; className: string }> = {
  DRAFT: { label: 'Draft', icon: <FileText className="size-3" />, className: 'bg-muted text-foreground' },
  PROCESSING: { label: 'Processing', icon: <Loader2 className="size-3 animate-spin" />, className: 'bg-primary/15 text-primary' },
  REVIEW: { label: 'Review', icon: <Clock className="size-3" />, className: 'bg-warning/15 text-warning dark:bg-warning/40 dark:text-yellow-300' },
  APPROVED: { label: 'Approved', icon: <CheckCircle2 className="size-3" />, className: 'bg-success/15 text-success dark:bg-success/40 dark:text-green-300' },
  IMPORTED: { label: 'Imported', icon: <Package className="size-3" />, className: 'bg-purple-500/15 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  FAILED: { label: 'Failed', icon: <AlertCircle className="size-3" />, className: 'bg-danger/15 text-danger dark:bg-danger/40 dark:text-red-300' },
};

export const SupplierInvoicesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const organizationId = apiClient.getOrganizationId();

  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pagination, setPagination] = useState({ totalItems: 0, totalPages: 1, currentPage: 1 });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const isDark = theme === 'dark';

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getSupplierInvoices(organizationId, {
        status: statusFilter || undefined,
        page,
        limit: 15,
        search: search || undefined,
        sortBy,
        sortOrder,
      });
      setInvoices(res?.data?.data || []);
      setPagination(res?.data?.pagination || { totalItems: 0, totalPages: 1, currentPage: 1 });
    } catch {
      toast.error(t('invoiceScanner.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter, page, search, sortBy, sortOrder]);

  const sortHeader = (label: string, key: string) => (
    <th
      className="px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none"
      aria-sort={sortBy === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
      onClick={() => {
        setSortOrder(sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc');
        setSortBy(key);
        setPage(1);
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy !== key ? <ChevronsUpDown className="size-3 opacity-40" /> : sortOrder === 'asc'
          ? <ChevronUp className="size-3 text-primary" />
          : <ChevronDown className="size-3 text-primary" />}
      </span>
    </th>
  );

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await apiClient.deleteSupplierInvoice(organizationId, id);
      toast.success(t('invoiceScanner.deleteSuccess'));
      setConfirmDeleteId(null);
      fetchInvoices();
    } catch (err: any) {
      toastError(err, t('invoiceScanner.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={t('invoiceScanner.supplierInvoices')}
        description={t('invoiceScanner.subtitle')}
        actions={
          <>
            <Button
              onClick={() => navigate('/dashboard/scan-invoice')}
              className="gap-2 bg-card text-primary hover:bg-card/90 font-semibold shadow-sm self-start sm:self-auto"
            >
              <ScanLine className="size-4" />
              {t('invoiceScanner.scanInvoice')}
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <Filter className="size-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder={t('common.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.allStatuses')}</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchInvoices} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScanLine className="size-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t('invoiceScanner.noInvoices')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('invoiceScanner.createFirst')}</p>
              <Button className="mt-4 gap-2" onClick={() => navigate('/dashboard/scan-invoice')}>
                <ScanLine className="size-4" />
                {t('invoiceScanner.scanInvoice')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn('border-b text-left', isDark ? 'border-gray-700' : 'border-border')}>
                    {sortHeader(t('invoiceScanner.invoiceNumber'), 'invoiceNumber')}
                    {sortHeader(t('invoiceScanner.supplierName'), 'supplierName')}
                    <th className="px-4 py-3 font-medium text-muted-foreground">{t('invoiceScanner.items')}</th>
                    {sortHeader(t('common.total'), 'totalAmount')}
                    {sortHeader(t('common.status'), 'status')}
                    {sortHeader(t('common.date'), 'createdAt')}
                    <th className="px-4 py-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const sc = STATUS_CONFIG[inv.status];
                    return (
                      <tr
                        key={inv.id}
                        className={cn(
                          'border-b transition-colors',
                          isDark ? 'border-gray-700 hover:bg-gray-800/50' : 'border-border hover:bg-muted'
                        )}
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {inv.invoiceNumber || `#${inv.id}`}
                        </td>
                        <td className="px-4 py-3">
                          {inv.supplierName || inv.supplier?.name || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1">
                            <Package className="size-3 text-muted-foreground" />
                            {inv._count.items}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {inv.totalAmount != null
                            ? `${inv.currency} ${Number(inv.totalAmount).toLocaleString()}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', sc.className)}>
                            {sc.icon}
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {format(new Date(inv.createdAt), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {inv.status === 'REVIEW' && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => navigate(`/dashboard/scan-invoice/${inv.id}`)}
                              >
                                {t('common.edit')}
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => navigate(`/dashboard/scan-invoice/${inv.id}`)}
                              title={t('common.view')}
                            >
                              <Eye className="size-4" />
                            </Button>
                            {inv.status !== 'IMPORTED' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setConfirmDeleteId(inv.id)}
                                title={t('common.delete')}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t('common.showing')} {(page - 1) * 15 + 1}–{Math.min(page * 15, pagination.totalItems)} {t('common.of')} {pagination.totalItems}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoiceScanner.deleteConfirm')}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deletingId === confirmDeleteId}
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            >
              {deletingId === confirmDeleteId ? <Loader2 className="size-4 animate-spin" /> : t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplierInvoicesPage;
