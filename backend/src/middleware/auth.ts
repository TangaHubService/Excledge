import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../common/http";

export type AuthUser = {
  id: string;
  role: string;
  branchId?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authRequired = (req: Request, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return next(new ApiError("UNAUTHORIZED", 401, "Missing bearer token"));
  }

  try {
    const token = auth.replace("Bearer ", "");
    req.user = jwt.verify(token, env.jwtSecret) as AuthUser;
    return next();
  } catch {
    return next(new ApiError("UNAUTHORIZED", 401, "Invalid token"));
  }
};

export const requireRoles = (...allowed: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new ApiError("UNAUTHORIZED", 401, "Authentication required"));
    if (!allowed.includes(req.user.role)) {
      return next(new ApiError("FORBIDDEN", 403, "You are not allowed to perform this action"));
    }
    return next();
  };
};
