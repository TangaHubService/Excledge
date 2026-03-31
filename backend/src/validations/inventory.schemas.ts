import Joi from "joi";

export const stockAdjustmentSchema = Joi.object({
  branchId: Joi.string().uuid().required(),
  productId: Joi.string().uuid().required(),
  quantityDelta: Joi.number().required(),
  reason: Joi.string().min(2).required(),
});
