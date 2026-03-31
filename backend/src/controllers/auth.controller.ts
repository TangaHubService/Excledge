import { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service";

export const authController = {
  async signup(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.signup(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.login(req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.logout(req.user!.id);
      res.json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.changePassword(req.user!.id, req.body);
      res.json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.forgotPassword(req.body.email);
      res.json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await authService.resetPassword(req.body);
      res.json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  },
};
