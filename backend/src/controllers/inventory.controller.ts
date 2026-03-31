import { NextFunction, Request, Response } from "express";
import { inventoryService } from "../services/inventory-domain.service";

export const inventoryController = {
  async balances(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await inventoryService.listBalances(req.query as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  async movements(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await inventoryService.listMovements(req.query as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  async createAdjustment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await inventoryService.createAdjustment(req.body, req.user?.id);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
