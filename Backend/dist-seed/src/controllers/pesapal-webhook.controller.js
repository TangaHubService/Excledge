"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePesapalWebhook = void 0;
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../utils/socket");
const getAcessToken_1 = require("../utils/getAcessToken");
const axios_1 = __importDefault(require("axios"));
const paypack_1 = require("../lib/paypack");
const PESAPAL_API_URL = paypack_1.pesapalConfig.baseUrl;
const logWebhook = (message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] PESAPAL WEBHOOK: ${message}`, data || '');
};
/**
 * Handle Pesapal webhook/callback
 * This is called when Pesapal sends a notification about a transaction
 */
const handlePesapalWebhook = async (req, res) => {
    try {
        logWebhook('Webhook received', req.body);
        const { OrderTrackingId, OrderNotificationType, OrderMerchantReference } = req.body;
        if (!OrderTrackingId) {
            logWebhook('Missing OrderTrackingId');
            return res.status(400).json({
                success: false,
                message: 'OrderTrackingId is required'
            });
        }
        // Fetch the transaction status from Pesapal
        const transactionStatus = await getTransactionStatus(OrderTrackingId);
        logWebhook('Transaction status fetched', transactionStatus);
        // Process the transaction if it's completed
        if (transactionStatus.payment_status_description === 'Completed') {
            await handleCompletedTransaction(transactionStatus);
        }
        // Acknowledge the webhook
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully',
            orderTrackingId: OrderTrackingId,
            orderNotificationType: OrderNotificationType || 'CALLBACK'
        });
        logWebhook('Webhook processed successfully');
    }
    catch (error) {
        console.error('Error processing Pesapal webhook:', error);
        res.status(500).json({
            error: 'Error processing webhook',
            message: error.message
        });
    }
};
exports.handlePesapalWebhook = handlePesapalWebhook;
/**
 * Get transaction status from Pesapal API
 */
async function getTransactionStatus(orderTrackingId) {
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
}
/**
 * Handle completed transaction - similar to Paypack's handleProcessedTransaction
 */
async function handleCompletedTransaction(transactionStatus) {
    try {
        logWebhook('Processing completed transaction', {
            merchantRef: transactionStatus.merchant_reference,
            amount: transactionStatus.amount,
            status: transactionStatus.payment_status_description
        });
        // Find subscription by merchant reference
        const subscription = await prisma_1.prisma.subscription.findFirst({
            where: {
                paymentDetails: {
                    path: ['ref'],
                    equals: transactionStatus.merchant_reference
                }
            },
            include: {
                plan: true
            }
        });
        if (!subscription) {
            console.warn('No subscription found for merchant reference:', transactionStatus.merchant_reference);
            return;
        }
        logWebhook('Subscription found', { id: subscription.id, status: subscription.status });
        // Idempotency guard: this endpoint can be replayed by anyone who has seen
        // the orderTrackingId (e.g. via the browser redirect URL), so make sure we
        // don't extend the subscription again for a transaction already recorded.
        const existingPayment = await prisma_1.prisma.payment.findFirst({
            where: { paymentId: transactionStatus.order_tracking_id },
        });
        if (existingPayment) {
            logWebhook('Payment for this order already processed. Skipping.', {
                orderTrackingId: transactionStatus.order_tracking_id,
            });
            return;
        }
        // Map Pesapal status to internal PaymentStatus
        const mapPesapalStatusToPaymentStatus = (status) => {
            const statusMap = {
                'completed': 'COMPLETED',
                'failed': 'FAILED',
                'pending': 'PENDING',
                'invalid': 'FAILED',
                'reversed': 'REFUNDED'
            };
            return statusMap[status.toLowerCase()] || 'FAILED';
        };
        // Create payment record
        const payment = await prisma_1.prisma.payment.create({
            data: {
                amount: transactionStatus.amount,
                currency: transactionStatus.currency,
                status: mapPesapalStatusToPaymentStatus(transactionStatus.payment_status_description),
                paymentMethod: 'PESAPA',
                paymentId: transactionStatus.order_tracking_id,
                subscriptionId: subscription.id,
                metadata: {
                    payment_method: transactionStatus.payment_method,
                    confirmation_code: transactionStatus.confirmation_code,
                    payment_account: transactionStatus.payment_account,
                    description: transactionStatus.description,
                    status_code: transactionStatus.status_code
                }
            }
        });
        logWebhook('Payment record created', { paymentId: payment.id });
        // Prepare subscription update
        const updateData = {
            paymentDetails: {
                ...subscription.paymentDetails,
                status: transactionStatus.payment_status_description,
                processedAt: new Date(transactionStatus.created_date),
                amount: transactionStatus.amount,
                transactionRef: transactionStatus.order_tracking_id,
                confirmationCode: transactionStatus.confirmation_code,
                paymentMethod: transactionStatus.payment_method
            }
        };
        /** -------------------------------------------
         *   PAYMENT SUCCESS → NEW ACTIVATION OR RENEWAL
         *  ------------------------------------------- */
        if (transactionStatus.payment_status_description === 'Completed') {
            const now = new Date();
            if (subscription.status === 'ACTIVE') {
                /** ---------------------------
                 * 🔁 RENEWAL LOGIC
                 * ----------------------------*/
                const currentEnd = subscription.endDate ?? now;
                const newEndDate = new Date(currentEnd);
                // Add billing cycle duration
                if (subscription.plan.billingCycle === 'MONTHLY') {
                    newEndDate.setMonth(newEndDate.getMonth() + 1);
                }
                else if (subscription.plan.billingCycle === 'YEARLY') {
                    newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                }
                updateData.endDate = newEndDate;
                updateData.status = 'ACTIVE';
                logWebhook('Renewing subscription', {
                    newEndDate: newEndDate.toISOString()
                });
            }
            else {
                /** ---------------------------
                 * 🆕 NEW SUBSCRIPTION ACTIVATION
                 * ----------------------------*/
                updateData.status = 'ACTIVE';
                updateData.startDate = now;
                const endDate = new Date(now);
                if (subscription.plan.billingCycle === 'MONTHLY') {
                    endDate.setMonth(endDate.getMonth() + 1);
                }
                else if (subscription.plan.billingCycle === 'YEARLY') {
                    endDate.setFullYear(endDate.getFullYear() + 1);
                }
                updateData.endDate = endDate;
                logWebhook('Activating new subscription', {
                    startDate: now.toISOString(),
                    endDate: endDate.toISOString()
                });
            }
        }
        // Update subscription
        const updatedSubscription = await prisma_1.prisma.subscription.update({
            where: { id: subscription.id },
            data: updateData
        });
        logWebhook('Subscription updated', {
            id: updatedSubscription.id,
            status: updatedSubscription.status
        });
        // Emit WebSocket event for real-time updates
        const io = (0, socket_1.getIO)();
        const eventData = {
            event: 'payment:processed',
            status: transactionStatus.payment_status_description,
            subscription: {
                id: updatedSubscription.id,
                status: updatedSubscription.status,
                plan: updatedSubscription.planId,
                endDate: updatedSubscription.endDate
            },
            payment: {
                id: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                reference: payment.paymentId,
                status: payment.status,
                timestamp: new Date().toISOString()
            }
        };
        // Emit to the specific transaction room
        io.to(`trx-${transactionStatus.order_tracking_id}`).emit('transactionUpdate', eventData);
        logWebhook('WebSocket event emitted', {
            room: `trx-${transactionStatus.order_tracking_id}`
        });
    }
    catch (error) {
        console.error('Error processing completed transaction:', error);
        throw error;
    }
}
