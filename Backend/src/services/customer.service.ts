import { prisma } from "../lib/prisma"

export interface CustomerFilterParams {
  organizationId: number
  search?: string
  hasDebt?: boolean
  showInactive?: boolean
  limit?: number
  page?: number
}

export const getCustomers = async (params: CustomerFilterParams) => {
  const { organizationId, search, hasDebt, showInactive, limit = 50, page = 1 } = params

  const limitNum = Math.min(Math.max(limit, 1), 500)
  const pageNum = Math.max(page, 1)
  const skip = (pageNum - 1) * limitNum

  const where: any = { organizationId, deletedAt: null }

  if (showInactive !== true) {
    where.isActive = true
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ]
  }

  if (hasDebt === true) {
    where.balance = { gt: 0 }
  }

  const [customers, totalCustomers] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        customerType: true,
        TIN: true,
        balance: true,
        isActive: true,
        _count: {
          select: { sales: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.customer.count({ where }),
  ])

  return {
    customers,
    count: totalCustomers,
    totalPages: Math.ceil(totalCustomers / limitNum),
    pagination: {
      total: totalCustomers,
      page: pageNum,
      limit: limitNum,
    },
  }
}

export const getCustomerById = async (id: number, organizationId: number) => {
  return prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      customerType: true,
      TIN: true,
      address: true,
      balance: true,
      isActive: true,
      sales: {
        select: {
          id: true,
          saleNumber: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          paymentType: true,
          debtAmount: true,
          saleItems: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })
}

export interface CreateCustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  customerType?: 'INDIVIDUAL' | 'INSURANCE' | 'CORPORATE'
  balance?: number
  organizationId: number
}

export const createCustomer = async (input: CreateCustomerInput) => {
  return prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone || '',
      email: input.email || '',
      customerType: input.customerType || 'INDIVIDUAL',
      balance: input.balance || 0,
      organizationId: input.organizationId,
    },
  })
}

export interface UpdateCustomerInput {
  name?: string
  phone?: string
  email?: string
  customerType?: 'INDIVIDUAL' | 'INSURANCE' | 'CORPORATE'
  TIN?: string
  address?: string
  isActive?: boolean
}

export const updateCustomer = async (
  id: number,
  organizationId: number,
  updateData: UpdateCustomerInput
) => {
  const existingCustomer = await prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null },
  })

  if (!existingCustomer) {
    throw new Error("Customer not found")
  }

  return prisma.customer.update({
    where: { id },
    data: updateData,
  })
}

export const deleteCustomer = async (id: number, organizationId: number) => {
  const existingCustomer = await prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null },
  })

  if (!existingCustomer) {
    throw new Error("Customer not found")
  }

  return prisma.customer.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() }
  })
}

export const CustomerService = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
}