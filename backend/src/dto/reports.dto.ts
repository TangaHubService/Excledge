export interface ReportQueryDto {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
  groupBy?: "daily" | "weekly";
}
