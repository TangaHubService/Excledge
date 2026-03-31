import Joi from "joi";

export const branchCreateSchema = Joi.object({
  name: Joi.string().required(),
  code: Joi.string().optional().allow(""),
  currency: Joi.string().default("RWF"),
});

export const categoryCreateSchema = Joi.object({
  name: Joi.string().required(),
});

export const productCreateSchema = Joi.object({
  name: Joi.string().required(),
  sku: Joi.string().required(),
  categoryId: Joi.string().uuid().required(),
  taxCategory: Joi.string().required(),
  unitPrice: Joi.number().min(0).required(),
  reorderLevel: Joi.number().min(0).required(),
  isActive: Joi.boolean().optional(),
});

export const supplierCreateSchema = Joi.object({
  name: Joi.string().required(),
  tin: Joi.string().optional().allow("", null),
  phone: Joi.string().optional().allow("", null),
});

export const customerCreateSchema = Joi.object({
  name: Joi.string().required(),
  tin: Joi.string().optional().allow("", null),
  phone: Joi.string().optional().allow("", null),
});
