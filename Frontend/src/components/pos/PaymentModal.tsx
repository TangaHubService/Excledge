import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '../ui/drawer';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, Check } from 'lucide-react';

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
  reference?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onProcessPayment: (payments: PaymentEntry[]) => Promise<void>;
  isProcessing?: boolean;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CREDIT_CARD', label: 'Card' },
  { value: 'DEBT', label: 'Debt' },
  { value: 'INSURANCE', label: 'Insurance' },
];

export function PaymentModal({
  isOpen,
  onClose,
  totalAmount,
  onProcessPayment,
  isProcessing = false,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentPaymentIndex, setCurrentPaymentIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submittingRef = useRef(false);

  // Helper function to get payment method translation with proper fallback
  const getPaymentMethodLabel = (methodValue: string): string => {
    const translationKey = `pos.paymentMethods.${methodValue}`;
    const translated = t(translationKey);
    // If translation returns the key itself (not found), use the default label
    if (translated === translationKey) {
      const method = PAYMENT_METHODS.find(m => m.value === methodValue);
      return method?.label || methodValue;
    }
    return translated;
  };

  useEffect(() => {
    if (isOpen) {
      setPayments([{ id: Date.now().toString(), method: 'CASH', amount: 0 }]);
      setCurrentPaymentIndex(0);
      setErrors({});
    }
  }, [isOpen]);

  const updatePayment = (index: number, field: keyof PaymentEntry, value: string | number) => {
    const newPayments = [...payments];
    newPayments[index] = { ...newPayments[index], [field]: value };
    setPayments(newPayments);
    if (errors[newPayments[index].id]) {
      const newErrors = { ...errors };
      delete newErrors[newPayments[index].id];
      setErrors(newErrors);
    }
  };

  const calculateTotalPaid = () => {
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const calculateRemaining = () => {
    return totalAmount - calculateTotalPaid();
  };

  const handleProcessPayment = async () => {
    if (submittingRef.current || isProcessing) return;
    submittingRef.current = true;

    try {
      const validPayments = payments.filter((p) => p.amount > 0);
      const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = totalAmount - totalPaid;

      if (Math.abs(remaining) > 0.01) {
        const confirmMessage = remaining > 0
          ? t('pos.confirmPartialPayment') || `Incomplete. Continue?`
          : t('pos.confirmOverpayment') || `Overpaid. Continue?`;
        if (!window.confirm(confirmMessage)) { submittingRef.current = false; return; }
      }

      await onProcessPayment(validPayments);
    } finally {
      submittingRef.current = false;
    }
  };

  const totalPaid = calculateTotalPaid();
  const remaining = calculateRemaining();
  const currentPayment = payments[currentPaymentIndex] || payments[0] || { id: '', method: 'CASH', amount: 0 };

  // Ensure currentPaymentIndex is valid
  useEffect(() => {
    if (payments.length > 0 && currentPaymentIndex >= payments.length) {
      setCurrentPaymentIndex(0);
    }
  }, [payments.length, currentPaymentIndex]);

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent
        className={`sm:max-w-md overflow-y-auto p-4 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'
          }`}
      >
        <DrawerHeader className="pb-2">
          <DrawerTitle className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {t('pos.processPayment') || 'Process Payment'}
          </DrawerTitle>
        </DrawerHeader>

        <div className="space-y-3 py-2">
          {/* Summary */}
          <div className={`p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t('pos.totalAmount') || 'Total'}
                </p>
                <p className={`text-base font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {totalAmount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t('pos.totalPaid') || 'Paid'}
                </p>
                <p className={`text-base font-bold ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`}>
                  {totalPaid.toFixed(2)}
                </p>
              </div>
              <div>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t('pos.remainingBalance') || 'Remaining'}
                </p>
                <p className={`text-base font-bold ${remaining > 0
                  ? theme === 'dark' ? 'text-red-400' : 'text-red-600'
                  : theme === 'dark' ? 'text-green-400' : 'text-green-600'
                  }`}>
                  {remaining.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Method + Amount (always visible) */}
          {currentPayment && (
            <div className="space-y-2">
              <Label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('pos.paymentMethod') || 'Payment Method'} {payments.length > 1 ? `(${currentPaymentIndex + 1}/${payments.length})` : ''}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => {
                      if (currentPaymentIndex < payments.length) {
                        updatePayment(currentPaymentIndex, 'method', method.value);
                        const due = totalAmount - (calculateTotalPaid() - (currentPayment?.amount || 0));
                        updatePayment(currentPaymentIndex, 'amount', Math.max(0, due));
                      }
                    }}
                    className={`px-3 py-2 rounded border-2 text-sm font-medium transition-all ${currentPayment?.method === method.value
                      ? theme === 'dark'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-blue-600 border-blue-500 text-white'
                      : theme === 'dark'
                        ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'
                      }`}
                  >
                    {getPaymentMethodLabel(method.value)}
                  </button>
                ))}
              </div>
              {currentPayment?.method && (
                <div className="space-y-2 mt-2">
                  <Label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('pos.amount') || 'Amount'} ({getPaymentMethodLabel(currentPayment.method)})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentPayment.amount || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const currentAmount = currentPayment?.amount || 0;
                      const maxAmount = totalAmount - calculateTotalPaid() + currentAmount;
                      if (currentPaymentIndex < payments.length) {
                        updatePayment(currentPaymentIndex, 'amount', Math.min(val, maxAmount));
                      }
                    }}
                    placeholder="0.00"
                    autoFocus
                    className={`text-lg font-bold h-12 text-center ${theme === 'dark'
                      ? 'bg-gray-800 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                      }`}
                  />
                  {(currentPayment.method === 'MOBILE_MONEY' || currentPayment.method === 'CREDIT_CARD' || currentPayment.method === 'DEBT') && (
                    <Input
                      type="text"
                      value={currentPayment.reference || ''}
                      onChange={(e) => {
                        if (currentPaymentIndex < payments.length) {
                          updatePayment(currentPaymentIndex, 'reference', e.target.value);
                        }
                      }}
                      placeholder={t('pos.referencePlaceholder') || 'Reference'}
                      className={`h-9 text-sm ${theme === 'dark' ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'
                        }`}
                    />
                  )}
                </div>
              )}
              {currentPayment?.id && errors[currentPayment.id] && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors[currentPayment.id]}</p>
              )}
              {errors.total && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.total}</p>
              )}
            </div>
          )}

          {/* Payment List */}
          {payments.length > 1 && (
            <div className={`p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
              <p className={`text-xs mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {t('pos.payments') || 'Payments'}
              </p>
              <div className="space-y-1">
                {payments.map((payment, idx) => (
                  <div
                    key={payment.id}
                    className={`flex items-center justify-between text-xs p-1 rounded ${idx === currentPaymentIndex
                      ? theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'
                      : ''
                      }`}
                  >
                    <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                      {getPaymentMethodLabel(payment.method)}: {payment.amount.toFixed(2)}
                    </span>
                    {payment.amount > 0 && (
                      <Check className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="gap-2 pt-2">
          <div className="flex gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isProcessing}
              className={`flex-1 py-2 px-4 text-sm ${theme === 'dark' ? 'border-gray-600 text-white hover:bg-gray-700' : ''}`}
            >
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              onClick={handleProcessPayment}
              disabled={isProcessing || calculateTotalPaid() <= 0}
              className="flex-1 text-white py-2 px-4 text-sm font-semibold bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  {t('pos.processing') || 'Processing'}
                </>
              ) : (
                <>
                  {t('pos.processPayment') || 'Process Payment'}
                  <Check className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
