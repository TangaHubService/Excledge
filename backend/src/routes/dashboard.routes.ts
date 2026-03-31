import { Router } from "express";
import { AppDataSource } from "../config/data-source";
import { Product } from "../entities/Product";
import { InventoryBalance } from "../entities/InventoryBalance";
import { Sale } from "../entities/Sale";
import { Purchase } from "../entities/Purchase";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { dashboardSummaryQuerySchema } from "../validations/dashboard.schemas";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", authRequired, validate({ query: dashboardSummaryQuerySchema }), async (_req, res, next) => {
  try {
    const productRepo = AppDataSource.getRepository(Product);
    const balanceRepo = AppDataSource.getRepository(InventoryBalance);
    const salesRepo = AppDataSource.getRepository(Sale);
    const purchaseRepo = AppDataSource.getRepository(Purchase);

    const [totalProducts, balances, recentSales, recentPurchases] = await Promise.all([
      productRepo.count(),
      balanceRepo.find(),
      salesRepo.find({ order: { createdAt: "DESC" }, take: 10 }),
      purchaseRepo.find({ order: { createdAt: "DESC" }, take: 10 }),
    ]);

    const totalStockQuantity = balances.reduce((sum, b) => sum + Number(b.quantity), 0);
    const lowStockItems = balances.filter((b) => Number(b.quantity) <= 5).length;

    res.json({
      success: true,
      data: { totalProducts, totalStockQuantity, lowStockItems, recentSales, recentPurchases },
    });
  } catch (err) {
    next(err);
  }
});
