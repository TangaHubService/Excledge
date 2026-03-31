import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { Role } from "../entities/Role";
import { Branch } from "../entities/Branch";
import { User } from "../entities/User";
import { Category } from "../entities/Category";
import { Product } from "../entities/Product";
import { Supplier } from "../entities/Supplier";
import { Customer } from "../entities/Customer";
import { InventoryBalance } from "../entities/InventoryBalance";

async function seed() {
  await AppDataSource.initialize();
  const roleRepo = AppDataSource.getRepository(Role);
  const branchRepo = AppDataSource.getRepository(Branch);
  const userRepo = AppDataSource.getRepository(User);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const supplierRepo = AppDataSource.getRepository(Supplier);
  const customerRepo = AppDataSource.getRepository(Customer);
  const balanceRepo = AppDataSource.getRepository(InventoryBalance);

  const roles = ["ADMIN", "MANAGER", "CASHIER"];
  for (const roleName of roles) {
    const existing = await roleRepo.findOne({ where: { name: roleName } });
    if (!existing) await roleRepo.save(roleRepo.create({ name: roleName, permissions: [] }));
  }

  let branch = await branchRepo.findOne({ where: { name: "Main Branch" } });
  if (!branch) branch = await branchRepo.save(branchRepo.create({ name: "Main Branch", code: "MAIN", currency: "RWF" }));

  const adminRole = await roleRepo.findOneByOrFail({ name: "ADMIN" });
  const admin = await userRepo.findOne({ where: { email: "admin@inventory.rw" } });
  if (!admin) {
    const passwordHash = await bcrypt.hash("Admin123!", 10);
    await userRepo.save(
      userRepo.create({
        email: "admin@inventory.rw",
        fullName: "System Admin",
        passwordHash,
        roleId: adminRole.id,
        branchId: branch.id,
      }),
    );
  }

  const categoryNames = ["Medicine", "Food", "Beverages"];
  const categoryIds = new Map<string, string>();
  for (const name of categoryNames) {
    let category = await categoryRepo.findOne({ where: { name } });
    if (!category) category = await categoryRepo.save(categoryRepo.create({ name }));
    categoryIds.set(name, category.id);
  }

  const suppliers = ["Local Supplier Ltd", "Kigali Pharma"];
  for (const name of suppliers) {
    const existing = await supplierRepo.findOne({ where: { name } });
    if (!existing) await supplierRepo.save(supplierRepo.create({ name }));
  }

  const customers = ["Walk-in Customer", "Retail Customer"];
  for (const name of customers) {
    const existing = await customerRepo.findOne({ where: { name } });
    if (!existing) await customerRepo.save(customerRepo.create({ name }));
  }

  const products = [
    { name: "Paracetamol", sku: "MED-PAR-001", category: "Medicine", price: 1200, stock: 80, reorderLevel: 10 },
    { name: "Sugar", sku: "FOOD-SUG-001", category: "Food", price: 1800, stock: 120, reorderLevel: 20 },
    { name: "Soft Drinks", sku: "BEV-SDR-001", category: "Beverages", price: 1000, stock: 200, reorderLevel: 25 },
    { name: "Rice", sku: "FOOD-RIC-001", category: "Food", price: 2200, stock: 100, reorderLevel: 20 },
    { name: "Cooking Oil", sku: "FOOD-OIL-001", category: "Food", price: 3500, stock: 60, reorderLevel: 10 },
  ];

  for (const item of products) {
    let product = await productRepo.findOne({ where: { sku: item.sku } });
    if (!product) {
      product = await productRepo.save(
        productRepo.create({
          name: item.name,
          sku: item.sku,
          categoryId: categoryIds.get(item.category)!,
          taxCategory: "VAT_18",
          unitPrice: String(item.price),
          reorderLevel: String(item.reorderLevel),
          isActive: true,
        }),
      );
    }
    const balance = await balanceRepo.findOne({ where: { branchId: branch.id, productId: product.id } });
    if (!balance) {
      await balanceRepo.save(
        balanceRepo.create({
          branchId: branch.id,
          productId: product.id,
          quantity: String(item.stock),
        }),
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log("Seed completed");
  await AppDataSource.destroy();
}

seed().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
