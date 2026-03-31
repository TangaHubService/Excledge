import { Router } from "express";
import { authRequired, requireRoles } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { inventoryController } from "../controllers/inventory.controller";
import { paginationSchema } from "../validations/common.schemas";
import { stockAdjustmentSchema } from "../validations/inventory.schemas";

export const inventoryRouter = Router();

inventoryRouter.get("/balances", authRequired, validate({ query: paginationSchema }), inventoryController.balances);
inventoryRouter.get("/movements", authRequired, validate({ query: paginationSchema }), inventoryController.movements);
inventoryRouter.post(
  "/adjustments",
  authRequired,
  requireRoles("ADMIN", "MANAGER"),
  validate({ body: stockAdjustmentSchema }),
  inventoryController.createAdjustment,
);
