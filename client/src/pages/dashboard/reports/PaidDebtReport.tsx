import { useState, useEffect } from 'react';
import { DollarSign, TrendingDown, Users, Calendar } from 'lucide-react';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { useTranslation } from 'react-i18next';

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
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    useEffect(() => {
        fetchDebtPayments();
    }, [startDate, endDate]);

    const fetchDebtPayments = async () => {
        try {
            setLoading(true);
            const data = await apiClient.getDebtPaymentsReport(startDate, endDate);
            setPayments(data.payments);
            setSummary(data.summary);
        } catch (error) {
            console.error('Error fetching debt payments:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('debtReports.title')}</h1>
                <p className="text-gray-600 dark:text-gray-400">{t('debtReports.description')}</p>
            </div>

            {/* Date Filters */}
            <div className="flex gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('debtReports.startDate')}
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('debtReports.endDate')}
                    </label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('debtReports.totalPaid')}</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {formatCurrency(summary.totalPaid)}
                            </p>
                        </div>
                        <DollarSign className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('debtReports.payments')}</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                {summary.paymentsCount}
                            </p>
                        </div>
                        <TrendingDown className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('debtReports.avgPayment')}</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                {formatCurrency(summary.avgPayment)}
                            </p>
                        </div>
                        <Users className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('debtReports.remainingDebt')}</p>
                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                {formatCurrency(summary.remainingDebt)}
                            </p>
                        </div>
                        <Calendar className="h-8 w-8 text-red-600 dark:text-red-400" />
                    </div>
                </div>
            </div>

            {/* Payments Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('debtReports.paymentHistory')}
                    </h2>

                    {loading ? (
                        <TableSkeleton rows={5} columns={7} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="text-left py-3 px-4 text-gray-600 dark:text-white">{t('debtReports.dateTime')}</th>
                                        <th className="text-left py-3 px-4 text-gray-600 dark:text-white">{t('common.customer')}</th>
                                        <th className="text-left py-3 px-4 text-gray-600 dark:text-white">{t('common.phone')}</th>
                                        <th className="text-right py-3 px-4 text-gray-600 dark:text-white">{t('debtReports.amountPaid')}</th>
                                        <th className="text-left py-3 px-4 text-gray-600 dark:text-white">{t('debtReports.paymentMethod')}</th>
                                        <th className="text-left py-3 px-4 text-gray-600 dark:text-white">{t('debtReports.recordedBy')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className="border-b border-gray-100 dark:border-gray-700">
                                            <td className="py-3 px-4 text-gray-800 dark:text-white">
                                                {new Date(payment.paymentDate).toLocaleString('en-CA', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: false
                                                })}
                                            </td>
                                            <td className="py-3 px-4 text-gray-800 dark:text-white">{payment.customerName}</td>
                                            <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{payment.customerPhone}</td>
                                            <td className="py-3 px-4 text-right font-semibold text-green-600 dark:text-green-400">
                                                {formatCurrency(payment.amountPaid)}
                                            </td>
                                            <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{payment.paymentMethod}</td>
                                            <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{payment.recordedBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Total Row */}
                                <tfoot className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <td className="py-3 px-4 font-bold text-gray-900 dark:text-white" colSpan={3}>{t('debtReports.total')}</td>
                                        <td className="py-3 px-4 text-right font-bold text-green-600 dark:text-green-400">
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
        </div>
    );
};
