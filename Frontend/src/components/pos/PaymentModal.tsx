import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../common/ConfirmDialog';
import {
  Loader2, Check, Plus, X, Shield, Smartphone, CreditCard,
  FileText, Wallet, Lock,
} from 'lucide-react';

interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
  reference?: string;
}

export interface PaymentExtras {
  /** RRA purchase order code the buyer presented (6 characters), when one was entered. */
  prcOrdCd?: string;
}

/** Shown when the selected customer has a TIN, so the buyer's RRA purchase code can be entered. */
export interface PurchaseCodeConfig {
  buyerTin: string;
  /**
   * Corporate/insurance buyer with no code stored on the customer. Only changes the wording: the
   * backend may still find a pooled code, so an empty field is never blocked here.
   */
  expected: boolean;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onProcessPayment: (payments: PaymentEntry[], extras?: PaymentExtras) => Promise<void>;
  isProcessing?: boolean;
  purchaseCode?: PurchaseCodeConfig | null;
}

const PURCHASE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const PAYMENT_METHODS = [
  { value: 'CASH',         label: 'Cash',         icon: Wallet     },
  { value: 'MOBILE_MONEY', label: 'Mobile Money',  icon: Smartphone },
  { value: 'CREDIT_CARD',  label: 'Card',          icon: CreditCard },
  { value: 'DEBT',         label: 'Debt',          icon: FileText   },
  { value: 'BANK_CHECK',   label: 'Bank Check',    icon: FileText   },
  { value: 'INSURANCE',    label: 'Insurance',     icon: Shield     },
];

const QUICK_AMOUNTS_EXTRA = [10000, 5000, 1000];

