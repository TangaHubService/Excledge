import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useTranslation } from 'react-i18next';

interface PaymentModalProps {
    sale: {
        id: string;
        saleNumber: string;
        customer: {
            name: string;
        };
        debtAmount: number;
    };
    onClose: () => void;
    onPaymentSuccess: () => void;
}

export function PaymentModal({ sale, onClose, onPaymentSuccess }: PaymentModalProps) {
    const { t } = useTranslation();
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            toast({
                title: t('common.error'),
                description: t('debtManagement.invalidAmount'),
                variant: 'destructive',
            });
            return;
        }

        if (parseFloat(amount) > sale.debtAmount) {
            toast({
                title: t('common.error'),
                description: t('debtManagement.amountExceedsDebt', { amount: sale.debtAmount }),
                variant: 'destructive',
            });
            return;
        }

        try {
            setIsSubmitting(true);
            await apiClient.recordDebtPayment(sale.id, {
                amount: parseFloat(amount),
                paymentMethod,
            });

            toast({
                title: t('common.success'),
                description: t('debtManagement.paymentRecorded'),
            });
            onPaymentSuccess();
            onClose();
        } catch (error) {
            toast({
                title: t('common.error'),
                description: t('debtManagement.failedToRecordPayment'),
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-background/80 dark:bg-gray-900/80 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-blue-600">{t('debtManagement.recordPayment')}</h3>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground p-1 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center border border-gray-200"
                        disabled={isSubmitting}
                    >
                        <span className="text-sm">✕</span>
                    </button>
                </div>

                <div className="mb-4 bg-muted/30 rounded-md flex justify-between gap-2">
                    <div className="font-medium flex-1">{sale.customer.name}</div>
                    <div className="text-lg font-bold whitespace-nowrap text-right">
                        {sale.debtAmount} Rwf {t('debtManagement.due')}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">{t('debtManagement.amountRwf')}</Label>
                        <div className="relative">
                            <Input
                                id="amount"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                required
                                disabled={isSubmitting}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('debtManagement.maximum')}: {sale.debtAmount} Rwf
                        </p>
                    </div>

                    <div className="space-y-2 w-full">
                        <Label htmlFor="paymentMethod">{t('debtManagement.paymentMethod')}</Label>
                        <Select
                            value={paymentMethod}
                            onValueChange={setPaymentMethod}
                            disabled={isSubmitting}
                        >
                            <SelectTrigger className="w-full bg-white dark:bg-gray-700 data-[placeholder]:text-gray-400">
                                <SelectValue placeholder={t('pos.selectCustomer')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white dark:bg-gray-700 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:bg-gray-900 dark:text-white">
                                <SelectItem value="CASH">{t('pos.paymentMethods.CASH')}</SelectItem>
                                <SelectItem value="CREDIT_CARD">{t('pos.paymentMethods.CREDIT_CARD')}</SelectItem>
                                <SelectItem value="MOBILE_MONEY">{t('pos.paymentMethods.MOBILE_MONEY')}</SelectItem>
                                <SelectItem value="BANK">Bank</SelectItem>
                                <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !amount} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('pos.processing')}
                                </>
                            ) : (
                                t('debtManagement.recordPayment')
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}