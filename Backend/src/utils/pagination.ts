import { PaginationParams } from "../types/pagination"

export const calculatePagination = (params: PaginationParams): {
  skip: number
  limitNum: number
  pageNum: number
  totalPages: number
} => {
  const { page = 1, limit = 50, totalItems = 0 } = params
  
  const limitNum = Math.min(Math.max(limit, 1), 500)
  const pageNum = Math.max(page, 1)
  const skip = (pageNum - 1) * limitNum
  const totalPages = Math.ceil(totalItems / limitNum)

  return { skip, limitNum, pageNum, totalPages }
}

export const buildPaginationResponse = (
  totalItems: number,
  page: number,
  limit: number
) => {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
    limit,
  }
}

export const PaginationService = {
  calculatePagination,
  buildPaginationResponse,
}