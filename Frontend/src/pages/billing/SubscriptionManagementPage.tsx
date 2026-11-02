import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    XCircle,
    Loader2,
    CreditCard,
    RefreshCw,
    FileText,
    ShieldCheck,
    CalendarClock,
    ShoppingBag,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    AlertTriangle
} from 'lucide-react';
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "../../components/ui/drawer";
import { apiClient } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import SubscriptionPage from '../SubscriptionPage';

interface Subscription {
    id: string;
    status: 'ACTIVE' | 'TRIALING' | 'GRACE_PERIOD' | 'PAST_DUE' | 'CANCELED' | 'CANCELLED' | 'UNPAID' | 'INCOMPLETE' | 'EXPIRED' | 'PENDING';
    startDate: string;
    endDate: string | null;
    gracePeriodEndsAt?: string | null;
    planId: string;
    plan: {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: string;
        billingCycle: 'MONTHLY' | 'YEARLY';
        maxUsers: number;
        isActive: boolean;
        features: Array<{
            feature: {
                id: string;
                name: string;
                description: string;
                key: string;
            };
            isEnabled: boolean;
            limitValue: number | null;
        }>;
    };
    paymentMethod: string;
    autoRenew: boolean;
    createdAt: string;
    updatedAt: string;
    stripeCustomerId?: string;
}

