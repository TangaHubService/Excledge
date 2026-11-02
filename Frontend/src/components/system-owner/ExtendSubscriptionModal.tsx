import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ExtendSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtend: (data: { endDate?: string; monthsToAdd?: number }) => Promise<void>;
  organizationName: string;
}

const ExtendSubscriptionModal: React.FC<ExtendSubscriptionModalProps> = ({
  isOpen,
  onClose,
  onExtend,
  organizationName,
}) => {
  const [mode, setMode] = useState<'months' | 'date'>('months');
  const [monthsToAdd, setMonthsToAdd] = useState(1);
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'months') {
        await onExtend({ monthsToAdd });
      } else {
        await onExtend({ endDate });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-muted-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-foreground mb-2">
          Extend Subscription
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {organizationName}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('months')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                mode === 'months'
                  ? 'bg-primary text-white'
                  : 'bg-muted text-foreground'
              }`}
            >
              Add Months
            </button>
            <button
              type="button"
              onClick={() => setMode('date')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                mode === 'date'
                  ? 'bg-primary text-white'
                  : 'bg-muted text-foreground'
              }`}
            >
              Set End Date
            </button>
          </div>

          {mode === 'months' ? (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Months to Add
              </label>
              <input
                type="number"
                min={1}
                value={monthsToAdd}
                onChange={(e) => setMonthsToAdd(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:ring-ring focus:border-primary dark:text-white"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                New End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md shadow-sm focus:ring-ring focus:border-primary dark:text-white"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (mode === 'date' && !endDate)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Extending...' : 'Extend'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExtendSubscriptionModal;
