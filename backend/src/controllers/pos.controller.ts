import { NextFunction, Request, Response } from "express";
import { posService } from "../services/pos.service";

export const posController = {
  async catalog(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await posService.catalog(req.query as any);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await posService.checkout(req.body, req.user?.id);
      res.status(201).json({ success: true, data, message: "Sale completed successfully" });
    } catch (err) {
      next(err);
    }
  },
};
