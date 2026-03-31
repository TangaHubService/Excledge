import Joi from "joi";

export const reportsFilterSchema = Joi.object({
  branchId: Joi.string().uuid().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});
