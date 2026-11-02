import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { apiClient } from '../../../lib/api-client';
import { PaymentModal } from '../../../components/dept/PaymentModal';
import { toast } from 'react-toastify';
import { Loader2, AlertCircle, Users, TrendingDown } from 'lucide-react';
import { PaymentHistory } from '../../../components/dept/PaymentHistory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { useTranslation } from 'react-i18next';
import { PageHeader } from "../../../components/common/PageHeader";

export default function DebtManagement() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('outstanding');
    const [outstandingDebts, setOutstandingDebts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSale, setSelectedSale] = useState<any>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
    const [filters, setFilters] = useState({
        paymentMethod: '',
        customerName: '',
        recordedByName: '',
        startDate: '',
        endDate: ''
    });
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);



    const fetchOutstandingDebts = async () => {
        try {
            setIsLoading(true);
            const response = await apiClient.getOutstandingDebts();
            setOutstandingDebts(response.data || []);
        } catch (error) {
            console.error('Error fetching outstanding debts:', error);
            toast.error(t('debtManagement.failedToLoadDebts'));
        } finally {
            setIsLoading(false);
        }
    };
    useEffect(() => {
        fetchOutstandingDebts();
    }, []);

    const handlePaymentSuccess = () => {
        toast.success(t('debtManagement.paymentRecorded'));
        fetchOutstandingDebts();
    };
    const fetchPaymentHistory = async (filters = {}) => {
        try {
            setIsLoadingHistory(true);
            const response = await apiClient.getAllPaymentHistory(filters);
            setPaymentHistory(response.data || []);
        } catch (error) {
            console.error('Error fetching payment history:', error);
            toast.error(t('debtManagement.failedToLoadHistory'));
        } finally {
            setIsLoadingHistory(false);
        }
    };

    // Debounce filter changes to avoid too many API calls
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (activeTab === 'history') {
                // Convert empty strings to undefined to avoid sending empty filters
                const cleanedFilters = Object.fromEntries(
                    Object.entries(filters).map(([key, value]) => [key, value || undefined])
                );
                fetchPaymentHistory(cleanedFilters);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [filters, activeTab]);

    const handleFilterChange = (newFilters: any) => {
        setFilters(prev => ({
            ...prev,
            ...newFilters
        }));
    };

    const handleResetFilters = () => {
        setFilters({
            paymentMethod: '',
            customerName: '',
            recordedByName: '',
            startDate: '',
            endDate: ''
        });
    };

    const totalDebt = outstandingDebts.reduce((sum: number, s: any) => sum + (Number(s.debtAmount) || 0), 0);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader
              title={t('debtManagement.title')}
              description={<>Track and manage outstanding customer debts and payment records</>}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 dark:bg-danger/20 flex-shrink-0">
                        <AlertCircle className="h-5 w-5 text-danger dark:text-red-400" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">Outstanding Debts</p>
                        <p className="text-2xl font-bold text-foreground tabular-nums">{outstandingDebts.length}</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 dark:bg-danger/20 flex-shrink-0">
                        <TrendingDown className="h-5 w-5 text-danger dark:text-rose-400" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">Total Debt Amount</p>
                        <p className="text-xl font-bold text-foreground tabular-nums">
                            {totalDebt.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">RWF</span>
                        </p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                        <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">Customers with Debt</p>
                        <p className="text-2xl font-bold text-foreground tabular-nums">
                            {new Set(outstandingDebts.map((s: any) => s.customer?.id)).size}
                        </p>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-muted p-1 rounded-lg">
                    <TabsTrigger
                        value="outstanding"
                        className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm data-[state=active]:text-red-600 font-medium"
                    >
                        {t('debtManagement.outstandingDebts')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="history"
                        className="rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm data-[state=active]:text-blue-600 font-medium"
                    >
                        {t('debtManagement.paymentHistory')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="outstanding" className="space-y-4">
                    <Card className="bg-card border border-border shadow-sm">
                        <CardHeader className="border-b border-border">
                            <CardTitle>{t('debtManagement.outstandingDebts')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                            ) : outstandingDebts.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    {t('debtManagement.noDebtsFound')}
                                </div>
                            ) : (
                                <div className="space-y-4">

                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-surface-subtle">
                                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('debtManagement.saleNumber')}</TableHead>
                                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('debtManagement.customer')}</TableHead>
                                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('debtManagement.dueAmount')}</TableHead>
                                                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">{t('debtManagement.action')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {outstandingDebts.map((sale: any) => (
                                                <TableRow key={sale.id} className="hover:bg-muted transition-colors">
                                                    <TableCell>
                                                        <span className="font-mono text-sm font-semibold text-primary">{sale.saleNumber}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-xs font-bold flex-shrink-0">
                                                                {(sale.customer?.name || 'C').charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-medium text-sm text-foreground">{sale.customer?.name}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-danger dark:text-red-400 font-bold text-sm">
                                                            {Number(sale.debtAmount).toLocaleString()} RWF
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedSale(sale);
                                                                setShowPaymentModal(true);
                                                            }}
                                                            className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-white"
                                                        >
                                                            {t('debtManagement.recordPayment')}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>


                <TabsContent value="history" className="space-y-4">
                    <Card className="bg-card border border-border shadow-sm">
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-base font-semibold text-foreground">{t('debtManagement.paymentHistory')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <PaymentHistory
                                payments={paymentHistory}
                                isLoading={isLoadingHistory}
                                filters={filters}
                                onFilterChange={handleFilterChange}
                                onResetFilters={handleResetFilters}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {showPaymentModal && selectedSale && (
                <PaymentModal
                    sale={selectedSale}
                    onClose={() => {
                        setShowPaymentModal(false);
                        setSelectedSale(null);
                    }}
                    onPaymentSuccess={handlePaymentSuccess}
                />
            )}
        </div>
    );

}
