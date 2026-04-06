import { Request, Response } from 'express';
import { getAccessToken } from '../utils/getAcessToken';
import axios from 'axios';
import { paypackConfig } from '../lib/paypack';
import { prisma } from '../lib/prisma';
import { emitTransactionUpdate } from '../utils/socket';
export const initiatePaypackPayment = async (req: Request, res: Response) => {
    try {
        const organizationId = Number(req.params.organizationId);
        const planId = Number(req.params.planId);
        const { phoneNumber } = req.body;
        const plan = await prisma.subscriptionPlan.findUnique({
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
        const activeSubscription = await prisma.subscription.findFirst({
            where: {
                organizationId: Number(organizationId),
                status: 'ACTIVE'
            }
        })

        let subscription;
        if (activeSubscription) {
            subscription = activeSubscription;
            await prisma.subscription.update({
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
        } else {
            subscription = await prisma.subscription.create({
                data: {
                    organizationId: Number(organizationId),
                    planId: Number(planId),
                    status: 'PENDING',
                }
            });
        }
        const initiatePayment = async ({
            phoneNumber
        }: {
            phoneNumber: string;
        }) => {
            const { access } = await getAccessToken();
            const response = await axios.post(
                `${paypackConfig.baseUrl}/transactions/cashin`,
                {
                    amount: plan.price,
                    number: phoneNumber,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${access}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Webhook-Mode': 'development'
                    }
                }
            );

            // Update subscription with payment reference if needed
            if (response.data?.ref) {
                await prisma.subscription.update({
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
            emitTransactionUpdate(result.ref, {
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
    } catch (error: any) {
        console.error('Error initiating Paypack payment:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to initiate payment'
        });
    }
};
