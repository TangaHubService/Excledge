import Joi from "joi";

export const purchasesCreateSchema = Joi.object({
  branchId: Joi.string().uuid().required(),
  supplierId: Joi.string().uuid().required(),
  referenceNo: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        quantity: Joi.number().positive().required(),
        unitCost: Joi.number().positive().required(),
      }),
    )
    .min(1)
    .required(),
});
