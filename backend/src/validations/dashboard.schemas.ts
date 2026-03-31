import Joi from "joi";

export const dashboardSummaryQuerySchema = Joi.object({
  branchId: Joi.string().uuid().optional(),
  days: Joi.number().integer().min(1).max(365).optional(),
});
