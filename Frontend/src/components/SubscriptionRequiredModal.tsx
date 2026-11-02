import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./ui/dialog";
import {
    dismissSubscriptionModal,
    isSubscriptionModalDismissalActive,
} from "../utils/subscriptionModalDismissal";

interface SubscriptionRequiredModalProps {
    hasActiveSubscription?: boolean;
    subscriptionStatus?: string | null;
}

/**
 * Blocking, dismissible modal shown in place of the old inline banner when the active organization
 * has no active subscription.
 */
export const SubscriptionRequiredModal: React.FC<SubscriptionRequiredModalProps> = ({
    hasActiveSubscription,
    subscriptionStatus,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const needsSubscription = hasActiveSubscription === false;

    useEffect(() => {
        if (needsSubscription && !isSubscriptionModalDismissalActive()) {
            setOpen(true);
        }
    }, [needsSubscription, subscriptionStatus]);

    const dismiss = () => {
        dismissSubscriptionModal();
        setOpen(false);
    };

    const handleSubscribeNow = () => {
        dismissSubscriptionModal();
        setOpen(false);
        navigate("/dashboard/subscription");
    };

    if (!needsSubscription) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-danger dark:text-red-400">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                        <span>{"⚠️"} {t('billing.noActiveSubscription')}</span>
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-foreground">
                        <span className="block">{t('billing.subscriptionRequiredMessage')}</span>
                        <span className="block mt-2">{t('billing.subscriptionRequiredCta')}</span>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <button
                        type="button"
                        onClick={dismiss}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                    >
                        {t('common.close')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubscribeNow}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors"
                    >
                        {t('billing.subscribeNow')}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
