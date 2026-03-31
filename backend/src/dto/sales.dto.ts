export interface SaleLineDto {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateSaleDto {
  branchId: string;
  customerId?: string;
  invoiceNo?: string;
  paymentMethod?: "CASH" | "MOBILE_MONEY";
  cashierId?: string;
  reference?: string;
  items: SaleLineDto[];
}
