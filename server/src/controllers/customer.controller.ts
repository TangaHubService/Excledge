import type { Response } from "express"
import type { AuthRequest } from "../middleware/auth.middleware"
import { auditLogger } from "../utils/auditLogger"
import * as XLSX from "xlsx"
import { validateCustomerRow } from "../services/import-validation.service"
import { createPreviewSession, getPreviewSession, deletePreviewSession } from "../services/preview-session.service"
import { prisma } from "../lib/prisma"

export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params?.organizationId)
    const { search, hasDebt, showInactive } = req.query
    const { page = "1", limit = "50" } = req.query

    // Apply pagination defaults and caps
    const limitNum = Math.min(Math.max(Number.parseInt(limit as string) || 50, 1), 500)
    const pageNum = Math.max(Number.parseInt(page as string) || 1, 1)
    const skip = (pageNum - 1) * limitNum

    const where: any = { organizationId, deletedAt: null }

    if (showInactive !== "true") {
      where.isActive = true
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ]
    }

    if (hasDebt === "true") {
      where.balance = { gt: 0 }
    }

    const customers = await prisma.customer.findMany({
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
    })

    const totalCustomers = await prisma.customer.count({ where })
    const totalPages = Math.ceil(totalCustomers / limitNum)

    res.json({
      customers,
      count: totalCustomers,
      totalPages,
      pagination: {
        total: totalCustomers,
        page: Number(page),
        limit: Number(limit),
      },
    })
  } catch (error) {
    console.error("[Get Customers Error]:", error)
    res.status(500).json({ error: "Failed to get customers" })
  }
}

export const getCustomerById = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID is required" })
    }

    const customer = await prisma.customer.findFirst({
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

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    res.json(customer)
  } catch (error) {
    console.error("[Get Customer Error]:", error)
    res.status(500).json({ error: "Failed to get customer" })
  }
}

export const createCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params?.organizationId)
    const { name, phone, email, type, balance } = req.body

    // Validate and map customerType
    let customerType: 'INDIVIDUAL' | 'INSURANCE' | 'CORPORATE' = 'INDIVIDUAL'
    if (type === 'INSURANCE' || type === 'CORPORATE') {
      customerType = type
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        email,
        customerType,
        balance: balance || 0,
        organizationId,
      },
    })

    await auditLogger.customers(req, {
      type: 'CUSTOMER_CREATE',
      description: `Customer "${customer.name}" created successfully`,
      entityType: 'Customer',
      entityId: customer.id,
      metadata: { customer }
    });

    res.status(201).json(customer)
  } catch (error) {
    console.error("[Create Customer Error]:", error)
    res.status(500).json({ error: "Failed to create customer" })
  }
}

export const updateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params.organizationId)
    const { balance, ...updateData } = req.body

    const existingCustomer = await prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!existingCustomer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    const customer = await prisma.customer.update({
      where: { id: existingCustomer.id },
      data: updateData,
    })

    await auditLogger.customers(req, {
      type: 'CUSTOMER_UPDATE',
      description: `Customer "${customer.name}" updated successfully`,
      entityType: 'Customer',
      entityId: customer.id,
      metadata: {
        previousData: existingCustomer,
        updatedData: customer,
      }
    });

    res.json(customer)
  } catch (error) {
    console.error("[Update Customer Error]:", error)
    res.status(500).json({ error: "Failed to update customer" })
  }
}

export const deleteCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const organizationId = parseInt(req.params?.organizationId)

    const existingCustomer = await prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    })

    if (!existingCustomer) {
      return res.status(404).json({ error: "Customer not found" })
    }

    await prisma.customer.update({
      where: { id: existingCustomer.id },
      data: { isActive: false, deletedAt: new Date() },
    })

    await auditLogger.customers(req, {
      type: 'CUSTOMER_ARCHIVED',
      description: `Customer "${existingCustomer.name}" archived successfully`,
      entityType: 'Customer',
      entityId: id,
      metadata: { customer: existingCustomer }
    });

    res.json({ message: "Customer archived successfully" })
  } catch (error) {
    console.error("[Delete Customer Error]:", error)
    res.status(500).json({ error: "Failed to delete customer" })
  }
}

