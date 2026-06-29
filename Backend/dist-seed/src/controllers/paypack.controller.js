"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiatePaypackPayment = void 0;
const getAcessToken_1 = require("../utils/getAcessToken");
const axios_1 = __importDefault(require("axios"));
const paypack_1 = require("../lib/paypack");
const prisma_1 = require("../lib/prisma");
const socket_1 = require("../utils/socket");
const initiatePaypackPayment = async (req, res) => {
    try {
        const organizationId = Number(req.params.organizationId);
        const planId = Number(req.params.planId);
        const { phoneNumber } = req.body;
        const plan = await prisma_1.prisma.subscriptionPlan.findUnique({
            where: {
                id: Number(planId)
            }
        });
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }
        const activeSubscription = await prisma_1.prisma.subscription.findFirst({
            where: {
                organizationId: Number(organizationId),
                status: 'ACTIVE'
            }
        });
        let subscription;
        if (activeSubscription) {
            subscription = activeSubscription;
            await prisma_1.prisma.subscription.update({
                where: { id: activeSubscription.id },
                data: {
                    paymentDetails: {
                        ref: null,
                        amount: plan.price,
                        currency: "RWF",
                        status: "PENDING"
                    }
                }
            });
        }
        else {
            subscription = await prisma_1.prisma.subscription.create({
                data: {
                    organizationId: Number(organizationId),
                    planId: Number(planId),
                    status: 'PENDING',
                }
            });
        }
        const initiatePayment = async ({ phoneNumber }) => {
            const { access } = await (0, getAcessToken_1.getAccessToken)();
            const response = await axios_1.default.post(`${paypack_1.paypackConfig.baseUrl}/transactions/cashin`, {
                amount: plan.price,
                number: phoneNumber,
            }, {
                headers: {
                    'Authorization': `Bearer ${access}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Webhook-Mode': 'development'
                }
            });
            // Update subscription with payment reference if needed
            if (response.data?.ref) {
                await prisma_1.prisma.subscription.update({
                    where: { id: subscription.id },
                    data: {
                        paymentDetails: {
                            ref: response.data.ref,
                            amount: plan.price,
                            currency: 'RWF',
                            status: 'PENDING'
                        },
                        // Only update status if subscription was newly created
                        ...(activeSubscription ? {} : { status: 'PENDING' })
                    }
                });
            }
            return response.data;
        };
        const result = await initiatePayment({
            phoneNumber
        });
        // Emit socket event for payment initiation
        if (result?.ref) {
            console.log(`🚀 Payment initiated, emitting event for ref: ${result.ref}`);
            (0, socket_1.emitTransactionUpdate)(result.ref, {
                event: 'payment:initiated',
                status: 'pending',
                reference: result.ref,
                timestamp: new Date().toISOString()
            }, String(organizationId));
        }
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Error initiating Paypack payment:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to initiate payment'
        });
    }
};
exports.initiatePaypackPayment = initiatePaypackPayment;
