import { useState, useEffect } from 'react';
import { DollarSign, TrendingDown, Users, Calendar } from 'lucide-react';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { useTranslation } from 'react-i18next';
import { PageHeader } from "../../../components/common/PageHeader";

interface DebtPayment {
    id: string;
    customerName: string;
    customerPhone: string;
    amountPaid: number;
    paymentMethod: string;
    reference: string;
    paymentDate: string;
    recordedBy: string;
}

interface DebtSummary {
    totalPaid: number;
    paymentsCount: number;
    avgPayment: number;
    remainingDebt: number;
}

export const PaidDebtReport = () => {
    const { t } = useTranslation();
    const [payments, setPayments] = useState<DebtPayment[]>([]);
    const [summary, setSummary] = useState<DebtSummary>({
        totalPaid: 0,
        paymentsCount: 0,
        avgPayment: 0,
        remainingDebt: 0
    });
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('2025-01-01');
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-RW', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    useEffect(() => {
        fetchDebtPayments();
    }, [startDate, endDate]);

    const fetchDebtPayments = async () => {
        try {
            setLoading(true);
            const data = await apiClient.getDebtPaymentsReport(startDate, endDate);
            setPayments(data.payments || []);
            setSummary(data.summary || {
                totalPaid: 0,
                paymentsCount: 0,
                avgPayment: 0,
                remainingDebt: 0
            });
        } catch (error) {
            console.error('Error fetching debt payments:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader
              title={t('debtReports.title') || 'Paid Debt Report'}
              description={t('debtReports.description') || 'View history and metrics for collected debts'}
            />

            {/* Date Filters */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        {t('debtReports.startDate') || 'Start Date'}
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        {t('debtReports.endDate') || 'End Date'}
                    </label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        label: t('debtReports.totalPaid') || 'Total Paid',
                        value: formatCurrency(summary.totalPaid),
                        icon: DollarSign,
                        light: 'bg-success/10 dark:bg-success/20',
                        text: 'text-success dark:text-emerald-400',
                    },
                    {
                        label: t('debtReports.payments') || 'Payments Count',
                        value: summary.paymentsCount,
                        icon: TrendingDown,
                        light: 'bg-primary/10',
                        text: 'text-primary',
                    },
                    {
                        label: t('debtReports.avgPayment') || 'Avg Payment',
                        value: formatCurrency(summary.avgPayment),
                        icon: Users,
                        light: 'bg-purple-500/10 dark:bg-purple-900/20',
                        text: 'text-purple-600 dark:text-purple-400',
                    },
                    {
                        label: t('debtReports.remainingDebt') || 'Remaining Debt',
                        value: formatCurrency(summary.remainingDebt),
                        icon: Calendar,
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

            {/* Payments Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">
                        {t('debtReports.paymentHistory') || 'Payment History'}
                    </h2>
                </div>

                {loading ? (
                    <div className="p-6">
                        <TableSkeleton rows={5} columns={6} />
                    </div>
                ) : payments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                        <DollarSign className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-base font-semibold">No debt payments found</p>
                        <p className="text-sm">Try adjusting your date filters.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-surface-subtle/50 border-border text-left">
                                    <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('debtReports.dateTime') || 'Date & Time'}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.customer') || 'Customer'}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.phone') || 'Phone'}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{t('debtReports.amountPaid') || 'Amount Paid'}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('debtReports.paymentMethod') || 'Payment Method'}</th>
                                    <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('debtReports.recordedBy') || 'Recorded By'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {payments.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-surface-subtle/50 transition-colors">
                                        <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
                                            {new Date(payment.paymentDate).toLocaleString('en-CA', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: false
                                            })}
                                        </td>
                                        <td className="py-3 px-4 text-foreground font-medium">{payment.customerName}</td>
                                        <td className="py-3 px-4 text-muted-foreground">{payment.customerPhone}</td>
                                        <td className="py-3 px-4 text-right font-bold text-success dark:text-emerald-400">
                                            {formatCurrency(payment.amountPaid)}
                                        </td>
                                        <td className="py-3 px-4 text-muted-foreground">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
                                                {payment.paymentMethod}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-muted-foreground">{payment.recordedBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t bg-surface-subtle/50 border-border">
                                <tr className="font-semibold text-foreground">
                                    <td className="py-3 px-4" colSpan={3}>{t('debtReports.total') || 'Total'}</td>
                                    <td className="py-3 px-4 text-right font-bold text-success dark:text-emerald-400">
                                        {formatCurrency(payments.reduce((sum, p) => sum + p.amountPaid, 0))}
                                    </td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
