"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveShift = getActiveShift;
exports.openShift = openShift;
exports.getShiftById = getShiftById;
exports.computeShiftSummary = computeShiftSummary;
exports.closeShift = closeShift;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
/**
 * Get the caller's currently open shift, if any (a user may only have one open shift at a time).
 */
async function getActiveShift(organizationId, userId) {
    return prisma_1.prisma.shift.findFirst({
        where: { organizationId, userId, status: client_1.ShiftStatus.OPEN },
        orderBy: { openedAt: 'desc' },
    });
}
async function openShift(params) {
    const { organizationId, branchId, userId, deviceId, openingFloat } = params;
    const existing = await getActiveShift(organizationId, userId);
    if (existing) {
        throw new Error('You already have an open shift. Close it before starting a new one.');
    }
    return prisma_1.prisma.shift.create({
        data: { organizationId, branchId, userId, deviceId, openingFloat },
    });
}
async function getShiftById(shiftId, organizationId) {
    const shift = await prisma_1.prisma.shift.findFirst({ where: { id: shiftId, organizationId } });
    if (!shift)
        throw new Error('Shift not found');
    return shift;
}
/**
 * Cash/payment-method breakdown for a shift, computed on the fly from its sales
 * rather than persisted, so it always reflects the latest sale/payment/refund state.
 */
async function computeShiftSummary(shiftId, organizationId) {
    const shift = await getShiftById(shiftId, organizationId);
    const sales = await prisma_1.prisma.sale.findMany({
        where: { shiftId, organizationId },
        select: {
            totalAmount: true,
            cashAmount: true,
            debtAmount: true,
            status: true,
            salePayments: { select: { amount: true, paymentMethod: true } },
            saleItems: { select: { dcAmt: true } },
        },
    });
    let grossSales = 0;
    let returns = 0;
    let discounts = 0;
    let creditSales = 0;
    let cashSales = 0;
    let mobileMoneySales = 0;
    let cardSales = 0;
    for (const sale of sales) {
        if (sale.status === client_1.SaleStatus.CANCELLED)
            continue;
        const amount = Number(sale.totalAmount);
        if (sale.status === client_1.SaleStatus.REFUNDED || sale.status === client_1.SaleStatus.PARTIALLY_REFUNDED) {
            returns += amount;
        }
        else {
            grossSales += amount;
        }
        creditSales += Number(sale.debtAmount);
        discounts += sale.saleItems.reduce((sum, item) => sum + Number(item.dcAmt), 0);
        if (sale.salePayments.length > 0) {
            for (const payment of sale.salePayments) {
                const paid = Number(payment.amount);
                if (payment.paymentMethod === 'CASH')
                    cashSales += paid;
                else if (payment.paymentMethod === 'MTN_MOMO' || payment.paymentMethod === 'AIRTEL_MONEY')
                    mobileMoneySales += paid;
                else if (payment.paymentMethod === 'CARD' || payment.paymentMethod === 'BANK')
                    cardSales += paid;
            }
        }
        else {
            // Legacy sales recorded cash directly on the Sale row instead of via SalePayment.
            cashSales += Number(sale.cashAmount);
        }
    }
    const expectedCash = Number(shift.openingFloat) + cashSales - returns;
    return {
        openingFloat: Number(shift.openingFloat),
        grossSales,
        cashSales,
        mobileMoneySales,
        cardSales,
        creditSales,
        returns,
        discounts,
        expectedCash,
    };
}
async function closeShift(params) {
    const { shiftId, organizationId, actualCash, closingNotes } = params;
    const shift = await getShiftById(shiftId, organizationId);
    if (shift.status === client_1.ShiftStatus.CLOSED) {
        throw new Error('Shift is already closed');
    }
    const summary = await computeShiftSummary(shiftId, organizationId);
    const difference = actualCash - summary.expectedCash;
    const closed = await prisma_1.prisma.shift.update({
        where: { id: shiftId },
        data: {
            status: client_1.ShiftStatus.CLOSED,
            closedAt: new Date(),
            expectedCash: summary.expectedCash,
            actualCash,
            difference,
            closingNotes,
        },
    });
    return { shift: closed, summary: { ...summary, actualCash, difference } };
}
