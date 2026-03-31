import { EntityManager } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { ApiError } from "../common/http";
import { isNegativeStock, nextStockQuantity } from "../common/stock-rules";
import { InventoryBalance } from "../entities/InventoryBalance";
import { StockMovement, StockMovementType } from "../entities/StockMovement";

type StockChangeInput = {
  branchId: string;
  productId: string;
  qtyDelta: number;
  movementType: StockMovementType;
  referenceType: string;
  referenceId: string;
  reason?: string;
};

export const applyStockChange = async (input: StockChangeInput, tx?: EntityManager) => {
  const manager = tx ?? AppDataSource.manager;
  const balanceRepo = manager.getRepository(InventoryBalance);
  const moveRepo = manager.getRepository(StockMovement);

  let balance = await balanceRepo.findOne({
    where: { branchId: input.branchId, productId: input.productId },
  });

  if (!balance) {
    balance = balanceRepo.create({
      branchId: input.branchId,
      productId: input.productId,
      quantity: "0",
    });
  }

  const currentQty = Number(balance.quantity);
  const nextQty = nextStockQuantity(currentQty, input.qtyDelta);
  if (isNegativeStock(nextQty)) {
    throw new ApiError("NEGATIVE_STOCK_BLOCKED", 400, "Insufficient stock for this operation");
  }

  balance.quantity = nextQty.toString();
  await balanceRepo.save(balance);

  const movement = moveRepo.create({
    branchId: input.branchId,
    productId: input.productId,
    quantityDelta: input.qtyDelta.toString(),
    type: input.movementType,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    reason: input.reason,
  });
  await moveRepo.save(movement);
  return balance;
};