const formatCurrency = (amount: number, currency: string = 'RWF'): string => {
    return new Intl.NumberFormat('en-RW', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const formatDate = (dateString: string | null | undefined, locale: string = 'en-US'): string => {
    if (!dateString) return 'soon';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
};

// Colored Status Badges
const getStatusBadge = (status: string, t: any) => {
    const statusMap: Record<string, { text: string; color: string }> = {
        ACTIVE: { text: t('common.active'), color: 'bg-success/15 text-success dark:bg-success/30 dark:text-green-300' },
        TRIALING: { text: t('billing.trial'), color: 'bg-primary/15 text-primary' },
        GRACE_PERIOD: { text: t('billing.gracePeriod') || 'Grace Period', color: 'bg-danger/15 text-danger dark:bg-danger/30 dark:text-red-300' },
        PAST_DUE: { text: t('billing.pastDue'), color: 'bg-warning/15 text-warning dark:bg-warning/30 dark:text-yellow-300' },
        CANCELED: { text: t('billing.canceled'), color: 'bg-danger/15 text-danger dark:bg-danger/30 dark:text-red-300' },
        UNPAID: { text: t('billing.unpaid'), color: 'bg-danger/15 text-danger dark:bg-danger/30 dark:text-red-300' },
        INCOMPLETE: { text: t('billing.incomplete'), color: 'bg-orange-500/15 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
        EXPIRED: { text: t('billing.expired'), color: 'bg-muted text-foreground' },
        PENDING: { text: t('billing.pending'), color: 'bg-indigo-500/15 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
    };

    const info = statusMap[status] || { text: status, color: 'bg-muted text-foreground' };
    return <span className={`px-2 py-1 text-xs rounded-full font-semibold ${info.color}`}>{info.text}</span>;
};

const SubscriptionManagementPage = () => {
    const { t, i18n } = useTranslation();
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [subscriptionToCancel, setSubscriptionToCancel] = useState<string | null>(null);
    const [renewTarget, setRenewTarget] = useState<{ planId: string; currentExpiryDate: string | null } | null>(null);

    useEffect(() => {
        const fetchSubscriptions = async () => {
            try {
                setIsLoading(true);
                const response = await apiClient.getOrganizationSubscriptions();
                const subs = Array.isArray(response.data.subscriptions)
                    ? response.data.subscriptions
                    : [response.data.subscriptions];
                setSubscriptions(subs);
            } catch (err) {
                console.error(err);
                setError(t('billing.fetchError') || 'Failed to load subscriptions. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchSubscriptions();
    }, []);


    const confirmCancellation = async () => {
        if (!subscriptionToCancel || isUpdating) return;
        try {
            setIsUpdating(true);
            await apiClient.cancelSubscription(subscriptionToCancel);
            setSubscriptions(prev =>
                prev.map(sub =>
                    sub.id === subscriptionToCancel
                        ? { ...sub, autoRenew: false }
                        : sub
                )
            );
            setIsCancelModalOpen(false);
            setSubscriptionToCancel(null);
        } catch (err) {
            console.error(err);
            setError(t('billing.cancelError') || 'Failed to cancel subscription.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleReactivateSubscription = async (subscriptionId: string) => {
        if (isUpdating) return;
        try {
            setIsUpdating(true);
            await apiClient.reactivateSubscription(subscriptionId);
            setSubscriptions(prev =>
                prev.map(sub =>
                    sub.id === subscriptionId
                        ? { ...sub, status: 'ACTIVE' as const, autoRenew: true }
                        : sub
                )
            );
        } catch (err) {
            console.error(err);
            setError(t('billing.reactivateError') || 'Failed to reactivate subscription.');
        } finally {
            setIsUpdating(false);
        }
    };

    // Renewal reuses the exact same duration-selection + payment flow as a new purchase (rendered
    // below via <SubscriptionPage preselectedPlanId .../>): the backend already treats "buy more
    // months for a plan you already have" as a renewal-in-place, extending from the current endDate
    // when it's still in the future.
    const handleRenewSubscription = (subscription: Subscription) => {
        setRenewTarget({ planId: subscription.plan.id, currentExpiryDate: subscription.endDate });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-danger/10 text-danger rounded-md mb-4 flex items-center">
                <XCircle className="mr-2 h-5 w-5" /> {error}
            </div>
        );
    }



    // Sort subscriptions: Active/Trialing first, then by creation date (newest first)
    const sortedSubscriptions = [...subscriptions].sort((a, b) => {
        const priorityStatus = ['ACTIVE', 'TRIALING'];
        const aPriority = priorityStatus.includes(a.status) ? 1 : 0;
        const bPriority = priorityStatus.includes(b.status) ? 1 : 0;

        if (aPriority !== bPriority) return bPriority - aPriority;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const primarySubscription = sortedSubscriptions[0];
    const otherSubscriptions = sortedSubscriptions.slice(1);

    const renderSubscriptionCard = (subscription: Subscription) => {
        const isActive = subscription.status === 'ACTIVE' || subscription.status === 'TRIALING' || subscription.status === 'GRACE_PERIOD';
        const currentPlan = subscription.plan ? {
            id: subscription.plan.id,
            name: subscription.plan.name,
            description: subscription.plan.description,
            price: subscription.plan.price,
            currency: subscription.plan.currency,
            interval: subscription.plan.billingCycle === 'MONTHLY' ? 'month' : 'year',
            features: subscription.plan.features
                .filter(f => f.isEnabled)
                .map(f => f.feature.name)
        } : null;

        return (
            <Card key={subscription.id} className={`overflow-hidden border-2 transition-all duration-200 bg-card ${isActive ? 'border-primary/20 shadow-md' : 'border-border hover:border-border'}`}>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="text-2xl font-bold text-foreground">{currentPlan?.name || t('common.unknown')}</h3>
                                {getStatusBadge(subscription.status, t)}
                            </div>
                            <p className="text-muted-foreground">{currentPlan?.description}</p>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            {!subscription.autoRenew && isActive ? (
                                <Button
                                    onClick={() => handleReactivateSubscription(subscription.id)}
                                    disabled={isUpdating}
                                    className="bg-success hover:bg-success/90 flex-1 md:flex-none text-white shadow-sm"
                                >
                                    {isUpdating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : t('billing.reactivate')}
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => handleRenewSubscription(subscription)}
                                    disabled={isUpdating}
                                    className="bg-primary hover:bg-primary/90 flex-1 md:flex-none text-white shadow-sm"
                                >
                                    {t('billing.renew')}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-surface-subtle/50 rounded-xl border border-border">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-primary/15 rounded-lg text-primary">
                                <CreditCard className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">{t('billing.pricingAndCycle')}</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {currentPlan ? `${formatCurrency(currentPlan.price, currentPlan.currency)}/${currentPlan.interval === 'month' ? t('common.month') : t('common.year')}` : 'N/A'}
                                </p>
                                {subscription.autoRenew && isActive ? (
                                    <p className="text-xs text-success mt-1 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> {t('billing.autoRenewalOn')}
                                    </p>
                                ) : (
                                    <p className="text-xs text-warning mt-1 flex items-center gap-1">
                                        <CalendarClock className="h-3 w-3" /> {t('billing.autoRenewalOff')}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-purple-500/15 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                                <CalendarClock className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">
                                    {!isActive ? t('billing.endedOn') : t('billing.nextBillingDate')}
                                </p>
                                <p className="text-lg font-semibold text-foreground">
                                    {formatDate(subscription.endDate || undefined, i18n.language)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {t('billing.usingPayment', { method: subscription.paymentMethod || t('common.default') })}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-success/15 dark:bg-success/30 rounded-lg text-success dark:text-green-400">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-muted-foreground mb-1">{t('billing.planFeatures')}</p>
                                <div className="flex flex-wrap gap-2">
                                    {currentPlan?.features.slice(0, 3).map((feature, i) => (
                                        <span key={i} className="inline-flex items-center px-2 py-1 rounded bg-card border border-border text-xs font-medium text-muted-foreground">
                                            {feature}
                                        </span>
                                    ))}
                                    {(currentPlan?.features.length || 0) > 3 && (
                                        <span className="inline-flex items-center px-2 py-1 rounded bg-muted text-xs font-medium text-muted-foreground">
                                            {t('billing.more', { count: currentPlan!.features.length - 3 })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </Card>
        );
    };

    return (
        <div className="container mx-auto px-4 py-8 space-y-8 bg-surface-subtle min-h-screen">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('billing.title')}</h1>
                <p className="text-muted-foreground">{t('billing.description')}</p>
            </div>

            {/* Current Subscriptions */}
            <div className="grid gap-6">
                {subscriptions.length > 0 ? (
                    <>
                        {/* Primary Subscription */}
                        {primarySubscription && renderSubscriptionCard(primarySubscription)}

                        {/* Other Subscriptions Toggle */}
                        {otherSubscriptions.length > 0 && (
                            <div className="flex justify-center">
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                                >
                                    {isExpanded ? (
                                        <>
                                            {t('billing.hidePrevious')}
                                            <ChevronUp className="h-4 w-4" />
                                        </>
                                    ) : (
                                        <>
                                            {t('billing.showPrevious', { count: otherSubscriptions.length })}
                                            <ChevronDown className="h-4 w-4" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* Expanded List */}
                        {isExpanded && (
                            <div className="grid gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                {otherSubscriptions.map(sub => renderSubscriptionCard(sub))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-12 bg-surface-subtle rounded-2xl border-2 border-dashed border-border">
                        <div className="bg-card p-4 rounded-full inline-flex mb-4 shadow-sm">
                            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-medium text-foreground">{t('billing.noActiveSubscriptions')}</h3>
                        <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                            {t('billing.choosePlanBelow')}
                        </p>
                    </div>
                )}
            </div>

            {/* Available Plans */}
            <div>
                <h2 className="text-2xl font-semibold mb-4 text-foreground">{t('billing.availablePlans')}</h2>

                <SubscriptionPage
                    preselectedPlanId={renewTarget?.planId ?? null}
                    renewalCurrentExpiryDate={renewTarget?.currentExpiryDate ?? null}
                />
            </div>

            {/* Billing History */}
            <div className="flex justify-end mt-6">
                <Button variant="outline" asChild>
                    <a href="/dashboard/history" className="flex items-center space-x-1">
                        <FileText className="h-4 w-4" />
                        <span>{t('billing.viewBillingHistory')}</span>
                    </a>
                </Button>
            </div>

            <Drawer open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
                <DrawerContent className="sm:max-w-md bg-card">
                    <DrawerHeader>
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-danger/15 flex items-center justify-center">
                                <AlertTriangle className="h-6 w-6 text-danger" />
                            </div>
                            <div>
                                <DrawerTitle className="text-xl text-danger">{t('billing.confirmCancelTitle')}</DrawerTitle>
                                <DrawerDescription className="mt-2 text-muted-foreground">
                                    {t('billing.confirmCancelDesc')}
                                </DrawerDescription>
                            </div>
                        </div>
                    </DrawerHeader>

                    <div className="py-4">
                        <div className="p-4 bg-danger/10 dark:bg-danger/10 border border-danger/25 dark:border-red-800/50 rounded-lg text-sm text-danger dark:text-red-200">
                            <p className="font-medium flex items-center gap-2 mb-1">
                                <ShieldCheck className="h-4 w-4" />
                                {t('billing.premiumAccessWarning')}
                            </p>
                            <p>
                                {t('billing.premiumAccessWarningDesc')}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-4 px-1">
                            {t('billing.undoneWarning')}
                        </p>
                    </div>

                    <DrawerFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} className="border-border">
                            {t('billing.keepSubscription')}
                        </Button>
                        <Button variant="destructive" onClick={confirmCancellation} disabled={isUpdating} className="bg-danger hover:bg-danger/90">
                            {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : t('billing.cancelSolution')}
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </div>
    );
};

export default SubscriptionManagementPage;
