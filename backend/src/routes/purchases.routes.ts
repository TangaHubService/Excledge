import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { purchasesController } from "../controllers/purchases.controller";
import { paginationSchema } from "../validations/common.schemas";
import { purchasesCreateSchema } from "../validations/purchases.schemas";

export const purchasesRouter = Router();

purchasesRouter.get("/", authRequired, validate({ query: paginationSchema }), purchasesController.list);
purchasesRouter.post("/", authRequired, validate({ body: purchasesCreateSchema }), purchasesController.create);
