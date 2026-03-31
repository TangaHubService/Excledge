import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "./env";
import { User } from "../entities/User";
import { Role } from "../entities/Role";
import { Branch } from "../entities/Branch";
import { Category } from "../entities/Category";
import { Product } from "../entities/Product";
import { Supplier } from "../entities/Supplier";
import { Customer } from "../entities/Customer";
import { Purchase } from "../entities/Purchase";
import { PurchaseItem } from "../entities/PurchaseItem";
import { Sale } from "../entities/Sale";
import { SaleItem } from "../entities/SaleItem";
import { InventoryBalance } from "../entities/InventoryBalance";
import { StockMovement } from "../entities/StockMovement";
import { StockAdjustment } from "../entities/StockAdjustment";
import { AuditLog } from "../entities/AuditLog";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: false,
  logging: false,
  entities: [
    User,
    Role,
    Branch,
    Category,
    Product,
    Supplier,
    Customer,
    Purchase,
    PurchaseItem,
    Sale,
    SaleItem,
    InventoryBalance,
    StockMovement,
    StockAdjustment,
    AuditLog,
  ],
  migrations: ["src/migrations/*.ts"],
});
