import { AlertCircle, CreditCard, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface SubscriptionAlertProps {
    subscriptionStatus?: string | null;
    hasActiveSubscription?: boolean;
    subscriptionEndDate?: string | null;
}

export const SubscriptionAlert: React.FC<SubscriptionAlertProps> = ({
    subscriptionStatus,
    hasActiveSubscription,
    subscriptionEndDate
}) => {
    const { t } = useTranslation();
    const [isDismissed, setIsDismissed] = useState(false);

    // Don't show alert if subscription is paid/active (non-trial) or dismissed
    if ((hasActiveSubscription && subscriptionStatus === "ACTIVE") || isDismissed) {
        return null;
    }

    const getMessage = () => {
        // Special case for trial
        if (subscriptionStatus === "TRIALING") {
            const end = subscriptionEndDate ? new Date(subscriptionEndDate).toLocaleDateString() : 'N/A';
            return {
                title: t('billing.trialPeriod') || "Free Trial Period",
                message: t('billing.trialMessage', { date: end }) || `You are currently using a free trial. It will end on ${end}. Subscribe now to keep your data and access all features.`,
                variant: "warning" as const,
                showRenew: true
            };
        }

        if (!hasActiveSubscription) {
            if (subscriptionStatus === "EXPIRED" || subscriptionStatus === "PAST_DUE") {
                return {
                    title: t('billing.subscriptionExpired'),
                    message: t('billing.subscriptionExpiredMessage') || "Your subscription has expired. Renew now to restore access to all features.",
                    variant: "error" as const,
                    showRenew: true
                };
            }
            return {
                title: t('billing.noActiveSubscription'),
                message: t('billing.noActiveSubscriptionMessage') || "Subscribe now to access all features and continue using the platform.",
                variant: "error" as const,
                showRenew: true
            };
        }

        // Check if expiring soon
        if (subscriptionEndDate) {
            const end = new Date(subscriptionEndDate);
            const now = new Date();
            const diffTime = end.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 7 && diffDays > 0) {
                return {
                    title: t('billing.subscriptionExpiringSoon'),
                    message: t('billing.subscriptionExpiringSoonMessage', { count: diffDays }) || `Your subscription will expire in ${diffDays} day${diffDays === 1 ? '' : 's'}. Renew now to avoid any interruption.`,
                    variant: "warning" as const,
                    showRenew: true
                };
            }
        }

        return null;
    };

    const alertData = getMessage();
    if (!alertData) {
        return null;
    }

    const { title, message, variant } = alertData;

    const bgColor = variant === "error"
        ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30"
        : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30";

    const textColor = variant === "error"
        ? "text-red-900 dark:text-red-200"
        : "text-orange-900 dark:text-orange-200";

    const iconColor = variant === "error"
        ? "text-red-600 dark:text-red-400"
        : "text-orange-600 dark:text-orange-400";

    return (
        <div className={`${bgColor} border-l-4 p-4 mb-6 rounded-r-lg relative`}>
            <div className="flex items-start gap-3">
                <AlertCircle className={`h-5 w-5 ${iconColor} flex-shrink-0 mt-0.5`} />
                <div className="flex-1">
                    <h3 className={`text-sm font-semibold ${textColor} mb-1`}>
                        {title}
                    </h3>
                    <p className={`text-sm ${textColor} opacity-90 mb-3`}>
                        {message}
                    </p>
                    <Link
                        to="/dashboard/subscription"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        <CreditCard className="h-4 w-4" />
                        {subscriptionStatus ? t('billing.renewSubscription') : t('billing.subscribeNow')}
                    </Link>
                </div>
                <button
                    onClick={() => setIsDismissed(true)}
                    className={`${iconColor} hover:opacity-70 transition-opacity`}
                    aria-label={t('common.dismissAlert')}
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
};
