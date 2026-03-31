import { NextFunction, Request, Response } from "express";
import { ApiError } from "../common/http";

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // eslint-disable-next-line no-console
  console.error("[API_ERROR]", err);
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  return res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
};
