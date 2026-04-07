import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireOrganizationAccess } from '../middleware/organizationAccess.middleware';
import {
    recordDebtPayment,
    getSalePayments,
    getCustomerDebtPayments,
    getOutstandingDebts,
    getAllPaymentHistory
} from '../controllers/debtPayment.controller';

const payDebtRouter = Router();

const orgAccess = requireOrganizationAccess();

// Record a new debt payment
payDebtRouter.post(
    '/:saleId/:organizationId',
    authenticate,
    orgAccess,
    recordDebtPayment
);

// Get payment history for a sale
payDebtRouter.get(
    '/sale/:saleId/:organizationId',
    authenticate,
    orgAccess,
    getSalePayments
);

// Get payment history for a customer
payDebtRouter.get(
    '/customer/:customerId/:organizationId',
    authenticate,
    orgAccess,
    getCustomerDebtPayments
);

// Get all outstanding debts
payDebtRouter.get(
    '/outstanding/:organizationId',
    authenticate,
    orgAccess,
    getOutstandingDebts
);
payDebtRouter.get(
    '/all/:organizationId',
    authenticate,
    orgAccess,
    getAllPaymentHistory
);
export default payDebtRouter;
