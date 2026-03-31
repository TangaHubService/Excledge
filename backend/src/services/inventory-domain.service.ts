import { AppDataSource } from "../config/data-source";
import { parsePagination } from "../common/http";
import { InventoryBalance } from "../entities/InventoryBalance";
import { StockMovement, StockMovementType } from "../entities/StockMovement";
import { StockAdjustment } from "../entities/StockAdjustment";
import { applyStockChange } from "./inventory.service";
import { writeAudit } from "./audit.service";
import { PaginationQueryDto } from "../dto/common.dto";
import { CreateStockAdjustmentDto } from "../dto/inventory.dto";

export const inventoryService = {
  async listBalances(query: PaginationQueryDto) {
    const { page, pageSize, skip } = parsePagination(query);
    const repo = AppDataSource.getRepository(InventoryBalance);
    const [data, total] = await repo.findAndCount({ skip, take: pageSize, order: { updatedAt: "DESC" } });
    return { data, page, pageSize, total };
  },

  async listMovements(query: PaginationQueryDto) {
    const { page, pageSize, skip } = parsePagination(query);
    const repo = AppDataSource.getRepository(StockMovement);
    const [data, total] = await repo.findAndCount({ skip, take: pageSize, order: { createdAt: "DESC" } });
    return { data, page, pageSize, total };
  },

  async createAdjustment(input: CreateStockAdjustmentDto, actorId?: string) {
    return AppDataSource.transaction(async (tx) => {
      const adjustmentRepo = tx.getRepository(StockAdjustment);
      const adjustment = await adjustmentRepo.save(
        adjustmentRepo.create({
          branchId: input.branchId,
          productId: input.productId,
          quantityDelta: String(input.quantityDelta),
          reason: input.reason,
          performedBy: actorId,
        }),
      );
      await applyStockChange(
        {
          branchId: input.branchId,
          productId: input.productId,
          qtyDelta: Number(input.quantityDelta),
          movementType: StockMovementType.ADJUSTMENT,
          referenceType: "StockAdjustment",
          referenceId: adjustment.id,
          reason: input.reason,
        },
        tx,
      );
      await writeAudit({ action: "CREATE_STOCK_ADJUSTMENT", entityType: "StockAdjustment", entityId: adjustment.id, actorId });
      return adjustment;
    });
  },
};
