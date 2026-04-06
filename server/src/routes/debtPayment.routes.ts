import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
    recordDebtPayment,
    getSalePayments,
    getCustomerDebtPayments,
    getOutstandingDebts,
    getAllPaymentHistory
} from '../controllers/debtPayment.controller';

const payDebtRouter = Router();

// Record a new debt payment
payDebtRouter.post(
    '/:saleId/:organizationId',
    authenticate,
    recordDebtPayment
);

// Get payment history for a sale
payDebtRouter.get(
    '/sale/:saleId/:organizationId',
    authenticate,
    getSalePayments
);

// Get payment history for a customer
payDebtRouter.get(
    '/customer/:customerId/:organizationId',
    authenticate,
    getCustomerDebtPayments
);

// Get all outstanding debts
payDebtRouter.get(
    '/outstanding/:organizationId',
    authenticate,
    getOutstandingDebts
);
payDebtRouter.get(
    '/all/:organizationId',
    authenticate,
    getAllPaymentHistory
);
export default payDebtRouter;
