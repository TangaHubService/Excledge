import { Router } from "express";
import { Category } from "../entities/Category";
import { Product } from "../entities/Product";
import { Supplier } from "../entities/Supplier";
import { Customer } from "../entities/Customer";
import { Branch } from "../entities/Branch";
import { authRequired } from "../middleware/auth";
import { buildMasterController } from "../controllers/master.controller";
import { validate } from "../middleware/validate";
import { paginationSchema } from "../validations/common.schemas";
import {
  branchCreateSchema,
  categoryCreateSchema,
  customerCreateSchema,
  productCreateSchema,
  supplierCreateSchema,
} from "../validations/master.schemas";

export const masterRouter = Router();
const branchController = buildMasterController(Branch, "branches", ["name"]);
const categoryController = buildMasterController(Category, "categories", ["name"]);
const productController = buildMasterController(Product, "products", ["name", "sku"]);
const supplierController = buildMasterController(Supplier, "suppliers", ["name"]);
const customerController = buildMasterController(Customer, "customers", ["name"]);

masterRouter.get("/branches", authRequired, validate({ query: paginationSchema }), branchController.list);
masterRouter.post("/branches", authRequired, validate({ body: branchCreateSchema }), branchController.create);
masterRouter.get("/categories", authRequired, validate({ query: paginationSchema }), categoryController.list);
masterRouter.post("/categories", authRequired, validate({ body: categoryCreateSchema }), categoryController.create);
masterRouter.get("/products", authRequired, validate({ query: paginationSchema }), productController.list);
masterRouter.post("/products", authRequired, validate({ body: productCreateSchema }), productController.create);
masterRouter.get("/suppliers", authRequired, validate({ query: paginationSchema }), supplierController.list);
masterRouter.post("/suppliers", authRequired, validate({ body: supplierCreateSchema }), supplierController.create);
masterRouter.get("/customers", authRequired, validate({ query: paginationSchema }), customerController.list);
masterRouter.post("/customers", authRequired, validate({ body: customerCreateSchema }), customerController.create);
