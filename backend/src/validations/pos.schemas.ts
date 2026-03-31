import Joi from "joi";

export const posCatalogSchema = Joi.object({
  branchId: Joi.string().uuid().required(),
  search: Joi.string().optional().allow(""),
  categoryId: Joi.string().uuid().optional(),
});

export const posCheckoutSchema = Joi.object({
  branchId: Joi.string().uuid().required(),
  customerId: Joi.string().uuid().optional().allow("", null),
  paymentMethod: Joi.string().valid("CASH", "MOBILE_MONEY").required(),
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        quantity: Joi.number().positive().required(),
      }),
    )
    .min(1)
    .required(),
});
