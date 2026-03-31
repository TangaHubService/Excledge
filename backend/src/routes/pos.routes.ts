import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { posController } from "../controllers/pos.controller";
import { posCatalogSchema, posCheckoutSchema } from "../validations/pos.schemas";

export const posRouter = Router();

posRouter.get("/catalog", authRequired, validate({ query: posCatalogSchema }), posController.catalog);
posRouter.post("/checkout", authRequired, validate({ body: posCheckoutSchema }), posController.checkout);