export function PaymentModal({
  isOpen,
  onClose,
  totalAmount,
  onProcessPayment,
  isProcessing = false,
  purchaseCode = null,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const pendingPaymentsRef = useRef<PaymentEntry[]>([]);
  const [prcOrdCd, setPrcOrdCd] = useState('');
  const [prcOrdCdError, setPrcOrdCdError] = useState<string | null>(null);

  /* ── reset on open ─────────────────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      setPayments([{ id: Date.now().toString(), method: 'CASH', amount: 0 }]);
      setCurrentIndex(0);
      setPrcOrdCd('');
      setPrcOrdCdError(null);
    }
  }, [isOpen]);

  /** Validates the purchase code field; returns false (and shows why) when it blocks payment. */
  const checkPurchaseCode = (): boolean => {
    if (!purchaseCode) return true;
    const code = prcOrdCd.trim();
    if (!code) return true;
    if (!PURCHASE_CODE_PATTERN.test(code)) {
      setPrcOrdCdError('The purchase code must be exactly 6 letters or digits.');
      return false;
    }
    setPrcOrdCdError(null);
    return true;
  };

  const extras = (): PaymentExtras => {
    const code = prcOrdCd.trim();
    return purchaseCode && code ? { prcOrdCd: code } : {};
  };

  /* ── helpers ───────────────────────────────────────────────────── */
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const remaining = totalAmount - totalPaid;
  const current   = payments[currentIndex] ?? payments[0];

  const update = (idx: number, field: keyof PaymentEntry, value: string | number) => {
    setPayments(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const selectMethod = (method: string) => {
    if (!current) return;
    const otherPaid = payments.reduce((s, p, i) => i === currentIndex ? s : s + (p.amount || 0), 0);
    const due = Math.max(0, totalAmount - otherPaid);
    update(currentIndex, 'method', method);
    update(currentIndex, 'amount', due);
  };

  const setAmount = (val: number) => {
    const otherPaid = payments.reduce((s, p, i) => i === currentIndex ? s : s + (p.amount || 0), 0);
    const max = totalAmount - otherPaid;
    update(currentIndex, 'amount', Math.max(0, Math.min(val, max)));
  };

  const addPaymentMethod = () => {
    if (totalPaid >= totalAmount) return;
    const due = Math.max(0, totalAmount - totalPaid);
    const newEntry: PaymentEntry = { id: Date.now().toString(), method: 'CASH', amount: due };
    setPayments(prev => [...prev, newEntry]);
    setCurrentIndex(payments.length);
  };

  const removePayment = (idx: number) => {
    setPayments(prev => prev.filter((_, i) => i !== idx));
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleProcess = async () => {
    if (submittingRef.current || isProcessing) return;
    if (!checkPurchaseCode()) return;
    submittingRef.current = true;
    try {
      const valid = payments.filter(p => p.amount > 0);
      const paid  = valid.reduce((s, p) => s + p.amount, 0);
      const rem   = totalAmount - paid;
      if (Math.abs(rem) > 0.01) {
        const msg = rem > 0
          ? t('pos.confirmPartialPayment') || `Amount is incomplete (${rem.toLocaleString()} RWF remaining). Continue?`
          : t('pos.confirmOverpayment')    || `Amount exceeds total. Continue?`;
        pendingPaymentsRef.current = valid;
        setConfirmMsg(msg);
        return;
      }
      await onProcessPayment(valid, extras());
    } finally {
      submittingRef.current = false;
    }
  };

  const handleConfirmProcess = async () => {
    setConfirmMsg(null);
    submittingRef.current = true;
    try {
      await onProcessPayment(pendingPaymentsRef.current, extras());
    } finally {
      submittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  /* ── quick amounts: total + extras ────────────────────────────── */
  const quickAmounts = [totalAmount, ...QUICK_AMOUNTS_EXTRA].filter(
    (v, i, arr) => arr.indexOf(v) === i && v > 0,
  );

  /* ── render ────────────────────────────────────────────────────── */
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
    >
      {/* Panel */}
      <div
        className="relative flex flex-col bg-card h-full w-full max-w-[420px] shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-bold text-foreground">Process Payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Total / Paid / Remaining bar ──────────────────────── */}
        <div className="mx-6 mb-6 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface-subtle overflow-hidden">
          <div className="flex flex-col items-center py-4 px-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Total</p>
            <p className="text-base font-bold text-foreground tabular-nums">
              {totalAmount.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">RWF</span>
            </p>
          </div>
          <div className="flex flex-col items-center py-4 px-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Paid</p>
            <p className="text-base font-bold text-success tabular-nums">
              {totalPaid.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">RWF</span>
            </p>
          </div>
          <div className="flex flex-col items-center py-4 px-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Remaining</p>
            <p className={`text-base font-bold tabular-nums ${remaining > 0 ? 'text-danger' : 'text-success'}`}>
              {remaining.toLocaleString()}
              <span className="ml-1 text-xs font-normal text-muted-foreground">RWF</span>
            </p>
          </div>
        </div>

        {/* ── Multi-payment tabs (if >1) ────────────────────────── */}
        {payments.length > 1 && (
          <div className="mx-6 mb-4 flex items-center gap-2 flex-wrap">
            {payments.map((p, idx) => {
              const M = PAYMENT_METHODS.find(m => m.value === p.method);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    idx === currentIndex
                      ? 'bg-primary text-white border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  {M && <M.icon className="h-3 w-3" />}
                  {M?.label} · {p.amount.toLocaleString()}
                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removePayment(idx); }}
                      className="ml-1 opacity-60 hover:opacity-100"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Payment Method label ──────────────────────────────── */}
        <div className="px-6 mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Payment Method {payments.length > 1 ? `(${currentIndex + 1}/${payments.length})` : ''}
          </p>
        </div>

        {/* ── Method grid ──────────────────────────────────────── */}
        <div className="px-6 mb-5 grid grid-cols-2 gap-3">
          {PAYMENT_METHODS.slice(0, 4).map(m => {
            const selected = current?.method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => selectMethod(m.value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-primary/50'
                }`}
              >
                <span className={`p-1.5 rounded-lg ${selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <m.icon className="h-4 w-4" />
                </span>
                {m.label}
              </button>
            );
          })}
          {/* Insurance — full-width row */}
          {(() => {
            const m = PAYMENT_METHODS[4];
            const selected = current?.method === m.value;
            return (
              <button
                type="button"
                onClick={() => selectMethod(m.value)}
                className={`col-span-2 flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-primary/50'
                }`}
              >
                <span className={`p-1.5 rounded-lg ${selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <m.icon className="h-4 w-4" />
                </span>
                {m.label}
              </button>
            );
          })()}
        </div>

        {/* ── Amount input ──────────────────────────────────────── */}
        <div className="px-6 mb-4">
          <label className="block text-xs font-semibold text-muted-foreground mb-2">
            Amount ({PAYMENT_METHODS.find(m => m.value === current?.method)?.label ?? 'Cash'})
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              value={current?.amount || ''}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full h-12 pl-4 pr-16 rounded-xl border-2 border-border text-foreground text-sm font-bold focus:outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 transition-all bg-card"
              autoFocus
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
              RWF
            </span>
          </div>

          {/* Reference (for mobile, card, debt) */}
          {(current?.method === 'MOBILE_MONEY' || current?.method === 'CREDIT_CARD' || current?.method === 'DEBT') && (
            <input
              type="text"
              value={current?.reference || ''}
              onChange={e => update(currentIndex, 'reference', e.target.value)}
              placeholder={t('pos.referencePlaceholder') || 'Transaction reference (optional)'}
              className="mt-2 w-full h-10 px-4 rounded-xl border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-all bg-surface-subtle"
            />
          )}
        </div>

        {/* ── Quick Amounts ─────────────────────────────────────── */}
        <div className="px-6 mb-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Quick Amounts</p>
          <div className="flex flex-wrap gap-2">
            {quickAmounts.map(amt => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  current?.amount === amt
                    ? 'bg-primary text-white border-primary shadow-sm shadow-blue-500/30'
                    : 'bg-card text-foreground border-border hover:border-primary hover:text-primary'
                }`}
              >
                {amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Add Another Payment Method ────────────────────────── */}
        <div className="px-6 mb-5">
          <button
            type="button"
            onClick={addPaymentMethod}
            disabled={totalPaid >= totalAmount}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Another Payment Method
          </button>
        </div>

        {/* ── RRA purchase code (buyers with a TIN) ─────────────── */}
        {purchaseCode && (
          <div className="px-6 mb-5">
            <label htmlFor="pos-prc-ord-cd" className="block text-xs font-semibold text-muted-foreground mb-1.5">
              RRA purchase code{purchaseCode.expected ? '' : ' (optional)'}
            </label>
            <input
              id="pos-prc-ord-cd"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={6}
              value={prcOrdCd}
              onChange={e => {
                setPrcOrdCd(e.target.value.replace(/\s+/g, '').toUpperCase());
                if (prcOrdCdError) setPrcOrdCdError(null);
              }}
              placeholder="6-character code"
              aria-invalid={!!prcOrdCdError}
              aria-describedby="pos-prc-ord-cd-help"
              className={`w-full h-10 px-4 rounded-xl border text-sm font-mono tracking-widest text-foreground focus:outline-none transition-all bg-surface-subtle ${
                prcOrdCdError ? 'border-danger focus:border-danger' : 'border-border focus:border-primary'
              }`}
            />
            <p id="pos-prc-ord-cd-help" className={`mt-1 text-[11px] ${prcOrdCdError ? 'text-danger' : 'text-muted-foreground'}`}>
              {prcOrdCdError
                ?? (purchaseCode.expected
                  ? `Business buyer (TIN ${purchaseCode.buyerTin}): enter the single-use code they got from RRA for this purchase.`
                  : `Single-use code buyer TIN ${purchaseCode.buyerTin} got from RRA. Leave blank to use a code already on file.`)}
            </p>
          </div>
        )}

        {/* ── Remaining pill ────────────────────────────────────── */}
        <div className="mx-6 mb-6 flex items-center justify-between px-5 py-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25">
          <span className="text-sm font-semibold text-indigo-700">Remaining</span>
          <span className={`text-base font-extrabold tabular-nums ${remaining > 0 ? 'text-danger' : 'text-success'}`}>
            {remaining.toLocaleString()} RWF
          </span>
        </div>

        {/* ── Footer buttons ────────────────────────────────────── */}
        <div className="mt-auto px-6 pb-6 space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 h-11 rounded-xl border-2 border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={isProcessing || totalPaid <= 0}
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-bold transition-all shadow-md shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <>Process Payment <Check className="h-4 w-4" /></>
              )}
            </button>
          </div>

          {/* Secure note */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Payments are secure and encrypted
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmMsg !== null}
        onClose={() => setConfirmMsg(null)}
        onConfirm={handleConfirmProcess}
        title={t('pos.confirmPaymentTitle') || 'Confirm Payment'}
        message={confirmMsg ?? ''}
        confirmText={t('pos.continue') || 'Continue'}
        variant="warning"
      />
    </div>
  );
}
