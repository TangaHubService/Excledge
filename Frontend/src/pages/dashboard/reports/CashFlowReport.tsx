import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, CheckCircle, PlusCircle, Receipt, Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TableSkeleton } from '../../../components/ui/TableSkeleton';
import { apiClient } from '../../../lib/api-client';
import { toast } from 'react-toastify';
import { toastError } from "../../../lib/friendly-error";
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerFooter } from '../../../components/ui/drawer';
import { PageHeader } from "../../../components/common/PageHeader";

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
    const [sortBy, setSortBy] = useState('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const cashFlowRequestId = useRef(0);

    // Modal states
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

    // Form states
    const [expenseForm, setExpenseForm] = useState({
        category: 'OTHER',
        otherCategory: '',
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
    }, [startDate, endDate, sortBy, sortOrder]);

    const fetchCashFlow = async () => {
        const requestId = ++cashFlowRequestId.current;
        try {
            setLoading(true);
            const data = await apiClient.getCashFlowReport(startDate, endDate, sortBy, sortOrder) as CashFlowResponse;
            if (requestId !== cashFlowRequestId.current) return;
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
            if (requestId !== cashFlowRequestId.current) return;
            console.error('Error fetching cash flow:', error);
            toast.error('Failed to load cash flow data');
        } finally {
            if (requestId === cashFlowRequestId.current) setLoading(false);
        }
    };

    const sortHeader = (label: string, key: string, align = '') => (
        <th
            className={`py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none ${align}`}
            aria-sort={sortBy === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
            onClick={() => {
                setSortOrder(sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc');
                setSortBy(key);
            }}
        >
            <span className={`inline-flex items-center gap-1 ${align === 'text-right' ? 'justify-end w-full' : align === 'text-center' ? 'justify-center w-full' : ''}`}>
                {label}
                {sortBy !== key ? <ChevronsUpDown className="size-3 opacity-40" /> : sortOrder === 'asc'
                    ? <ChevronUp className="size-3 text-primary" />
                    : <ChevronDown className="size-3 text-primary" />}
            </span>
        </th>
    );

    const fetchPurchaseOrders = async () => {
        try {
            const orgId = apiClient.getOrganizationId();
            const data = await apiClient.getPurchaseOrders(orgId) as any;
            // Only show orders that are not fully paid Note: Our current orders might not have a
            // payment status in the standard list, but we'll show all and let the backend validate
            // if we don't have that info yet.
            setPurchaseOrders(data || []);
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
        }
    };

    const handleCreateExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (expenseForm.category === 'OTHER' && !expenseForm.otherCategory.trim()) {
            toast.error(t('expenses.specifyCategory'));
            return;
        }
        try {
            setIsSubmitting(true);
            const { otherCategory, ...rest } = expenseForm;
            await apiClient.createExpense({
                ...rest,
                description: expenseForm.category === 'OTHER' && otherCategory.trim()
                    ? `[${otherCategory.trim()}] ${expenseForm.description}`.trim()
                    : expenseForm.description,
                amount: parseFloat(expenseForm.amount)
            });
            toast.success(t('expenses.success'));
            setIsExpenseModalOpen(false);
            fetchCashFlow();
            setExpenseForm({
                category: 'OTHER',
                otherCategory: '',
                amount: '',
                paymentMethod: 'CASH',
                description: '',
                expenseDate: new Date().toISOString().split('T')[0],
                reference: ''
            });
        } catch (error: any) {
            toastError(error, t('expenses.error'));
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
            toastError(error, t('supplierPayments.error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const openPaymentModal = () => {
        fetchPurchaseOrders();
        setIsPaymentModalOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader
              title={t('cashFlowReport.title') || 'Cash Flow Report'}
              description={t('cashFlowReport.description') || 'Track details of money entering and leaving your business'}
              actions={
                <>
                  <Button
                      onClick={() => setIsExpenseModalOpen(true)}
                      className="bg-danger hover:bg-danger/90 text-white shadow-sm font-semibold gap-2 border border-transparent"
                  >
                      <PlusCircle className="size-4" />
                      {t('cashFlowReport.recordExpense')}
                  </Button>
                  <Button
                      onClick={openPaymentModal}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                      <Receipt className="size-4" />
                      {t('cashFlowReport.recordSupplierPayment')}
                  </Button>
                </>
              }
            />

            {/* Balance Verification Alert */}
            {verification && !verification.balanced && (
                <div className="bg-danger/10 dark:bg-danger/20 border border-danger/25 dark:border-red-800 rounded-xl px-5 py-4 flex items-center gap-4 shadow-xs">
                    <AlertTriangle className="text-danger dark:text-red-400 shrink-0 size-5" />
                    <div className="min-w-0">
                        <h3 className="text-danger dark:text-red-200 font-semibold text-sm">Balance Mismatch Detected!</h3>
                        <p className="text-danger dark:text-red-300 text-xs leading-relaxed mt-0.5">
                            {verification.formula}: Calculated {formatCurrency(verification.calculated)} &middot; Actual {formatCurrency(verification.actual)}
                        </p>
                    </div>
                </div>
            )}

            {verification && verification.balanced && (
                <div className="bg-success/10 dark:bg-success/20 border border-success/25 dark:border-green-800 rounded-xl px-5 py-4 flex items-center gap-4 shadow-xs">
                    <CheckCircle className="text-success dark:text-green-400 shrink-0 size-5" />
                    <div className="min-w-0">
                        <h3 className="text-success dark:text-green-200 font-semibold text-sm">Balance Verified</h3>
                        <p className="text-success dark:text-green-300 text-xs leading-relaxed mt-0.5">
                            {verification.formula} = {formatCurrency(verification.calculated)}
                        </p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.startDate')}</Label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-card dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.endDate')}</Label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-card dark:text-white focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Method</Label>
                        <select
                            value={transactionType}
                            onChange={(e) => setTransactionType(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
                        >
                            <option value="ALL">All Methods</option>
                            <option value="CASH">Cash</option>
                            <option value="MOBILE_MONEY">Mobile Money</option>
                            <option value="BANK">Bank/Card</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</Label>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
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
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {[
                    {
                        label: t('cashFlowReport.openingBalance'),
                        value: formatCurrency(summary.openingBalance),
                        icon: DollarSign,
                        light: 'bg-purple-500/10 dark:bg-purple-900/20',
                        text: 'text-purple-600 dark:text-purple-400',
                    },
                    {
                        label: t('cashFlowReport.totalInflows'),
                        value: formatCurrency(summary.totalInflows),
                        icon: TrendingUp,
                        light: 'bg-success/10 dark:bg-success/20',
                        text: 'text-success dark:text-green-400',
                    },
                    {
                        label: t('cashFlowReport.totalOutflows'),
                        value: formatCurrency(summary.totalOutflows),
                        icon: TrendingDown,
                        light: 'bg-danger/10 dark:bg-danger/20',
                        text: 'text-danger dark:text-red-400',
                    },
                    {
                        label: t('cashFlowReport.netCashFlow'),
                        value: formatCurrency(summary.netCashFlow),
                        icon: Activity,
                        light: summary.netCashFlow >= 0 ? 'bg-success/10 dark:bg-success/20' : 'bg-danger/10 dark:bg-danger/20',
                        text: summary.netCashFlow >= 0 ? 'text-success dark:text-green-400' : 'text-danger dark:text-red-400',
                    },
                    {
                        label: t('cashFlowReport.closingBalance'),
                        value: formatCurrency(summary.closingBalance),
                        icon: DollarSign,
                        light: 'bg-primary/10',
                        text: 'text-primary',
                        ring: true
                    }
                ].map(({ label, value, icon: Icon, light, text, ring }) => (
                    <div
                        key={label}
                        className={`bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4 ${ring ? 'ring-2 ring-ring/25' : ''}`}
                    >
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0 ${light}`}>
                            <Icon className={`h-5 w-5 ${text}`} />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">{label}</p>
                            <p className="text-lg font-bold text-foreground truncate tabular-nums">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Cash Flow Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">
                        {t('cashFlowReport.transactionHistory') || 'Transaction History'}
                    </h2>
                </div>

                <div className="p-0">
                    {loading ? (
                        <div className="p-6">
                            <TableSkeleton rows={5} columns={7} />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-surface-subtle/50 border-border text-left">
                                        {sortHeader('Date', 'date')}
                                        {sortHeader('Description', 'description')}
                                        {sortHeader('Category', 'category')}
                                        {sortHeader('Subcategory', 'subcategory')}
                                        {sortHeader('Type', 'type', 'text-center')}
                                        {sortHeader('Amount', 'amount', 'text-right')}
                                        {sortHeader('Balance', 'balance', 'text-right')}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    <tr className="bg-primary/20">
                                        <td className="py-3 px-4 font-semibold text-foreground">{startDate}</td>
                                        <td className="py-3 px-4 font-semibold text-foreground" colSpan={4}>{t('cashFlowReport.openingBalance')}</td>
                                        <td className="py-3 px-4 text-right font-bold text-foreground">
                                            {formatCurrency(summary.openingBalance)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-foreground">
                                            {formatCurrency(summary.openingBalance)}
                                        </td>
                                    </tr>

                                    {filteredTransactions.map((transaction, index) => (
                                        <tr key={index} className="hover:bg-surface-subtle/50 transition-colors">
                                            <td className="py-3 px-4 text-muted-foreground">{transaction.date}</td>
                                            <td className="py-3 px-4 text-foreground font-medium">{transaction.description || '-'}</td>
                                            <td className="py-3 px-4 text-muted-foreground">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                                                    {transaction.category || '-'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-muted-foreground">{transaction.subcategory || '-'}</td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-2.5 py-0.5 text-xs rounded-full font-semibold ${transaction.type === 'INFLOW'
                                                    ? 'bg-success/15 text-success dark:bg-success/30 dark:text-green-400'
                                                    : 'bg-danger/15 text-danger dark:bg-danger/30 dark:text-red-400'
                                                    }`}>
                                                    {transaction.type}
                                                </span>
                                            </td>
                                            <td className={`py-3 px-4 text-right font-bold font-mono ${transaction.type === 'INFLOW'
                                                ? 'text-success dark:text-green-400'
                                                : 'text-danger dark:text-red-400'
                                                }`}>
                                                {transaction.type === 'INFLOW' ? '+' : ''}{formatCurrency(Math.abs(transaction.amount))}
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-foreground font-mono text-xs">
                                                {formatCurrency(transaction.balance)}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Closing Balance */}
                                    <tr className="bg-primary/20 border-t border-border">
                                        <td className="py-3 px-4 font-semibold text-foreground">{endDate}</td>
                                        <td className="py-3 px-4 font-semibold text-foreground" colSpan={4}>{t('cashFlowReport.closingBalance')}</td>
                                        <td className="py-3 px-4 text-right font-bold text-primary">
                                            {formatCurrency(summary.closingBalance)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-primary text-base">
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
            <Drawer open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
                <DrawerContent className="sm:max-w-[500px] bg-card dark:text-white">
                    <DrawerHeader>
                        <DrawerTitle>{t('expenses.addExpense')}</DrawerTitle>
                        <DrawerDescription>
                            Record a new operating expense for your business.
                        </DrawerDescription>
                    </DrawerHeader>
                    <form onSubmit={handleCreateExpense} className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="category">{t('expenses.category')}</Label>
                                <Select
                                    value={expenseForm.category}
                                    onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}
                                >
                                    <SelectTrigger className="bg-card">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border">
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
                                {expenseForm.category === 'OTHER' && (
                                    <Input
                                        required
                                        value={expenseForm.otherCategory}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, otherCategory: e.target.value })}
                                        placeholder={t('expenses.specifyCategory')}
                                        className="bg-card mt-2"
                                    />
                                )}
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
                                    className="bg-card"
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
                                    <SelectTrigger className="bg-card">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border">
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
                                    className="bg-card"
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
                                className="bg-card"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ref">{t('expenses.reference')} (Optional)</Label>
                            <Input
                                id="ref"
                                value={expenseForm.reference}
                                onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })}
                                placeholder="Invoice or Receipt #"
                                className="bg-card"
                            />
                        </div>

                        <DrawerFooter>
                            <Button type="button" variant="outline" onClick={() => setIsExpenseModalOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-danger hover:bg-danger/90 text-white">
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('common.save')}
                            </Button>
                        </DrawerFooter>
                    </form>
                </DrawerContent>
            </Drawer>

            {/* Record Supplier Payment Modal */}
            <Drawer open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DrawerContent className="sm:max-w-[500px] bg-card dark:text-white">
                    <DrawerHeader>
                        <DrawerTitle>{t('supplierPayments.recordPayment')}</DrawerTitle>
                        <DrawerDescription>
                            Record a payment made to a supplier for a purchase order.
                        </DrawerDescription>
                    </DrawerHeader>
                    <form onSubmit={handleRecordPayment} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="po">{t('supplierPayments.purchaseOrder')}</Label>
                            <Select
                                value={paymentForm.purchaseOrderId}
                                onValueChange={(v) => setPaymentForm({ ...paymentForm, purchaseOrderId: v })}
                                required
                            >
                                <SelectTrigger className="bg-card">
                                    <SelectValue placeholder="Select Purchase Order" />
                                </SelectTrigger>
                                <SelectContent className="bg-card max-h-[200px] border">
                                    {purchaseOrders.length === 0 ? (
                                        <div className="p-2 text-sm text-muted-foreground text-center">No orders found</div>
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
                                    <SelectTrigger className="bg-card">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border">
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
                                    className="bg-card"
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
                                    className="bg-card"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay-ref">{t('supplierPayments.reference')} (Optional)</Label>
                                <Input
                                    id="pay-ref"
                                    value={paymentForm.reference}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                                    placeholder="TXN ID"
                                    className="bg-card"
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
                                className="bg-card"
                            />
                        </div>

                        <DrawerFooter>
                            <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={isSubmitting || !paymentForm.purchaseOrderId} className="bg-primary hover:bg-primary/90 text-white">
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('supplierPayments.recordPayment')}
                            </Button>
                        </DrawerFooter>
                    </form>
                </DrawerContent>
            </Drawer>
        </div>
    );
};
