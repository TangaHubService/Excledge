"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const email_service_1 = require("./email.service");
class SubscriptionService {
    /**
     * Verifies a Stripe webhook event using the provided payload, signature, and secret
     */
    verifyWebhookEvent(payload, signature, secret) {
        return this.stripe.webhooks.constructEvent(payload, signature, secret);
    }
    constructor(prisma) {
        this.prisma = prisma;
        this.stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
            apiVersion: '2025-11-17.clover',
        });
    }
    // Get all available subscription plans with features
    async getPlans() {
        return this.prisma.subscriptionPlan.findMany({
            where: {
                isActive: true,
                price: {
                    not: 100
                }
            },
            include: {
                features: {
                    include: {
                        feature: true,
                    },
                },
            },
        });
    }
    // Get organization's current subscription
    async getOrganizationSubscription(organizationId) {
        return this.prisma.subscription.findFirst({
            where: {
                organizationId,
                status: {
                    in: ['ACTIVE', 'TRIALING']
                },
                endDate: {
                    gt: new Date(),
                },
            },
            include: {
                plan: {
                    include: {
                        features: {
                            include: {
                                feature: true,
                            },
                        },
                    },
                },
                payments: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                },
            },
        });
    }
    // Check if organization has access to a specific feature
    async hasFeatureAccess(organizationId, featureKey) {
        const subscription = await this.prisma.subscription.findFirst({
            where: {
                organizationId,
                status: {
                    in: ['ACTIVE', 'TRIALING']
                },
                endDate: {
                    gt: new Date(),
                },
                plan: {
                    features: {
                        some: {
                            isEnabled: true,
                            feature: {
                                key: featureKey,
                            },
                        },
                    },
                },
            },
        });
        return !!subscription;
    }
    async createTrial(organizationId, planId) {
        // Check if organization already has an active or trial subscription
        const existingSubscription = await this.prisma.subscription.findFirst({
            where: {
                organizationId,
                status: {
                    in: ['ACTIVE', 'TRIALING']
                }
            }
        });
        if (existingSubscription) {
            throw new Error('Organization already has an active or trial subscription');
        }
        // Get the plan with features
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: {
                id: planId,
                price: {
                    not: 100
                }
            },
            include: {
                features: {
                    include: {
                        feature: true
                    }
                }
            }
        });
        if (!plan) {
            throw new Error('Plan not found');
        }
        // Calculate trial end date (7 days from now)
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + 7);
        // Get organization with users
        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: {
                userOrganizations: {
                    include: {
                        user: true
                    }
                }
            }
        });
        if (!organization) {
            throw new Error('Organization not found');
        }
        // Create trial subscription with payment
        const [subscription] = await this.prisma.$transaction([
            this.prisma.subscription.create({
                data: {
                    organizationId,
                    planId,
                    status: 'TRIALING',
                    startDate,
                    endDate,
                    paymentMethod: 'TRIAL',
                    autoRenew: false,
                    payments: {
                        create: {
                            amount: 0,
                            currency: 'USD',
                            paymentMethod: 'TRIAL',
                            status: 'COMPLETED',
                            metadata: { type: 'TRIAL' }
                        }
                    }
                },
                include: {
                    plan: true,
                    payments: true
                }
            })
        ]);
        // Get the full subscription with relations for return type
        const fullSubscription = await this.prisma.subscription.findUnique({
            where: { id: subscription.id },
            include: {
                plan: true,
                payments: true,
                organization: {
                    include: {
                        userOrganizations: {
                            include: {
                                user: true
                            }
                        }
                    }
                }
            }
        });
        if (!fullSubscription) {
            throw new Error('Failed to create trial subscription');
        }
        // Send welcome email with trial information
        const owner = organization.userOrganizations.find((uo) => uo.isOwner)?.user;
        if (owner) {
            await this.sendTrialExpiryNotification(owner.email, endDate, fullSubscription);
        }
        return fullSubscription;
    }
    async checkExpiringTrials() {
        const twoDaysFromNow = new Date();
        twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
        const expiringTrials = await this.prisma.subscription.findMany({
            where: {
                endDate: {
                    lte: twoDaysFromNow
                },
                status: "TRIALING",
            },
            include: {
                plan: true,
                payments: true,
                organization: {
                    include: {
                        userOrganizations: {
                            include: {
                                user: true
                            }
                        }
                    }
                }
            }
        });
        for (const subscription of expiringTrials) {
            await this.sendTrialExpiryNotification(subscription.organization.userOrganizations.find((uo) => uo.isOwner)?.user.email, subscription.endDate, subscription);
        }
    }
    async sendNotification(type, email, title, message, subscription) {
        if (type === 'email') {
            await email_service_1.emailService.sendTrialExpiryEmail(email, title, message, subscription.organization.name, subscription.endDate);
        }
        else if (type === 'in-app') {
            await this.prisma.notification.create({
                data: {
                    organizationId: subscription?.organizationId,
                    title,
                    message,
                    type: 'INFO',
                    data: { expiryDate: subscription.endDate },
                    recipientId: subscription?.organization.userOrganizations.find((uo) => uo.isOwner)?.userId
                }
            });
        }
    }
    async sendTrialExpiryNotification(email, expiryDate, subscription) {
        const title = 'Your trial period is coming to an end';
        const organizationName = subscription.organization.name;
        const message = `We hope you've enjoyed your experience with ${organizationName}. Your trial is set to expire soon, and we'd love to help you continue growing your business with our full features.`;
        await this.sendNotification('email', email, title, message, subscription);
        await this.sendNotification('in-app', email, title, `Your trial will expire on ${expiryDate.toLocaleDateString()}.`, subscription);
    }
    // Create a new subscription with Stripe
    async createStripeSubscription(params) {
        const { organizationId, planId, customerEmail } = params;
        // Get the plan
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id: planId },
        });
        if (!plan) {
            throw new Error('Plan not found');
        }
        // Check if organization already has an active subscription
        const existingSubscription = await this.prisma.subscription.findFirst({
            where: {
                organizationId,
                status: 'ACTIVE',
                endDate: {
                    gt: new Date(),
                },
            },
        });
        if (existingSubscription) {
            throw new Error('Organization already has an active subscription');
        }
        // Create or retrieve Stripe customer
        let customer;
        const existingCustomers = await this.stripe.customers.list({
            email: customerEmail,
        });
        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
        }
        else {
            customer = await this.stripe.customers.create({
                email: customerEmail,
            });
        }
        // Check if Stripe price ID exists for the plan
        if (!plan.stripePriceId) {
            throw new Error('Stripe price ID is not configured for the selected plan');
        }
        // Create Stripe subscription
        const subscription = await this.stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: plan.stripePriceId }],
            expand: ['latest_invoice.payment_intent'],
        });
        const latestInvoice = subscription.latest_invoice;
        const paymentIntent = typeof latestInvoice.payment_intent === 'string'
            ? null
            : latestInvoice.payment_intent;
        // Create subscription in database
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + (plan.billingCycle === 'YEARLY' ? 12 : plan.billingCycle === 'QUARTERLY' ? 3 : 1));
        const dbSubscription = await this.prisma.subscription.create({
            data: {
                organizationId,
                planId: plan.id,
                status: paymentIntent && paymentIntent.status === 'succeeded' ? 'ACTIVE' : 'PENDING',
                startDate: new Date(),
                endDate,
                paymentMethod: 'STRIPE',
                paymentId: subscription.id,
                payments: {
                    create: {
                        amount: plan.price,
                        currency: plan.currency,
                        paymentMethod: 'STRIPE',
                        paymentId: paymentIntent?.id,
                        status: this.mapStripeStatusToPaymentStatus(paymentIntent?.status || 'unknown'),
                        metadata: {
                            stripeSubscriptionId: subscription.id,
                            stripeCustomerId: customer.id,
                            stripePaymentIntentId: paymentIntent?.id,
                        },
                    },
                },
            },
            include: {
                plan: true,
                payments: true,
            },
        });
        return {
            subscription: dbSubscription,
            clientSecret: paymentIntent?.client_secret,
            requiresAction: paymentIntent?.status === 'requires_action',
        };
    }
    // Handle Stripe webhook events
    async handleStripeWebhook(event) {
        switch (event.type) {
            case 'payment_intent.succeeded':
                return this.handlePaymentIntentSucceeded(event.data.object);
            case 'payment_intent.payment_failed':
                return this.handlePaymentIntentFailed(event.data.object);
            case 'invoice.payment_succeeded':
                return this.handleInvoicePaid(event.data.object);
            case 'customer.subscription.updated':
                return this.handleSubscriptionUpdated(event.data.object);
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    }
    // Handle Paypack payment
    async createPaypackPayment(params) {
        const { organizationId, planId, phoneNumber } = params;
        // Get the plan
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id: planId },
        });
        if (!plan) {
            throw new Error('Plan not found');
        }
        // Create a pending subscription
        const subscription = await this.prisma.subscription.create({
            data: {
                organizationId,
                planId: plan.id,
                status: 'PENDING',
                paymentMethod: 'PAYPACK',
                startDate: new Date(),
                endDate: new Date(), // Will be updated when payment is confirmed
            },
        });
        // Create a payment record with a unique payment ID
        const paymentId = `pay_${Date.now()}`;
        const payment = await this.prisma.payment.create({
            data: {
                subscriptionId: subscription.id,
                amount: plan.price,
                status: 'PENDING',
                paymentMethod: 'PAYPACK',
                currency: 'RWF',
                paymentId: paymentId,
                metadata: {
                    reference: `PAY-${Date.now()}`,
                    paymentDate: new Date().toISOString()
                },
            },
        });
        // Integrate with Paypack API to initiate the payment
        const paymentResponse = await this.initiatePaypackPayment({
            amount: plan.price,
            phoneNumber,
            reference: paymentId,
            description: `Subscription for ${plan.name}`,
        });
        // Create payment record
        await this.prisma.payment.create({
            data: {
                subscriptionId: subscription.id,
                amount: plan.price,
                currency: plan.currency,
                paymentMethod: 'PAYPACK',
                paymentId: paymentResponse.transactionId,
                status: 'PENDING',
                metadata: {
                    paypackReference: paymentResponse.reference,
                    phoneNumber,
                },
            },
        });
        return {
            subscriptionId: subscription.id,
            paymentId: paymentResponse.transactionId,
            status: paymentResponse.status || 'PENDING',
            ...Object.fromEntries(Object.entries(paymentResponse).filter(([key]) => key !== 'status'))
        };
    }
    // Helper methods
    async initiatePaypackPayment(params) {
        // This is a placeholder for the actual Paypack API integration
        // You'll need to implement this based on Paypack's API documentation
        try {
            const response = await fetch('https://api.paypack.rw/api/payments/collect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.PAYPACK_API_KEY}`,
                },
                body: JSON.stringify({
                    amount: params.amount * 100, // Convert to smallest currency unit
                    phone: params.phoneNumber,
                    reference: params.reference,
                    description: params.description,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to initiate Paypack payment');
            }
            // Map the response to our expected format
            const responseData = {
                transactionId: data.data?.transaction_id || data.reference,
                reference: data.reference,
                status: data.status || 'PENDING',
                message: data.message,
                data: data.data
            };
            return responseData;
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Paypack API error: ${error.message}`);
            }
            throw new Error('Unknown error occurred while processing Paypack payment');
        }
    }
    mapStripeStatusToPaymentStatus(status) {
        switch (status) {
            case 'succeeded':
                return 'COMPLETED';
            case 'processing':
                return 'PENDING';
            case 'requires_payment_method':
            case 'requires_confirmation':
            case 'requires_action':
            case 'canceled':
            default:
                return 'FAILED';
        }
    }
    async handlePaymentIntentSucceeded(paymentIntent) {
        // Update payment status in database
        await this.prisma.payment.updateMany({
            where: { paymentId: paymentIntent.id },
            data: {
                status: 'COMPLETED',
                processedAt: new Date(),
                metadata: {
                    ...paymentIntent.metadata,
                    stripePaymentIntentId: paymentIntent.id,
                },
            },
        });
    }
    async handlePaymentIntentFailed(paymentIntent) {
        await this.prisma.payment.updateMany({
            where: { paymentId: paymentIntent.id },
            data: {
                status: 'FAILED',
                processedAt: new Date(),
                metadata: {
                    ...paymentIntent.metadata,
                    error: paymentIntent.last_payment_error?.message,
                },
            },
        });
    }
    async handleInvoicePaid(invoice) {
        // Access the subscription ID from the invoice
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) {
            console.error('No subscription ID found on invoice');
            return;
        }
        // Update subscription end date
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
        if (!('current_period_start' in subscription) || !('current_period_end' in subscription)) {
            throw new Error('Subscription period information is missing');
        }
        await this.prisma.subscription.updateMany({
            where: { paymentId: subscriptionId },
            data: {
                status: 'ACTIVE',
                startDate: new Date(subscription.current_period_start * 1000),
                endDate: new Date(subscription.current_period_end * 1000),
            },
        });
    }
    async handleSubscriptionUpdated(subscription) {
        if (subscription.status === 'canceled') {
            await this.prisma.subscription.updateMany({
                where: { paymentId: subscription.id },
                data: {
                    status: 'CANCELED',
                    autoRenew: false,
                },
            });
        }
        else if (subscription.status === 'active') {
            const currentPeriodStart = subscription.current_period_start;
            const currentPeriodEnd = subscription.current_period_end;
            if (!currentPeriodStart || !currentPeriodEnd) {
                throw new Error('Subscription period information is missing');
            }
            await this.prisma.subscription.updateMany({
                where: { paymentId: subscription.id },
                data: {
                    status: 'ACTIVE',
                    startDate: new Date(currentPeriodStart * 1000),
                    endDate: new Date(currentPeriodEnd * 1000),
                    autoRenew: true,
                },
            });
        }
    }
}
exports.SubscriptionService = SubscriptionService;
