import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscription.service';
import { prisma } from '../lib/prisma';

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