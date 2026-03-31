export interface PosCatalogQueryDto {
  branchId: string;
  search?: string;
  categoryId?: string;
}

export interface PosCheckoutDto {
  branchId: string;
  customerId?: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  items: Array<{ productId: string; quantity: number }>;
}