export const bulkImportCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params?.organizationId)
    const workbook = XLSX.read(req.file!.buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet)

    const customers = []
    const errors = []

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any
      try {
        const name = row.name || row.Name || row.NAME
        const phone = row.phone || row.Phone || row.PHONE
        const email = row.email || row.Email || row.EMAIL
        const type = row.type || row.Type || row.TYPE || row.customerType || row.CustomerType || "INDIVIDUAL"
        const address = row.address || row.Address || row.ADDRESS
        const balance = parseFloat(row.balance || row.Balance || row.BALANCE || "0")

        if (!name || !phone) {
          errors.push({
            row: i + 2,
            data: row,
            error: "Missing required fields: name and phone",
          })
          continue
        }

        let customerType: 'INDIVIDUAL' | 'INSURANCE' | 'CORPORATE' = 'INDIVIDUAL'
        const typeUpper = String(type).toUpperCase()
        if (typeUpper === 'INSURANCE' || typeUpper === 'CORPORATE') {
          customerType = typeUpper
        }

        const existing = await prisma.customer.findFirst({
          where: { organizationId, phone },
        })

        if (existing) {
          errors.push({
            row: i + 2,
            data: row,
            error: `Customer with phone ${phone} already exists`,
          })
          continue
        }

        const customer = await prisma.customer.create({
          data: {
            name: String(name),
            phone: String(phone),
            email: email ? String(email) : null,
            address: address ? String(address) : null,
            customerType,
            balance,
            organizationId,
          },
        })

        customers.push(customer)
      } catch (error: any) {
        errors.push({
          row: i + 2,
          data: row,
          error: error.message || "Unknown error",
        })
      }
    }

    let errorFileBuffer = null
    if (errors.length > 0) {
      const errorData = errors.map((e) => ({
        Row: e.row,
        Error: e.error,
        ...e.data,
      }))
      const errorWorksheet = XLSX.utils.json_to_sheet(errorData)
      const errorWorkbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(errorWorkbook, errorWorksheet, "Errors")
      errorFileBuffer = XLSX.write(errorWorkbook, { bookType: "xlsx", type: "buffer" })
    }

    await auditLogger.customers(req, {
      type: 'CUSTOMER_CREATE',
      description: `Bulk imported ${customers.length} customers${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      entityType: 'Customer',
      entityId: 'bulk-import',
      metadata: { imported: customers.length, errors: errors.length },
    })

    res.json({
      success: true,
      imported: customers.length,
      customers,
      importErrors: errors.length > 0 ? errors : undefined,
      errorFile: errorFileBuffer
        ? `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${errorFileBuffer.toString('base64')}`
        : null,
    })
  } catch (error: any) {
    console.error("[Bulk Import Customers Error]:", error)
    res.status(500).json({ error: error.message || "Failed to import customers" })
  }
}

export const previewImportCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params?.organizationId)
    const workbook = XLSX.read(req.file!.buffer, { type: "buffer" })
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])

    const validRows: any[] = []
    const invalidRows: any[] = []

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as any
      const validationResult = await validateCustomerRow(row, i, data, organizationId)

      if (validationResult.isValid) {
        validRows.push({ ...validationResult.rowData, rowNumber: i + 2 })
      } else {
        invalidRows.push({
          ...validationResult.rowData,
          rowNumber: i + 2,
          errors: validationResult.errors.map((e) => e.message).join("; "),
          errorDetails: validationResult.errors,
        })
      }
    }

    const importId = createPreviewSession(organizationId, "customer", validRows, invalidRows)

    res.json({
      importId,
      validRows,
      invalidRows,
      summary: {
        total: validRows.length + invalidRows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
      },
    })
  } catch (error: any) {
    console.error("[Preview Import Customers Error]:", error)
    res.status(500).json({ error: error.message || "Failed to preview import" })
  }
}

export const confirmImportCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params?.organizationId)
    const { importId } = req.body
    const session = getPreviewSession(importId)

    if (!session || session.organizationId !== organizationId || session.entityType !== "customer") {
      return res.status(400).json({ error: "Invalid import session" })
    }

    const savedCustomers: any[] = []
    await prisma.$transaction(async (tx) => {
      for (const row of session.validRows) {
        const customer = await tx.customer.create({
          data: {
            name: row.name,
            phone: row.phone,
            email: row.email,
            address: row.address,
            customerType: row.customerType,
            balance: row.balance || 0,
            organizationId,
          },
        })
        savedCustomers.push(customer)
      }
    })

    let errorFileBuffer = null
    if (session.invalidRows.length > 0) {
      const errorData = session.invalidRows.map((row) => ({
        Row: row.rowNumber,
        Error: row.errors,
        ...row,
      }))
      const errorWorksheet = XLSX.utils.json_to_sheet(errorData)
      const errorWorkbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(errorWorkbook, errorWorksheet, "Errors")
      errorFileBuffer = XLSX.write(errorWorkbook, { bookType: "xlsx", type: "buffer" })
    }

    await auditLogger.customers(req, {
      type: "CUSTOMER_CREATE",
      description: `Imported ${savedCustomers.length} customers${session.invalidRows.length > 0 ? ` (${session.invalidRows.length} errors)` : ""}`,
      entityType: "Customer",
      entityId: "bulk-import",
      metadata: { imported: savedCustomers.length, errors: session.invalidRows.length, importId },
    })

    deletePreviewSession(importId)

    res.json({
      success: true,
      imported: savedCustomers.length,
      errors: session.invalidRows.length,
      customers: savedCustomers,
      errorFile: errorFileBuffer
        ? `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${errorFileBuffer.toString("base64")}`
        : null,
    })
  } catch (error: any) {
    console.error("[Confirm Import Customers Error]:", error)
    res.status(500).json({ error: error.message || "Failed to confirm import" })
  }
}

export const downloadCustomerErrorFile = async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params?.organizationId)
    const { importId } = req.params
    const session = getPreviewSession(importId)

    if (!session || session.organizationId !== organizationId) {
      return res.status(404).json({ error: "Import session not found" })
    }

    const errorData = session.invalidRows.map((row) => ({
      Row: row.rowNumber,
      Error: row.errors,
      ...row,
    }))

    const worksheet = XLSX.utils.json_to_sheet(errorData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Errors")
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename=customer-import-errors-${importId}.xlsx`)
    res.send(buffer)
  } catch (error: any) {
    console.error("[Download Customer Error File Error]:", error)
    res.status(500).json({ error: "Failed to generate error file" })
  }
}

export const downloadCustomerTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const templateData = [{ name: "John Doe", phone: "+250788123456", email: "john@example.com", type: "INDIVIDUAL", address: "Kigali, Rwanda", balance: "0" }]
    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers Template")
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", "attachment; filename=customers-import-template.xlsx")
    res.send(buffer)
  } catch (error: any) {
    console.error("[Download Customer Template Error]:", error)
    res.status(500).json({ error: "Failed to generate template" })
  }
}
