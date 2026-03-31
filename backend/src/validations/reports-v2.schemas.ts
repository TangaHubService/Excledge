import Joi from "joi";

export const reportsQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  branchId: Joi.string().uuid().optional(),
  categoryId: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  groupBy: Joi.string().valid("daily", "weekly").optional(),
});
