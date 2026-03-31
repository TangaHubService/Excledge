import j2s from "joi-to-swagger";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../validations/auth.schemas";
import { purchasesCreateSchema } from "../validations/purchases.schemas";
import { salesCreateSchema } from "../validations/sales.schemas";
import { stockAdjustmentSchema } from "../validations/inventory.schemas";
import { posCatalogSchema, posCheckoutSchema } from "../validations/pos.schemas";

const toSchema = (schema: Parameters<typeof j2s>[0]) => j2s(schema).swagger;

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Rwanda Inventory API",
    version: "1.0.0",
    description: "API documentation generated from Joi validation schemas.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/auth/signup": {
      post: {
        summary: "Sign up",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(signupSchema) } },
        },
        responses: { "201": { description: "User created" } },
      },
    },
    "/auth/login": {
      post: {
        summary: "Login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(loginSchema) } },
        },
        responses: { "200": { description: "JWT token returned" } },
      },
    },
    "/auth/change-password": {
      post: {
        summary: "Change password",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(changePasswordSchema) } },
        },
        responses: { "200": { description: "Password changed" } },
      },
    },
    "/auth/forgot-password": {
      post: {
        summary: "Request password reset",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(forgotPasswordSchema) } },
        },
        responses: { "200": { description: "Reset email sent" } },
      },
    },
    "/auth/reset-password": {
      post: {
        summary: "Reset password",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(resetPasswordSchema) } },
        },
        responses: { "200": { description: "Password reset" } },
      },
    },
    "/purchases": {
      post: {
        summary: "Create purchase",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(purchasesCreateSchema) } },
        },
        responses: { "201": { description: "Purchase created" } },
      },
    },
    "/sales": {
      post: {
        summary: "Create sale",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(salesCreateSchema) } },
        },
        responses: { "201": { description: "Sale created" } },
      },
    },
    "/inventory/adjustments": {
      post: {
        summary: "Create stock adjustment",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(stockAdjustmentSchema) } },
        },
        responses: { "201": { description: "Adjustment created" } },
      },
    },
    "/pos/catalog": {
      get: {
        summary: "POS product catalog",
        parameters: [
          { name: "branchId", in: "query", required: true, schema: toSchema(posCatalogSchema).properties.branchId },
          { name: "search", in: "query", required: false, schema: { type: "string" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "200": { description: "POS catalog response" } },
      },
    },
    "/pos/checkout": {
      post: {
        summary: "POS checkout sale",
        requestBody: {
          required: true,
          content: { "application/json": { schema: toSchema(posCheckoutSchema) } },
        },
        responses: { "201": { description: "Sale completed" } },
      },
    },
  },
};
