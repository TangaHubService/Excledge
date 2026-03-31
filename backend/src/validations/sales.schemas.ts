import Joi from "joi";

export const salesCreateSchema = Joi.object({
  branchId: Joi.string().uuid().required(),
  customerId: Joi.string().uuid().optional().allow("", null),
  invoiceNo: Joi.string().optional().allow("", null),
  paymentMethod: Joi.string().valid("CASH", "MOBILE_MONEY").required(),
  cashierId: Joi.string().uuid().optional(),
  reference: Joi.string().optional().allow("", null),
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        quantity: Joi.number().positive().required(),
        unitPrice: Joi.number().positive().required(),
      }),
    )
    .min(1)
    .required(),
});

export const saleParamsSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

export const salesListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(100).optional(),
  search: Joi.string().allow("").optional(),
  branchId: Joi.string().uuid().optional(),
  cashierId: Joi.string().uuid().optional(),
  paymentMethod: Joi.string().valid("CASH", "MOBILE_MONEY").optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
});
