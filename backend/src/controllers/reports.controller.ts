import { NextFunction, Request, Response } from "express";
import { reportsService } from "../services/reports.service";

export const reportsController = {
  async salesTrend(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reportsService.salesTrend(req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
  async inventoryValue(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reportsService.inventoryValue(req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
  async topProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reportsService.topProducts(req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
  async lowStock(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reportsService.lowStock(req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
  async paymentMethods(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reportsService.paymentMethods(req.query as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};
