import { prisma } from "../lib/prisma"
import { ActivityType, ExpenseCategory } from "@prisma/client"

export interface ExpenseFilterParams {
  organizationId: number
  branchId?: number
  startDate?: string
  endDate?: string
  category?: ExpenseCategory
  paymentMethod?: string
  limit?: number
  page?: number
}

export interface CreateExpenseInput {
  category: ExpenseCategory
  amount: number
  paymentMethod: string
  description: string
  reference?: string
  expenseDate: string
  notes?: string
  organizationId: number
  userId: number
  branchId: number
}

export const createExpense = async (input: CreateExpenseInput) => {
  return prisma.expense.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      branchId: input.branchId,
      category: input.category,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      description: input.description,
      reference: input.reference,
      expenseDate: new Date(input.expenseDate),
      notes: input.notes
    }
  })
}

export const getExpenses = async (params: ExpenseFilterParams) => {
  const {
    organizationId,
    branchId,
    startDate,
    endDate,
    category,
    paymentMethod,
    limit = 50,
    page = 1
  } = params

  const where: any = {
    organizationId,
    ...(branchId ? { branchId } : {}),
  }

  if (startDate && endDate) {
    where.expenseDate = {
      gte: new Date(startDate),
      lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
    }
  }

  if (category) {
    where.category = category
  }

  if (paymentMethod && paymentMethod !== 'ALL') {
    where.paymentMethod = paymentMethod
  }

  const skip = (page - 1) * limit

  const [expenses, totalCount] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { expenseDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ])

  const summary = await prisma.expense.aggregate({
    where,
    _sum: { amount: true },
    _count: true
  })

  return {
    expenses,
    totalCount,
    summary,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
  }
}

export const getExpenseById = async (id: number, organizationId: number) => {
  return prisma.expense.findFirst({
    where: { id, organizationId },
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  })
}

export const deleteExpense = async (id: number, organizationId: number) => {
  const existingExpense = await prisma.expense.findFirst({
    where: { id, organizationId },
  })

  if (!existingExpense) {
    throw new Error("Expense not found")
  }

  return prisma.expense.delete({
    where: { id },
  })
}

export const ExpenseService = {
  createExpense,
  getExpenses,
  getExpenseById,
  deleteExpense,
}