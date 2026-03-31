export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};

export const parsePagination = (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
};
