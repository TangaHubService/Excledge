import { In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { InventoryBalance } from "../entities/InventoryBalance";
import { Product } from "../entities/Product";
import { ApiError } from "../common/http";
import { salesService } from "./sales.service";
import { PosCatalogQueryDto, PosCheckoutDto } from "../dto/pos.dto";
import { CreateSaleDto } from "../dto/sales.dto";

export const posService = {
  async catalog(query: PosCatalogQueryDto) {
    const productRepo = AppDataSource.getRepository(Product);
    const balanceRepo = AppDataSource.getRepository(InventoryBalance);
    const qb = productRepo.createQueryBuilder("p").where("p.isActive = true");
    if (query.search) qb.andWhere("(p.name ILIKE :q OR p.sku ILIKE :q)", { q: `%${query.search}%` });
    if (query.categoryId) qb.andWhere("p.categoryId = :categoryId", { categoryId: query.categoryId });
    const products = await qb.orderBy("p.name", "ASC").getMany();
    const balances = await balanceRepo.find({ where: { branchId: query.branchId } });
    const stockMap = new Map(balances.map((b) => [b.productId, Number(b.quantity)]));
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      categoryId: p.categoryId,
      unitPrice: Number(p.unitPrice),
      stock: stockMap.get(p.id) ?? 0,
    }));
  },

  async checkout(input: PosCheckoutDto, cashierId?: string) {
    const productIds = input.items.map((i) => i.productId);
    const products = await AppDataSource.getRepository(Product).findBy({ id: In(productIds) });
    const productMap = new Map(products.map((p) => [p.id, Number(p.unitPrice)]));
    for (const line of input.items) {
      if (!productMap.has(line.productId)) throw new ApiError("NOT_FOUND", 404, "Product not found in catalog");
    }
    const saleInput: CreateSaleDto = {
      branchId: input.branchId,
      customerId: input.customerId,
      paymentMethod: input.paymentMethod,
      items: input.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: productMap.get(i.productId)!,
      })),
    };
    return salesService.create(saleInput, cashierId);
  },
};
