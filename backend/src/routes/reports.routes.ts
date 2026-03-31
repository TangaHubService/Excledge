import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { reportsQuerySchema } from "../validations/reports-v2.schemas";
import { reportsController } from "../controllers/reports.controller";

export const reportsRouter = Router();

reportsRouter.get("/sales-trend", authRequired, validate({ query: reportsQuerySchema }), reportsController.salesTrend);
reportsRouter.get("/inventory-value", authRequired, validate({ query: reportsQuerySchema }), reportsController.inventoryValue);
reportsRouter.get("/top-products", authRequired, validate({ query: reportsQuerySchema }), reportsController.topProducts);
reportsRouter.get("/low-stock", authRequired, validate({ query: reportsQuerySchema }), reportsController.lowStock);
reportsRouter.get("/payment-methods", authRequired, validate({ query: reportsQuerySchema }), reportsController.paymentMethods);
