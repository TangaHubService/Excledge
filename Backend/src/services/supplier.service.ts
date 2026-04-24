import { prisma } from "../lib/prisma"

export interface SupplierFilterParams {
  organizationId: number
  showInactive?: boolean
}

export const getSuppliers = async (params: SupplierFilterParams) => {
  const { organizationId, showInactive } = params

  const where: any = { organizationId }
  if (showInactive !== true) {
    where.isActive = true
  }

  return prisma.supplier.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })
}

export const getSupplierById = async (id: number, organizationId: number) => {
  return prisma.supplier.findFirst({
    where: { id, organizationId },
  })
}

export interface CreateSupplierInput {
  name: string
  email?: string
  phone?: string
  address?: string
  contactPerson?: string
  organizationId: number
}

export const createSupplier = async (input: CreateSupplierInput) => {
  return prisma.supplier.create({
    data: {
      name: input.name,
      email: input.email || '',
      phone: input.phone || '',
      address: input.address || '',
      contactPerson: input.contactPerson || '',
      organizationId: input.organizationId,
    },
  })
}

export interface UpdateSupplierInput {
  name?: string
}

export const updateSupplier = async (
  id: number,
  organizationId: number,
  updateData: UpdateSupplierInput
) => {
  const existingSupplier = await prisma.supplier.findFirst({
    where: { id, organizationId },
  })

  if (!existingSupplier) {
    throw new Error("Supplier not found")
  }

  return prisma.supplier.update({
    where: { id },
    data: updateData,
  })
}

export const deleteSupplier = async (id: number, organizationId: number) => {
  const existingSupplier = await prisma.supplier.findFirst({
    where: { id, organizationId },
  })

  if (!existingSupplier) {
    throw new Error("Supplier not found")
  }

  return prisma.supplier.update({
    where: { id },
    data: { isActive: false }
  })
}

export const SupplierService = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
}