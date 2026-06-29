"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiatePesapalPayment = exports.checkTransactionStatus = exports.cancelOrder = exports.requestRefund = exports.pesapalOrderRequest = exports.pesapalIpnController = void 0;
const getAcessToken_1 = require("../utils/getAcessToken");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const currencyConverter_1 = require("../utils/currencyConverter");
const config_1 = require("../config");
const PESAPAL_API_URL = process.env.PESAPAL_API_URL;
// Helper function to get transaction status
const getTransactionStatus = async (orderTrackingId) => {
    try {
        const { token } = await (0, getAcessToken_1.pesapalToken)();
        const response = await axios_1.default.get(`${PESAPAL_API_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        return response.data;
    }
    catch (error) {
        console.error("Error getting transaction status:", error);
        throw error;
    }
};
const pesapalIpnController = async (req, res) => {
    try {
        const organizationId = Number(req.params.organizationId);
        const planId = Number(req.params.planId);
        const { OrderTrackingId, OrderNotificationType, OrderMerchantReference } = req.body;
        if (OrderNotificationType === 'IPNCHANGE') {
            // Get transaction status
            const transaction = await getTransactionStatus(OrderTrackingId);
            // Update subscription based on payment status
            if (transaction.payment_status_description === 'Completed') {
                // Find the subscription by the merchant reference
                const subscription = await prisma_1.prisma.subscription.findFirst({
                    where: {
                        organizationId: Number(organizationId),
                        planId: Number(planId),
                        status: 'ACTIVE'
                    },
                    include: { plan: true }
                });
                if (subscription) {
                    const now = new Date();
                    const endDate = new Date(now);
                    endDate.setMonth(now.getMonth() + (subscription.plan.billingCycle === 'MONTHLY' ? 1 : 12));
                    await prisma_1.prisma.subscription.update({
                        where: { id: subscription.id },
                        data: {
                            status: client_1.SubscriptionStatus.ACTIVE,
                            startDate: now,
                            endDate,
                        }
                    });
                    // Record payment
                    await prisma_1.prisma.payment.create({
                        data: {
                            amount: transaction.amount,
                            currency: transaction.currency,
                            paymentMethod: 'PESAPA',
                            status: 'COMPLETED',
                            paymentId: OrderTrackingId,
                            subscription: {
                                connect: {
                                    id: subscription.id
                                }
                            },
                            createdAt: new Date(transaction.created_date)
                        }
                    });
                }
            }
            // Acknowledge IPN
            return res.status(200).json({
                orderNotificationType: "IPNCHANGE",
                orderTrackingId: OrderTrackingId,
                orderMerchantReference: OrderMerchantReference,
                status: 200
            });
        }
        res.status(200).send("IPN received");
    }
    catch (error) {
        console.error("Error processing Pesapal IPN:", error);
        res.status(500).send("Internal Server Error");
    }
};
exports.pesapalIpnController = pesapalIpnController;
const pesapalOrderRequest = async (req, res) => {
    try {
        const { token } = await (0, getAcessToken_1.pesapalToken)();
        const planId = Number(req.body.planId);
        const organizationId = Number(req.body.organizationId);
        const { user } = req.body;
        // Get plan details
        const plan = await prisma_1.prisma.subscriptionPlan.findUnique({
            where: { id: Number(planId) }
        });
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Subscription plan not found"
            });
        }
        // Check for existing active subscription
        const activeSubscription = await prisma_1.prisma.subscription.findFirst({
            where: {
                organizationId: Number(organizationId),
                planId: Number(planId),
                status: 'ACTIVE'
            }
        });
        let subscription;
        const pesapalUniqueRef = `SUB-${Date.now()}`;
        if (activeSubscription) {
            // Update existing subscription
            subscription = activeSubscription;
            await prisma_1.prisma.subscription.update({
                where: { id: activeSubscription.id },
                data: {
                    paymentMethod: 'PESAPA',
                    paymentDetails: {
                        ref: pesapalUniqueRef,
                        amount: plan.price,
                        currency: plan.currency,
                        status: 'PENDING'
                    }
                }
            });
        }
        else {
            // Create new subscription
            subscription = await prisma_1.prisma.subscription.create({
                data: {
                    planId: Number(planId),
                    organizationId: Number(organizationId),
                    status: client_1.SubscriptionStatus.PENDING,
                    paymentMethod: 'PESAPA',
                    paymentDetails: {
                        ref: pesapalUniqueRef,
                        amount: plan.price,
                        currency: plan.currency,
                        status: 'PENDING'
                    }
                }
            });
        }
        // Prepare order data for PesaPal
        let amountInRwf = plan.price;
        if (plan.currency.toUpperCase() === 'USD') {
            amountInRwf = await (0, currencyConverter_1.convertUsdToRwf)(plan.price);
        }
        const orderData = {
            id: pesapalUniqueRef,
            currency: "RWF",
            amount: Math.round(amountInRwf),
            description: `Subscription for ${plan.name} (${plan.billingCycle})`,
            callback_url: `${config_1.config.primaryFrontendUrl}/subscription/callback?planId=${planId}`,
            notification_id: process.env.PESAPAL_IPN_ID,
            billing_address: {
                email_address: user.email,
                phone_number: user.phoneNumber.slice(-10),
                first_name: user.firstName,
            }
        };
        const response = await axios_1.default.post(`${PESAPAL_API_URL}/api/Transactions/SubmitOrderRequest`, orderData, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        res.status(200).json({
            success: true,
            message: "Pesapal order created successfully",
            data: {
                ...response.data,
                subscriptionId: subscription.id
            }
        });
    }
    catch (error) {
        console.error("Error creating Pesapal order:", error.response?.data || error);
        res.status(500).json({
            success: false,
            message: "Failed to create Pesapal order",
            error: error.response?.data || error.message
        });
    }
};
exports.pesapalOrderRequest = pesapalOrderRequest;
const requestRefund = async (req, res) => {
    try {
        const { transactionId, amount, reason } = req.body;
        const { token } = await (0, getAcessToken_1.pesapalToken)();
        const response = await axios_1.default.post(`${PESAPAL_API_URL}/api/Transactions/RefundRequest`, {
            confirmation_code: transactionId,
            amount: amount.toString(),
            username: req.user?.email || 'Admin',
            remarks: reason || 'Refund requested by admin'
        }, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        res.status(200).json({
            success: true,
            message: "Refund request submitted successfully",
            data: response.data
        });
    }
    catch (error) {
        console.error("Error requesting refund:", error.response?.data || error);
        res.status(500).json({
            success: false,
            message: "Failed to process refund request",
            error: error.response?.data || error.message
        });
    }
};
exports.requestRefund = requestRefund;
const cancelOrder = async (req, res) => {
    try {
        const { orderTrackingId } = req.params;
        const { token } = await (0, getAcessToken_1.pesapalToken)();
        const response = await axios_1.default.post(`${PESAPAL_API_URL}/api/Transactions/CancelOrder`, { order_tracking_id: orderTrackingId }, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            data: response.data
        });
    }
    catch (error) {
        console.error("Error cancelling order:", error.response?.data || error);
        res.status(500).json({
            success: false,
            message: "Failed to cancel order",
            error: error.response?.data || error.message
        });
    }
};
exports.cancelOrder = cancelOrder;
const checkTransactionStatus = async (req, res) => {
    try {
        const orderTrackingId = req.params.orderTrackingId;
        const organizationId = Number(req.params.organizationId);
        const planId = Number(req.params.planId);
        if (!orderTrackingId) {
            return res.status(400).json({
                success: false,
                message: 'Order tracking ID is required'
            });
        }
        const transaction = await getTransactionStatus(orderTrackingId);
        // Reduced logging - this endpoint is called frequently by frontend
        console.log(`Transaction status check: ${orderTrackingId} - ${transaction.payment_status_description}`);
        return res.status(200).json({
            success: true,
            data: transaction
        });
    }
    catch (error) {
        console.error('Error checking transaction status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process transaction status',
            error: error.message || 'An unknown error occurred'
        });
    }
};
exports.checkTransactionStatus = checkTransactionStatus;
const initiatePesapalPayment = async (req, res) => {
    try {
        const organizationId = Number(req.params.organizationId);
        const planId = Number(req.params.planId);
        //@ts-ignore
        const userId = req.user.userId;
        // Get user and organization
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: Number(userId) },
            include: { userOrganizations: true }
        });
        if (!user || !user.userOrganizations) {
            return res.status(400).json({
                success: false,
                message: "User organization not found"
            });
        }
        // Call the existing pesapalOrderRequest with the necessary data
        req.body.organizationId = organizationId;
        req.body.planId = planId;
        req.body.user = {
            email: user.email,
            phoneNumber: user.phone,
            firstName: user.name,
            lastName: user.name
        };
        return (0, exports.pesapalOrderRequest)(req, res);
    }
    catch (error) {
        console.error("Error initiating PesaPal payment:", error);
        res.status(500).json({
            success: false,
            message: "Failed to initiate PesaPal payment",
            error: error.message
        });
    }
};
exports.initiatePesapalPayment = initiatePesapalPayment;
