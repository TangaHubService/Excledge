import { NextFunction, Request, Response } from "express";
import { salesService } from "../services/sales.service";

export const salesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesService.list(req.query as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesService.create(req.body, req.user?.id);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await salesService.cancel(String(req.params.id), req.user?.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
