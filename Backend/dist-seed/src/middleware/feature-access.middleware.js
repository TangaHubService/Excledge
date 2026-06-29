"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFeature = void 0;
const subscription_service_1 = require("../services/subscription.service");
const prisma_1 = require("../lib/prisma");
const requireFeature = (featureKey) => {
    const subscriptionService = new subscription_service_1.SubscriptionService(prisma_1.prisma);
    return async (req, res, next) => {
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
        }
        catch (error) {
            console.error('Error checking feature access:', error);
            res.status(500).json({ error: 'Failed to verify feature access' });
        }
    };
};
exports.requireFeature = requireFeature;
