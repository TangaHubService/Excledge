import { NextFunction, Request, Response } from "express";
import { ObjectLiteral } from "typeorm";
import { masterService } from "../services/master.service";

export const buildMasterController = <T extends ObjectLiteral>(
  entity: new () => T,
  alias: string,
  searchableKeys: string[],
) => ({
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await masterService.list(entity, alias, searchableKeys, req.query as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await masterService.create(entity, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
});
