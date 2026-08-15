"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeShiftController = exports.getShiftSummaryController = exports.getActiveShiftController = exports.openShiftController = void 0;
const branchAuth_middleware_1 = require("../middleware/branchAuth.middleware");
const shift_service_1 = require("../services/shift.service");
const auditLogger_1 = require("../utils/auditLogger");
const openShiftController = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const userId = parseInt(req.user.userId);
        const branchId = (0, branchAuth_middleware_1.getBranchIdForOperation)(req);
        const { openingFloat, deviceId } = req.body;
        if (openingFloat === undefined || openingFloat === null || Number(openingFloat) < 0) {
            return res.status(400).json({ error: 'A valid opening float is required' });
        }
        const shift = await (0, shift_service_1.openShift)({
            organizationId,
            branchId,
            userId,
            deviceId: deviceId ? parseInt(deviceId) : undefined,
            openingFloat: Number(openingFloat),
        });
        await auditLogger_1.auditLogger.sales(req, {
            type: 'OTHER',
            description: `Shift opened with float ${openingFloat}`,
            entityType: 'Shift',
            entityId: shift.id,
            metadata: { branchId, openingFloat },
        });
        res.status(201).json(shift);
    }
    catch (error) {
        console.error('[Open Shift Error]:', error);
        res.status(400).json({ error: error.message || 'Failed to open shift' });
    }
};
exports.openShiftController = openShiftController;
const getActiveShiftController = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const userId = parseInt(req.user.userId);
        const shift = await (0, shift_service_1.getActiveShift)(organizationId, userId);
        if (!shift) {
            return res.status(404).json({ error: 'No open shift' });
        }
        res.json(shift);
    }
    catch (error) {
        console.error('[Get Active Shift Error]:', error);
        res.status(500).json({ error: error.message || 'Failed to get active shift' });
    }
};
exports.getActiveShiftController = getActiveShiftController;
const getShiftSummaryController = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const shiftId = parseInt(req.params.id);
        const shift = await (0, shift_service_1.getShiftById)(shiftId, organizationId);
        const summary = await (0, shift_service_1.computeShiftSummary)(shiftId, organizationId);
        res.json({ shift, summary });
    }
    catch (error) {
        console.error('[Get Shift Summary Error]:', error);
        res.status(404).json({ error: error.message || 'Shift not found' });
    }
};
exports.getShiftSummaryController = getShiftSummaryController;
const closeShiftController = async (req, res) => {
    try {
        const organizationId = parseInt(req.params.organizationId);
        const shiftId = parseInt(req.params.id);
        const { actualCash, closingNotes } = req.body;
        if (actualCash === undefined || actualCash === null || Number(actualCash) < 0) {
            return res.status(400).json({ error: 'A valid actual cash count is required' });
        }
        const result = await (0, shift_service_1.closeShift)({
            shiftId,
            organizationId,
            actualCash: Number(actualCash),
            closingNotes,
        });
        await auditLogger_1.auditLogger.sales(req, {
            type: 'OTHER',
            description: `Shift closed. Difference: ${result.summary.difference}`,
            entityType: 'Shift',
            entityId: shiftId,
            metadata: result.summary,
        });
        res.json(result);
    }
    catch (error) {
        console.error('[Close Shift Error]:', error);
        res.status(400).json({ error: error.message || 'Failed to close shift' });
    }
};
exports.closeShiftController = closeShiftController;
