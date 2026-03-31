import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/error-handler";
import { authRouter } from "./routes/auth.routes";
import { masterRouter } from "./routes/master.routes";
import { purchasesRouter } from "./routes/purchases.routes";
import { salesRouter } from "./routes/sales.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { reportsRouter } from "./routes/reports.routes";
import { openApiDocument } from "./docs/openapi";
import { posRouter } from "./routes/pos.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ success: true }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1", masterRouter);
app.use("/api/v1/purchases", purchasesRouter);
app.use("/api/v1/sales", salesRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/pos", posRouter);
app.get("/api/v1/openapi.json", (_req, res) => res.json(openApiDocument));

app.use(errorHandler);
