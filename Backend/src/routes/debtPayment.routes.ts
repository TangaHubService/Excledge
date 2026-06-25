import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { branchAuth } from '../middleware/branchAuth.middleware';
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
    branchAuth,
    recordDebtPayment
);

// Get payment history for a sale
payDebtRouter.get(
    '/sale/:saleId/:organizationId',
    authenticate,
    orgAccess,
    branchAuth,
    getSalePayments
);

// Get payment history for a customer
payDebtRouter.get(
    '/customer/:customerId/:organizationId',
    authenticate,
    orgAccess,
    branchAuth,
    getCustomerDebtPayments
);

// Get all outstanding debts
payDebtRouter.get(
    '/outstanding/:organizationId',
    authenticate,
    orgAccess,
    branchAuth,
    getOutstandingDebts
);
payDebtRouter.get(
    '/all/:organizationId',
    authenticate,
    orgAccess,
    branchAuth,
    getAllPaymentHistory
);
export default payDebtRouter;
