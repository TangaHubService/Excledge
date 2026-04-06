// src/routes/subscription.routes.ts

import { Router } from 'express';
import {
    getPlans,
    createCheckout,
    verifyPayment,
    getUserSubscriptions,
    getSubscriptionById,
    cancelSubscription,
    reactivateSubscription,
    renewSubscription,
    getSubscriptionStats,
    getPaymentHistory,
    updateAutoRenew,
} from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth.middleware';
import { initiatePaypackPayment } from '../controllers/paypack.controller';
import { initiatePesapalPayment } from '../controllers/pesapalIntergration.controller';

const susbscriptionRoutes = Router();
susbscriptionRoutes.get('/plans', getPlans);

// Paypack payment initiation
susbscriptionRoutes.post(
    '/organizations/paypack/initiate',
    authenticate,
    initiatePaypackPayment
);


// Organization-specific routes
susbscriptionRoutes.post(
    '/organizations/:organizationId/checkout',
    authenticate,
    createCheckout
);

susbscriptionRoutes.get(
    '/organizations/:organizationId/verify',
    authenticate,
    verifyPayment
);

susbscriptionRoutes.get(
    '/organizations/:organizationId/subscriptions',
    authenticate,
    getUserSubscriptions
);

susbscriptionRoutes.get(
    '/organizations/:organizationId/subscriptions/:id',
    authenticate,
    getSubscriptionById
);

susbscriptionRoutes.post(
    '/organizations/:organizationId/subscriptions/:id/cancel',
    authenticate,
    cancelSubscription
);

susbscriptionRoutes.post(
    '/organizations/:organizationId/subscriptions/:id/reactivate',
    authenticate,
    reactivateSubscription
);

susbscriptionRoutes.post(
    '/organizations/:organizationId/subscriptions/:id/renew',
    authenticate,
    renewSubscription
);

susbscriptionRoutes.patch(
    '/organizations/:organizationId/subscriptions/:id/auto-renew',
    authenticate,
    updateAutoRenew
);

susbscriptionRoutes.get(
    '/organizations/:organizationId/stats',
    authenticate,
    getSubscriptionStats
);

susbscriptionRoutes.get(
    '/organizations/:organizationId/payments',
    authenticate,
    getPaymentHistory
);
susbscriptionRoutes.post(
    '/organizations/:organizationId/plans/:planId/paypack/initiate',
    authenticate,
    initiatePaypackPayment
);

susbscriptionRoutes.post(
    '/organizations/:organizationId/plans/:planId/pesapal/initiate',
    authenticate,
    initiatePesapalPayment
);

export default susbscriptionRoutes;