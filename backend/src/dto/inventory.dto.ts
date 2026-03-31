export interface CreateStockAdjustmentDto {
  branchId: string;
  productId: string;
  quantityDelta: number;
  reason: string;
}
