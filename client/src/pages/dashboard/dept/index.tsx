import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { apiClient } from '../../../lib/api-client';
import { PaymentModal } from '../../../components/dept/PaymentModal';
import { toast } from 'react-toastify';
import { Loader2 } from 'lucide-react';
import { PaymentHistory } from '../../../components/dept/PaymentHistory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { useTranslation } from 'react-i18next';

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

    return (
        <div className="container mx-auto py-6 space-y-6 dark:bg-gray-900 dark:text-white">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">{t('debtManagement.title')}</h1>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 dark:bg-gray-900">
                <TabsList>
                    <TabsTrigger
                        value="outstanding"
                        className={activeTab === 'outstanding' ? 'border-b-2 text-blue-600 font-semibold' : ''}
                    >
                        {t('debtManagement.outstandingDebts')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="history"
                        className={activeTab === 'history' ? 'border-b-2 text-blue-600 font-semibold' : ''}
                    >
                        {t('debtManagement.paymentHistory')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="outstanding" className="space-y-4 dark:bg-gray-900">
                    <Card className="dark:bg-gray-900 dark:text-white">
                        <CardHeader>
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
                                <div className="space-y-4 dark:bg-gray-900 dark:text-white">

                                    <Table className="dark:bg-gray-900 dark:text-white">
                                        <TableHeader className="bg-gray-100 dark:bg-gray-800 dark:text-white">
                                            <TableRow>
                                                <TableHead>{t('debtManagement.saleNumber')}</TableHead>
                                                <TableHead>{t('debtManagement.customer')}</TableHead>
                                                <TableHead>{t('debtManagement.dueAmount')}</TableHead>
                                                <TableHead className="text-center">{t('debtManagement.action')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="border-b dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                                            {outstandingDebts.map((sale) => (
                                                <TableRow key={sale.id} className="dark:bg-gray-900 dark:text-white border-b dark:border-gray-700">
                                                    <TableCell>
                                                        {sale.saleNumber}
                                                    </TableCell>
                                                    <TableCell>
                                                        {sale.customer.name}
                                                    </TableCell>
                                                    <TableCell className="text-red-600 font-semibold">
                                                        {sale.debtAmount} Frw
                                                    </TableCell>
                                                    <TableCell className="text-center cursor-pointer">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setSelectedSale(sale);
                                                                setShowPaymentModal(true);
                                                            }}
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


                <TabsContent value="history" className="space-y-4 dark:bg-gray-900 dark:text-gray-300">
                    <Card className="dark:bg-gray-900 dark:text-gray-300">
                        <CardHeader>
                            <CardTitle>{t('debtManagement.paymentHistory')}</CardTitle>
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