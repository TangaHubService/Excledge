import React from 'react';
import { XCircle, Clock } from 'lucide-react';
import type { Subscription } from '../../services/systemOwnerService';
import ExtendSubscriptionModal from './ExtendSubscriptionModal';

interface SubscriptionsProps {
  subscriptions: Subscription[];
  isLoading: boolean;
  error: string | null;
  onExtendSubscription: (id: number, data: { endDate?: string; monthsToAdd?: number }) => Promise<void>;
}

const Subscriptions: React.FC<SubscriptionsProps> = ({ subscriptions, isLoading, error, onExtendSubscription }) => {
  const [extendingId, setExtendingId] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/10 border-l-4 border-red-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-danger">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Subscriptions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage and monitor all organization subscriptions.</p>
      </div>

      <div className="bg-card shadow overflow-hidden sm:rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  End Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted-foreground">
                    No subscriptions found
                  </td>
                </tr>
              ) : (
                subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-muted">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      #{subscription.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">
                        {subscription.organization?.name || 'N/A'}
                      </div>
                      {subscription.organization?.email && (
                        <div className="text-sm text-muted-foreground">
                          {subscription.organization.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${subscription.status === 'ACTIVE'
                          ? 'bg-success/15 dark:bg-success/30 text-success dark:text-green-400'
                          : subscription.status === 'TRIALING'
                            ? 'bg-primary/15 text-primary'
                            : subscription.status === 'CANCELLED'
                              ? 'bg-danger/15 dark:bg-danger/30 text-danger dark:text-red-400'
                              : 'bg-warning/15 dark:bg-warning/30 text-warning dark:text-yellow-400'
                          }`}
                      >
                        {subscription.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(subscription.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(subscription.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                      RWF {subscription.paymentDetails?.amount !== null && subscription.paymentDetails?.amount !== undefined ? (typeof subscription.paymentDetails.amount === 'string' ? parseFloat(subscription.paymentDetails.amount) : subscription.paymentDetails.amount).toLocaleString() : '0'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setExtendingId(subscription.id)}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary"
                      >
                        <Clock className="h-4 w-4" />
                        Extend
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {extendingId !== null && (
        <ExtendSubscriptionModal
          isOpen={true}
          onClose={() => setExtendingId(null)}
          onExtend={async (data) => {
            await onExtendSubscription(extendingId, data);
            setExtendingId(null);
          }}
          organizationName={subscriptions.find((s) => s.id === extendingId)?.organization?.name || ''}
        />
      )}
    </div>
  );
};

export default Subscriptions;
