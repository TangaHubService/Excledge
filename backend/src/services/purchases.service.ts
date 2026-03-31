import { AppDataSource } from "../config/data-source";
import { parsePagination } from "../common/http";
import { Purchase } from "../entities/Purchase";
import { PurchaseItem } from "../entities/PurchaseItem";
import { StockMovementType } from "../entities/StockMovement";
import { applyStockChange } from "./inventory.service";
import { writeAudit } from "./audit.service";
import { CreatePurchaseDto } from "../dto/purchases.dto";
import { PaginationQueryDto } from "../dto/common.dto";

export const purchasesService = {
  async list(query: PaginationQueryDto) {
    const { page, pageSize, skip } = parsePagination(query);
    const repo = AppDataSource.getRepository(Purchase);
    const [data, total] = await repo.findAndCount({
      relations: ["items"],
      skip,
      take: pageSize,
      order: { createdAt: "DESC" },
    });
    return { data, page, pageSize, total };
  },

  async create(input: CreatePurchaseDto, actorId?: string) {
    return AppDataSource.transaction(async (tx) => {
      const purchaseRepo = tx.getRepository(Purchase);
      const itemRepo = tx.getRepository(PurchaseItem);
      const purchase = await purchaseRepo.save(purchaseRepo.create({ branchId: input.branchId, supplierId: input.supplierId, referenceNo: input.referenceNo, totalAmount: "0" }));
      let total = 0;
      for (const line of input.items) {
        total += line.quantity * line.unitCost;
        await itemRepo.save(itemRepo.create({ purchaseId: purchase.id, productId: line.productId, quantity: String(line.quantity), unitCost: String(line.unitCost) }));
        await applyStockChange(
          {
            branchId: input.branchId,
            productId: line.productId,
            qtyDelta: line.quantity,
            movementType: StockMovementType.PURCHASE_IN,
            referenceType: "Purchase",
            referenceId: purchase.id,
          },
          tx,
        );
      }
      purchase.totalAmount = total.toFixed(2);
      await purchaseRepo.save(purchase);
      await writeAudit({ action: "CREATE_PURCHASE", entityType: "Purchase", entityId: purchase.id, actorId });
      return purchase;
    });
  },
};
