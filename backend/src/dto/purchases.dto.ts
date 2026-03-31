export interface PurchaseLineDto {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseDto {
  branchId: string;
  supplierId: string;
  referenceNo: string;
  items: PurchaseLineDto[];
}
