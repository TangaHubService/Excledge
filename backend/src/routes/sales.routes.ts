import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { salesController } from "../controllers/sales.controller";
import { saleParamsSchema, salesCreateSchema, salesListQuerySchema } from "../validations/sales.schemas";

export const salesRouter = Router();

salesRouter.get("/", authRequired, validate({ query: salesListQuerySchema }), salesController.list);
salesRouter.post("/", authRequired, validate({ body: salesCreateSchema }), salesController.create);
salesRouter.post("/:id/cancel", authRequired, validate({ params: saleParamsSchema }), salesController.cancel);
