import type { Response } from 'express';
import type { BranchAuthRequest } from '../middleware/branchAuth.middleware';
import { getBranchIdForOperation } from '../middleware/branchAuth.middleware';
import {
  openShift,
  getActiveShift,
  getShiftById,
  computeShiftSummary,
  closeShift,
} from '../services/shift.service';
import { auditLogger } from '../utils/auditLogger';

export const openShiftController = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const userId = parseInt(req.user!.userId);
    const branchId = getBranchIdForOperation(req);
    const { openingFloat, deviceId } = req.body;

    if (openingFloat === undefined || openingFloat === null || Number(openingFloat) < 0) {
      return res.status(400).json({ error: 'A valid opening float is required' });
    }

    const shift = await openShift({
      organizationId,
      branchId,
      userId,
      deviceId: deviceId ? parseInt(deviceId) : undefined,
      openingFloat: Number(openingFloat),
    });

    await auditLogger.sales(req, {
      type: 'OTHER',
      description: `Shift opened with float ${openingFloat}`,
      entityType: 'Shift',
      entityId: shift.id,
      metadata: { branchId, openingFloat },
    });

    res.status(201).json(shift);
  } catch (error: any) {
    console.error('[Open Shift Error]:', error);
    res.status(400).json({ error: error.message || 'Failed to open shift' });
  }
};

export const getActiveShiftController = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const userId = parseInt(req.user!.userId);

    const shift = await getActiveShift(organizationId, userId);
    if (!shift) {
      return res.status(404).json({ error: 'No open shift' });
    }

    res.json(shift);
  } catch (error: any) {
    console.error('[Get Active Shift Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to get active shift' });
  }
};

export const getShiftSummaryController = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const shiftId = parseInt(req.params.id);

    const shift = await getShiftById(shiftId, organizationId);
    const summary = await computeShiftSummary(shiftId, organizationId);

    res.json({ shift, summary });
  } catch (error: any) {
    console.error('[Get Shift Summary Error]:', error);
    res.status(404).json({ error: error.message || 'Shift not found' });
  }
};

export const closeShiftController = async (req: BranchAuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const shiftId = parseInt(req.params.id);
    const { actualCash, closingNotes } = req.body;

    if (actualCash === undefined || actualCash === null || Number(actualCash) < 0) {
      return res.status(400).json({ error: 'A valid actual cash count is required' });
    }

    const result = await closeShift({
      shiftId,
      organizationId,
      actualCash: Number(actualCash),
      closingNotes,
    });

    await auditLogger.sales(req, {
      type: 'OTHER',
      description: `Shift closed. Difference: ${result.summary.difference}`,
      entityType: 'Shift',
      entityId: shiftId,
      metadata: result.summary,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Close Shift Error]:', error);
    res.status(400).json({ error: error.message || 'Failed to close shift' });
  }
};
