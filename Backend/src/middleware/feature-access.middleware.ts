import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscription.service';
import { prisma } from '../lib/prisma';

/**
 * Blocks the request unless the organization has a subscription whose status is ACTIVE, TRIALING,
 * or GRACE_PERIOD.
 */
export const requireActiveSubscription = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const jwtRole = String((req as any).user?.role ?? '');
            if (jwtRole === 'SYSTEM_OWNER') {
                return next();
            }

            const organizationId = Number(req.params.organizationId);
            if (!organizationId || Number.isNaN(organizationId)) {
                return res.status(400).json({ error: 'Organization ID is required' });
            }

            const subscription = await prisma.subscription.findFirst({
                where: {
                    organizationId,
                    status: { in: ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] },
                },
                select: { id: true },
            });

            if (!subscription) {
                return res.status(403).json({
                    error: 'Your subscription has expired. Please renew your subscription to continue using the system.',
                    code: 'SUBSCRIPTION_INACTIVE',
                });
            }

            next();
        } catch (error) {
            console.error('Error checking subscription status:', error);
            res.status(500).json({ error: 'Failed to verify subscription status' });
        }
    };
};

export const requireFeature = (featureKey: string) => {
    const subscriptionService = new SubscriptionService(prisma);

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { organizationId } = req.params;

            if (!organizationId) {
                return res.status(400).json({ error: 'Organization ID is required' });
            }

            const hasAccess = await subscriptionService.hasFeatureAccess(Number(organizationId), featureKey);

            if (!hasAccess) {
                return res.status(403).json({
                    error: `Access denied. This feature requires a subscription that includes ${featureKey}`
                });
            }

            next();
        } catch (error) {
            console.error('Error checking feature access:', error);
            res.status(500).json({ error: 'Failed to verify feature access' });
        }
    };
};