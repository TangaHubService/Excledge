import { NextFunction, Request, Response } from "express";
import { purchasesService } from "../services/purchases.service";

export const purchasesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.list(req.query as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await purchasesService.create(req.body, req.user?.id);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
