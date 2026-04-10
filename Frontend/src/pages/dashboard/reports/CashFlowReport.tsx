import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, CheckCircle, PlusCircle, Receipt, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { toast } from 'react-toastify';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';

interface CashFlowItem {
    date: string;
    description: string;
    type: 'INFLOW' | 'OUTFLOW';
    category: string;
    subcategory: string;
    amount: number;
    balance: number;
    paymentMethod: string;
    reference: string;
}

interface CashFlowSummary {
    openingBalance: number;
    totalInflows: number;
    totalOutflows: number;
    netCashFlow: number;
    closingBalance: number;
}

interface CashFlowVerification {
    formula: string;
    calculated: number;
    actual: number;
    balanced: boolean;
}

interface CashFlowResponse {
    summary: CashFlowSummary;
    transactions: CashFlowItem[];
    verification: CashFlowVerification;
}

export const CashFlowReport = () => {
    const { t } = useTranslation();
    const [transactions, setTransactions] = useState<CashFlowItem[]>([]);
    const [summary, setSummary] = useState<CashFlowSummary>({
        openingBalance: 0,
        totalInflows: 0,
        totalOutflows: 0,
        netCashFlow: 0,
        closingBalance: 0
    });
    const [verification, setVerification] = useState<CashFlowVerification | null>(null);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState('2026-01-01');
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [transactionType, setTransactionType] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');

    // Modal states
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

    // Form states
    const [expenseForm, setExpenseForm] = useState({
        category: 'OTHER',
        amount: '',
        paymentMethod: 'CASH',
        description: '',
        expenseDate: new Date().toISOString().split('T')[0],
        reference: ''
    });

    const [paymentForm, setPaymentForm] = useState({
        purchaseOrderId: '',
        amount: '',
        paymentMethod: 'CASH',
        paymentDate: new Date().toISOString().split('T')[0],
        reference: '',
        notes: ''
    });

    const filteredTransactions = transactions.filter(t => {
        // Payment method filter
        if (transactionType !== 'ALL') {
            if (transactionType === 'CASH' && t.paymentMethod !== 'CASH') return false;
            if (transactionType === 'MOBILE_MONEY' && !['MOBILE_MONEY', 'MOMO', 'AIRTEL', 'MTN'].includes(t.paymentMethod)) return false;
            if (transactionType === 'BANK' && !['BANK', 'CARD', 'CREDIT_CARD'].includes(t.paymentMethod)) return false;
        }

        // Category filter
        if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;

        return true;
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-RW', {
            style: 'currency',
            currency: 'RWF',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    useEffect(() => {
        fetchCashFlow();
    }, [startDate, endDate]);

    const fetchCashFlow = async () => {
        try {
            setLoading(true);
            const data = await apiClient.getCashFlowReport(startDate, endDate) as CashFlowResponse;
            setTransactions(data.transactions || []);
            setSummary(data.summary || {
                openingBalance: 0,
                totalInflows: 0,
                totalOutflows: 0,
                netCashFlow: 0,
                closingBalance: 0
            });
            setVerification(data.verification || null);
        } catch (error) {
            console.error('Error fetching cash flow:', error);
            toast.error('Failed to load cash flow data');
        } finally {
            setLoading(false);
        }
    };

    const fetchPurchaseOrders = async () => {
        try {
            const orgId = apiClient.getOrganizationId();
            const data = await apiClient.getPurchaseOrders(orgId) as any;
            // Only show orders that are not fully paid
            // Note: Our current orders might not have a payment status in the standard list, 
            // but we'll show all and let the backend validate if we don't have that info yet.
            setPurchaseOrders(data || []);
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
        }
    };

    const handleCreateExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await apiClient.createExpense({
                ...expenseForm,
                amount: parseFloat(expenseForm.amount)
            });
            toast.success(t('expenses.success'));
            setIsExpenseModalOpen(false);
            fetchCashFlow();
            setExpenseForm({
                category: 'OTHER',
                amount: '',
                paymentMethod: 'CASH',
                description: '',
                expenseDate: new Date().toISOString().split('T')[0],
                reference: ''
            });
        } catch (error: any) {
            toast.error(error.message || t('expenses.error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await apiClient.recordSupplierPayment({
                ...paymentForm,
                amount: parseFloat(paymentForm.amount),
                purchaseOrderId: parseInt(paymentForm.purchaseOrderId)
            });
            toast.success(t('supplierPayments.success'));
            setIsPaymentModalOpen(false);
            fetchCashFlow();
            setPaymentForm({
                purchaseOrderId: '',
                amount: '',
                paymentMethod: 'CASH',
                paymentDate: new Date().toISOString().split('T')[0],
                reference: '',
                notes: ''
            });
        } catch (error: any) {
            toast.error(error.message || t('supplierPayments.error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const openPaymentModal = () => {
        fetchPurchaseOrders();
        setIsPaymentModalOpen(true);
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('cashFlowReport.title')}</h1>
                    <p className="text-gray-600 dark:text-gray-400">{t('cashFlowReport.description')}</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                    >
                        <PlusCircle size={20} />
                        {t('cashFlowReport.recordExpense')}
                    </Button>
                    <Button
                        onClick={openPaymentModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                    >
                        <Receipt size={20} />
                        {t('cashFlowReport.recordSupplierPayment')}
                    </Button>
                </div>
            </div>

            {/* Balance Verification Alert */}
            {verification && !verification.balanced && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
                    <div className="flex-1">
                        <h3 className="text-red-800 dark:text-red-200 font-semibold">Balance Mismatch Detected!</h3>
                        <p className="text-red-700 dark:text-red-300 text-sm mt-1">
                            Formula: {verification.formula}
                        </p>
                        <p className="text-red-700 dark:text-red-300 text-sm">
                            Calculated: {formatCurrency(verification.calculated)} | Actual: {formatCurrency(verification.actual)}
                        </p>
                    </div>
                </div>
            )}

            {verification && verification.balanced && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" size={20} />
                    <div className="flex-1">
                        <h3 className="text-green-800 dark:text-green-200 font-semibold">Balance Verified ✓</h3>
                        <p className="text-green-700 dark:text-green-300 text-sm">
                            {verification.formula} = {formatCurrency(verification.calculated)}
                        </p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('common.startDate')}
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('common.endDate')}
                    </label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Payment Method
                    </label>
                    <select
                        value={transactionType}
                        onChange={(e) => setTransactionType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    >
                        <option value="ALL">All Methods</option>
                        <option value="CASH">Cash</option>
                        <option value="MOBILE_MONEY">Mobile Money</option>
                        <option value="BANK">Bank/Card</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Category
                    </label>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                    >
                        <option value="ALL">All Categories</option>
                        <option value="Sales">Sales</option>
                        <option value="Debt Collection">Debt Collection</option>
                        <option value="Inventory Purchase">Inventory Purchase</option>
                        <option value="Refunds">Refunds</option>
                        <option value="Operating Expenses">Operating Expenses</option>
                    </select>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('cashFlowReport.openingBalance')}</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(summary.openingBalance)}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('cashFlowReport.totalInflows')}</p>
                            <p className="text-lg font-semibold text-green-600 dark:text-green-400">{formatCurrency(summary.totalInflows)}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
                            <TrendingDown size={20} />
                        </div>
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('cashFlowReport.totalOutflows')}</p>
                            <p className="text-lg font-semibold text-red-600 dark:text-red-400">{formatCurrency(summary.totalOutflows)}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <Activity size={20} />
                        </div>
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium">{t('cashFlowReport.netCashFlow')}</p>
                            <p className={`text-lg font-semibold ${summary.netCashFlow >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatCurrency(summary.netCashFlow)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-200 dark:shadow-none">
                            <DollarSign size={20} />
                        </div>
                        <div>
                            <p className="text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">{t('cashFlowReport.closingBalance')}</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{formatCurrency(summary.closingBalance)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cash Flow Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        {t('cashFlowReport.transactionHistory')}
                    </h2>

                    {loading ? (
                        <TableSkeleton rows={5} columns={7} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Date</th>
                                        <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Description</th>
                                        <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Category</th>
                                        <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Subcategory</th>
                                        <th className="text-center py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Type</th>
                                        <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Amount</th>
                                        <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{startDate}</td>
                                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-white" colSpan={4}>{t('cashFlowReport.openingBalance')}</td>
                                        <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                                            {formatCurrency(summary.openingBalance)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                                            {formatCurrency(summary.openingBalance)}
                                        </td>
                                    </tr>

                                    {filteredTransactions.map((transaction, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{transaction.date}</td>
                                            <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{transaction.description || '-'}</td>
                                            <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{transaction.category || '-'}</td>
                                            <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{transaction.subcategory || '-'}</td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${transaction.type === 'INFLOW'
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                    }`}>
                                                    {transaction.type}
                                                </span>
                                            </td>
                                            <td className={`py-3 px-4 text-right font-medium ${transaction.type === 'INFLOW'
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                {transaction.type === 'INFLOW' ? '+' : ''}{formatCurrency(Math.abs(transaction.amount))}
                                            </td>
                                            <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-300">
                                                {formatCurrency(transaction.balance)}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Closing Balance */}
                                    <tr className="bg-blue-50/50 dark:bg-blue-900/10 border-t border-gray-200 dark:border-gray-700">
                                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{endDate}</td>
                                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white" colSpan={4}>{t('cashFlowReport.closingBalance')}</td>
                                        <td className="py-3 px-4 text-right font-semibold text-blue-600 dark:text-blue-400">
                                            {formatCurrency(summary.closingBalance)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-blue-400 text-base">
                                            {formatCurrency(summary.closingBalance)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Expense Modal */}
            <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
                <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-900 dark:text-white">
                    <DialogHeader>
                        <DialogTitle>{t('expenses.addExpense')}</DialogTitle>
                        <DialogDescription>
                            Record a new operating expense for your business.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateExpense} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="category">{t('expenses.category')}</Label>
                                <Select
                                    value={expenseForm.category}
                                    onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}
                                >
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-gray-800 border dark:border-gray-700">
                                        <SelectItem value="SALARIES">{t('expenses.categories.SALARIES')}</SelectItem>
                                        <SelectItem value="RENT">{t('expenses.categories.RENT')}</SelectItem>
                                        <SelectItem value="UTILITIES">{t('expenses.categories.UTILITIES')}</SelectItem>
                                        <SelectItem value="TRANSPORT">{t('expenses.categories.TRANSPORT')}</SelectItem>
                                        <SelectItem value="MARKETING">{t('expenses.categories.MARKETING')}</SelectItem>
                                        <SelectItem value="TAXES">{t('expenses.categories.TAXES')}</SelectItem>
                                        <SelectItem value="MAINTENANCE">{t('expenses.categories.MAINTENANCE')}</SelectItem>
                                        <SelectItem value="OTHER">{t('expenses.categories.OTHER')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">{t('expenses.amount')} (RWF)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    required
                                    value={expenseForm.amount}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                    placeholder="0"
                                    className="bg-white dark:bg-gray-800"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="method">{t('expenses.paymentMethod')}</Label>
                                <Select
                                    value={expenseForm.paymentMethod}
                                    onValueChange={(v) => setExpenseForm({ ...expenseForm, paymentMethod: v })}
                                >
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-gray-800 border dark:border-gray-700">
                                        <SelectItem value="CASH">{t('pos.paymentMethods.CASH')}</SelectItem>
                                        <SelectItem value="MOBILE_MONEY">{t('pos.paymentMethods.MOBILE_MONEY')}</SelectItem>
                                        <SelectItem value="BANK">Bank Transfer</SelectItem>
                                        <SelectItem value="CREDIT_CARD">{t('pos.paymentMethods.CREDIT_CARD')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">{t('expenses.expenseDate')}</Label>
                                <Input
                                    id="date"
                                    type="date"
                                    required
                                    value={expenseForm.expenseDate}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                                    className="bg-white dark:bg-gray-800"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="desc">{t('expenses.description')}</Label>
                            <Input
                                id="desc"
                                required
                                value={expenseForm.description}
                                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                                placeholder="What was this for?"
                                className="bg-white dark:bg-gray-800"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ref">{t('expenses.reference')} (Optional)</Label>
                            <Input
                                id="ref"
                                value={expenseForm.reference}
                                onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })}
                                placeholder="Invoice or Receipt #"
                                className="bg-white dark:bg-gray-800"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsExpenseModalOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-red-600 hover:bg-red-700 text-white">
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('common.save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Record Supplier Payment Modal */}
            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-900 dark:text-white">
                    <DialogHeader>
                        <DialogTitle>{t('supplierPayments.recordPayment')}</DialogTitle>
                        <DialogDescription>
                            Record a payment made to a supplier for a purchase order.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRecordPayment} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="po">{t('supplierPayments.purchaseOrder')}</Label>
                            <Select
                                value={paymentForm.purchaseOrderId}
                                onValueChange={(v) => setPaymentForm({ ...paymentForm, purchaseOrderId: v })}
                                required
                            >
                                <SelectTrigger className="bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Select Purchase Order" />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-gray-800 max-h-[200px] border dark:border-gray-700">
                                    {purchaseOrders.length === 0 ? (
                                        <div className="p-2 text-sm text-gray-500 text-center">No orders found</div>
                                    ) : (
                                        purchaseOrders.map(po => (
                                            <SelectItem key={po.id} value={po.id.toString()}>
                                                PO #{po.orderNumber} - {po.supplier?.name} ({formatCurrency(po.totalAmount)})
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="pay-method">{t('supplierPayments.paymentMethod')}</Label>
                                <Select
                                    value={paymentForm.paymentMethod}
                                    onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}
                                >
                                    <SelectTrigger className="bg-white dark:bg-gray-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-gray-800 border dark:border-gray-700">
                                        <SelectItem value="CASH">{t('pos.paymentMethods.CASH')}</SelectItem>
                                        <SelectItem value="MOBILE_MONEY">{t('pos.paymentMethods.MOBILE_MONEY')}</SelectItem>
                                        <SelectItem value="BANK">Bank Transfer</SelectItem>
                                        <SelectItem value="CREDIT_CARD">{t('pos.paymentMethods.CREDIT_CARD')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay-amount">{t('supplierPayments.amount')} (RWF)</Label>
                                <Input
                                    id="pay-amount"
                                    type="number"
                                    required
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    placeholder="0"
                                    className="bg-white dark:bg-gray-800"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="pay-date">{t('supplierPayments.paymentDate')}</Label>
                                <Input
                                    id="pay-date"
                                    type="date"
                                    required
                                    value={paymentForm.paymentDate}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                                    className="bg-white dark:bg-gray-800"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay-ref">{t('supplierPayments.reference')} (Optional)</Label>
                                <Input
                                    id="pay-ref"
                                    value={paymentForm.reference}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                                    placeholder="TXN ID"
                                    className="bg-white dark:bg-gray-800"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pay-notes">{t('supplierPayments.notes')} (Optional)</Label>
                            <Textarea
                                id="pay-notes"
                                value={paymentForm.notes}
                                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                placeholder="Additional details..."
                                className="bg-white dark:bg-gray-800"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmitting || !paymentForm.purchaseOrderId} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('supplierPayments.recordPayment')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

