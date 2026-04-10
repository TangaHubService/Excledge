import {
  PrismaClient,
  Prisma,
  UserRole,
  CustomerType,
  SalePaymentType,
  ActivityType,
  LogModule,
  LogStatus,
  StockMovementType,
  StockTransferStatus,
  EbmSubmissionStatus,
  InvitationStatus,
} from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import {
  createBatch,
  selectBatchesForSale,
  updateBatchQuantity,
} from "../src/services/batch.service"
import { removeStock, addStock } from "../src/services/inventory-ledger.service"
import { TaxService } from "../src/services/tax.service"
import { generateInvoiceNumber } from "../src/services/rra-ebm.service"

const prisma = new PrismaClient()

/** Demo login password for all seeded users (development only). */
export const DEMO_PASSWORD = "TestDemo#123"

const DEMO_ADMIN_EMAIL = "demo.admin@exceledge.test"

const subscriptionPlans = [
  {
    title: "Free Trial",
    description: "24-hour free trial with full access to all features",
    price: 0,
    period: "MONTHLY",
    isActive: true,
    maxUsers: 5,
    features: ["Inventory Management", "Sales Tracking", "Basic Reports"],
  },
  {
    title: "Simple Starter",
    description: "Simple Starter plan",
    price: 50000,
    period: "MONTHLY",
    features: [
      "Inventory Management",
      "Sells & POS",
      "24/7 support",
      "Purchase order",
      "2 user account",
    ],
  },
  {
    title: "Essential",
    description: "Essential plan",
    price: 100000,
    period: "MONTHLY",
    features: [
      "Inventory Management",
      "Sells & POS",
      "24/7 support",
      "Purchase order",
      "5 user account",
      "Quarterly visit",
      "Tax declaration service",
    ],
  },
  {
    title: "Professional",
    description: "Professional plan",
    price: 300000,
    period: "MONTHLY",
    popular: true,
    features: [
      "Inventory Management",
      "Sells & POS",
      "24/7 support",
      "Purchase order",
      "10 user account",
      "Monthly visit",
      "Tax declaration service",
      "Payroll management",
    ],
  },
  {
    title: "Advanced",
    description: "Advanced plan",
    price: 500000,
    period: "MONTHLY",
    features: [
      "Inventory Management",
      "Sells & POS",
      "24/7 support",
      "Purchase order",
      "Unlimited user account",
      "2 visit a month",
      "Tax declaration service",
      "Payroll management",
      "Accounting service",
      "Compliance advisory",
      "Quick book Async",
    ],
  },
]

function extractMaxUsers(features: string[]): number {
  const userFeature = features.find((f) => /user account/i.test(f))
  if (!userFeature) return 0
  if (/unlimited/i.test(userFeature)) return 0
  const match = userFeature.match(/\d+/)
  return match ? parseInt(match[0], 10) : 0
}

async function seedSubscriptionPlans() {
  const allFeatures = new Set<string>()
  subscriptionPlans.forEach((plan) => {
    plan.features.forEach((feature) => allFeatures.add(feature))
  })

  const featureMap: Record<string, { key: string }> = {}
  for (const featureName of allFeatures) {
    const key = featureName.toLowerCase().replace(/\s+/g, "_")
    const feature = await prisma.feature.upsert({
      where: { key },
      update: {},
      create: {
        name: featureName,
        key,
        description: featureName,
      },
    })
    featureMap[featureName] = feature
  }

  for (const plan of subscriptionPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.title },
      update: {
        description: plan.description,
        price: plan.price,
        currency: "RWF",
        billingCycle: plan.period,
        isActive: plan.isActive !== undefined ? plan.isActive : true,
        maxUsers:
          plan.maxUsers !== undefined ? plan.maxUsers : extractMaxUsers(plan.features),
      },
      create: {
        name: plan.title,
        description: plan.description,
        price: plan.price,
        currency: "RWF",
        billingCycle: plan.period,
        isActive: plan.isActive !== undefined ? plan.isActive : true,
        maxUsers:
          plan.maxUsers !== undefined ? plan.maxUsers : extractMaxUsers(plan.features),
        features: {
          create: plan.features.map((featureName) => ({
            feature: { connect: { key: featureMap[featureName].key } },
          })),
        },
      },
    })
    console.log(`Processed plan: ${plan.title}`)
  }
}

type DemoIds = {
  orgId: number
  mainBranchId: number
  eastBranchId: number
  adminId: number
  sellerId: number
}

async function createSaleInTransaction(
  ctx: DemoIds,
  input: {
    saleNumber: string
    customerId: number
    userId: number
    branchId: number
    paymentType: SalePaymentType
    cashAmount: number
    insuranceAmount: number
    debtAmount: number
    items: { productId: number; quantity: number; unitPrice: number }[]
    isProforma?: boolean
  }
) {
  const {
    saleNumber,
    customerId,
    userId,
    branchId,
    paymentType,
    cashAmount,
    insuranceAmount,
    debtAmount,
    items,
    isProforma,
  } = input
  const { orgId } = ctx

  let totalAmount = 0
  for (const item of items) {
    totalAmount += item.quantity * item.unitPrice
  }

  const invoiceNumber = await generateInvoiceNumber(orgId)
  const taxSummary = await TaxService.calculateSaleTax(orgId, items)

  return prisma.$transaction(
    async (tx) => {
      const saleItemsData: Record<string, unknown>[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const productId = item.productId
        const quantity = item.quantity
        const unitPrice = item.unitPrice
        const itemTax = taxSummary.items[i]

        let batchId: number | null = null
        let costPrice = 0

        const selectedBatches = await selectBatchesForSale(
          {
            productId,
            organizationId: orgId,
            quantity,
            method: "FIFO",
            branchId,
          },
          tx
        )

        if (selectedBatches.length > 0) {
          batchId = selectedBatches[0].batchId
          costPrice = selectedBatches[0].unitCost
          for (const batch of selectedBatches) {
            await updateBatchQuantity(batch.batchId, batch.quantity, orgId, tx)
          }
        }

        const profit = (unitPrice - costPrice) * quantity
        const row: Record<string, unknown> = {
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
          costPrice,
          profit,
          taxRate: itemTax.taxRate,
          taxAmount: itemTax.taxAmount,
          taxCode: itemTax.taxCode,
          product: { connect: { id: productId } },
        }
        if (batchId !== null) {
          row.batch = { connect: { id: batchId } }
        }
        saleItemsData.push(row)
      }

      const newSale = await tx.sale.create({
        data: {
          saleNumber,
          invoiceNumber,
          customerId,
          userId,
          organizationId: orgId,
          branchId,
          paymentType,
          cashAmount,
          insuranceAmount,
          debtAmount,
          totalAmount,
          vatAmount: taxSummary.vatAmount,
          taxableAmount: taxSummary.taxableAmount,
          status: "COMPLETED",
          isProforma: isProforma ?? false,
          saleItems: { create: saleItemsData as Prisma.SaleItemCreateWithoutSaleInput[] },
        },
        include: { saleItems: true },
      })

      for (const item of items) {
        const saleItem = newSale.saleItems.find((si) => si.productId === item.productId)
        await removeStock({
          organizationId: orgId,
          productId: item.productId,
          userId,
          quantity: item.quantity,
          movementType: "SALE",
          branchId,
          reference: saleNumber,
          referenceType: "SALE",
          note: `Sale #${saleNumber}`,
          batchId: saleItem?.batchId ?? null,
          tx,
        })
      }

      const remainingDebt = totalAmount - cashAmount - insuranceAmount
      if (remainingDebt > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { increment: remainingDebt } },
        })
      }

      return newSale
    },
    { maxWait: 30000, timeout: 60000 }
  )
}

async function seedDemoDataset() {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
  })
  if (existing) {
    console.log("Demo dataset already seeded (skip). Delete demo users to re-seed.")
    return
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { name: "Professional" },
  })
  if (!plan) {
    throw new Error('Subscription plan "Professional" not found. Run plan seed first.')
  }

  const org = await prisma.organization.create({
    data: {
      name: "Exceledge Demo Pharmacy",
      businessType: "PHARMACY",
      currency: "RWF",
      TIN: "11919467890123",
      address: "KG 123 St, Kigali",
      phone: "+250788000000",
      email: "demo.shop@exceledge.test",
      isActive: true,
    },
  })

  await prisma.taxConfiguration.create({
    data: {
      organizationId: org.id,
      vatRate: new Prisma.Decimal("18.00"),
      effectiveDate: new Date("2020-01-01"),
    },
  })

  const subscription = await prisma.subscription.create({
    data: {
      organizationId: org.id,
      planId: plan.id,
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      paymentMethod: "TRIAL",
      autoRenew: true,
    },
  })

  await prisma.payment.create({
    data: {
      subscriptionId: subscription.id,
      amount: 0,
      currency: "RWF",
      paymentMethod: "TRIAL",
      status: "COMPLETED",
      processedAt: new Date(),
    },
  })

  const mainBranch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "Main Store",
      code: "MAIN",
      location: "Kigali City Center",
      status: "ACTIVE",
    },
  })

  const eastBranch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "East Branch",
      code: "KGL-E",
      location: "Remera",
      status: "ACTIVE",
    },
  })

  await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      name: "Central Warehouse",
      code: "WH-01",
      isDefault: true,
      isActive: true,
    },
  })

  const adminUser = await prisma.user.create({
    data: {
      email: DEMO_ADMIN_EMAIL,
      password: passwordHash,
      name: "Demo Admin",
      phone: "+250788000001",
      role: UserRole.ADMIN,
      isActive: true,
      isEmailVerified: true,
    },
  })

  const managerUser = await prisma.user.create({
    data: {
      email: "demo.manager@exceledge.test",
      password: passwordHash,
      name: "Demo Branch Manager",
      phone: "+250788000002",
      role: UserRole.BRANCH_MANAGER,
      isActive: true,
      isEmailVerified: true,
    },
  })

  const sellerUser = await prisma.user.create({
    data: {
      email: "demo.seller@exceledge.test",
      password: passwordHash,
      name: "Demo Seller",
      phone: "+250788000003",
      role: UserRole.SELLER,
      isActive: true,
      isEmailVerified: true,
    },
  })

  const accountantUser = await prisma.user.create({
    data: {
      email: "demo.accountant@exceledge.test",
      password: passwordHash,
      name: "Demo Accountant",
      phone: "+250788000004",
      role: UserRole.ACCOUNTANT,
      isActive: true,
      isEmailVerified: true,
    },
  })

  await prisma.userOrganization.createMany({
    data: [
      {
        userId: adminUser.id,
        organizationId: org.id,
        role: UserRole.ADMIN,
        isOwner: true,
      },
      {
        userId: managerUser.id,
        organizationId: org.id,
        role: UserRole.BRANCH_MANAGER,
        isOwner: false,
      },
      {
        userId: sellerUser.id,
        organizationId: org.id,
        role: UserRole.SELLER,
        isOwner: false,
      },
      {
        userId: accountantUser.id,
        organizationId: org.id,
        role: UserRole.ACCOUNTANT,
        isOwner: false,
      },
    ],
  })

  await prisma.userBranch.createMany({
    data: [
      { userId: adminUser.id, branchId: mainBranch.id, isPrimary: true },
      { userId: adminUser.id, branchId: eastBranch.id, isPrimary: false },
      { userId: managerUser.id, branchId: eastBranch.id, isPrimary: true },
      { userId: sellerUser.id, branchId: mainBranch.id, isPrimary: true },
      { userId: accountantUser.id, branchId: mainBranch.id, isPrimary: true },
      { userId: accountantUser.id, branchId: eastBranch.id, isPrimary: false },
    ],
  })

  const supplierA = await prisma.supplier.create({
    data: {
      organizationId: org.id,
      name: "Kigali Medical Supplies Ltd",
      email: "orders@kms.test",
      phone: "+250788111111",
      address: "Nyarugenge",
      contactPerson: "Jean Supplier",
    },
  })

  const supplierB = await prisma.supplier.create({
    data: {
      organizationId: org.id,
      name: "East Africa Wholesale",
      email: "sales@eaw.test",
      phone: "+250788222222",
      contactPerson: "Mary Wholesale",
    },
  })

  const products = await prisma.$transaction([
    prisma.product.create({
      data: {
        organizationId: org.id,
        supplierId: supplierA.id,
        name: "Paracetamol 500mg Tablets",
        sku: "PARA-500",
        category: "Pain relief",
        description: "Blister 20 tablets",
        quantity: 0,
        unitPrice: new Prisma.Decimal("150.00"),
        minStock: 20,
        taxCategory: "STANDARD",
        barcode: "8901000000001",
      },
    }),
    prisma.product.create({
      data: {
        organizationId: org.id,
        supplierId: supplierA.id,
        name: "Amoxicillin 250mg",
        sku: "AMOX-250",
        category: "Antibiotics",
        quantity: 0,
        unitPrice: new Prisma.Decimal("800.00"),
        minStock: 10,
        taxCategory: "STANDARD",
        barcode: "8901000000002",
      },
    }),
    prisma.product.create({
      data: {
        organizationId: org.id,
        supplierId: supplierB.id,
        name: "Vitamin C 1000mg",
        sku: "VIT-C-1K",
        category: "Vitamins",
        quantity: 0,
        unitPrice: new Prisma.Decimal("3500.00"),
        minStock: 5,
        taxCategory: "ZERO_RATED",
        barcode: "8901000000003",
      },
    }),
    prisma.product.create({
      data: {
        organizationId: org.id,
        supplierId: supplierB.id,
        name: "Hand Sanitizer 500ml",
        sku: "SAN-500",
        category: "Hygiene",
        quantity: 0,
        unitPrice: new Prisma.Decimal("2500.00"),
        minStock: 15,
        taxCategory: "STANDARD",
        barcode: "8901000000004",
      },
    }),
    prisma.product.create({
      data: {
        organizationId: org.id,
        supplierId: supplierA.id,
        name: "Cotton Roll 500g",
        sku: "COT-500",
        category: "Supplies",
        quantity: 0,
        unitPrice: new Prisma.Decimal("4200.00"),
        minStock: 8,
        taxCategory: "EXEMPT",
        barcode: "8901000000005",
      },
    }),
    prisma.product.create({
      data: {
        organizationId: org.id,
        supplierId: supplierA.id,
        name: "Digital Thermometer",
        sku: "THERM-D1",
        category: "Devices",
        quantity: 0,
        unitPrice: new Prisma.Decimal("12000.00"),
        minStock: 3,
        taxCategory: "STANDARD",
        barcode: "8901000000006",
      },
    }),
  ])

  const [p1, p2, p3, p4, p5, p6] = products

  for (const p of [p1, p2, p4, p5, p6]) {
    await createBatch({
      productId: p.id,
      organizationId: org.id,
      branchId: mainBranch.id,
      userId: adminUser.id,
      batchNumber: `B-${p.sku}-MAIN-1`,
      quantity: 200,
      unitCost: Number(p.unitPrice) * 0.55,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    })
  }

  await createBatch({
    productId: p3.id,
    organizationId: org.id,
    branchId: mainBranch.id,
    userId: adminUser.id,
    batchNumber: "B-VIT-C-MAIN-1",
    quantity: 80,
    unitCost: 1200,
    expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
  })

  for (const p of [p1, p2, p3]) {
    await createBatch({
      productId: p.id,
      organizationId: org.id,
      branchId: eastBranch.id,
      userId: adminUser.id,
      batchNumber: `B-${p.sku}-EAST-1`,
      quantity: 40,
      unitCost: Number(p.unitPrice) * 0.5,
      expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
    })
  }

  const walkIn = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Walk-in Customer",
      phone: "+250788333001",
      customerType: CustomerType.INDIVIDUAL,
      balance: new Prisma.Decimal("0"),
    },
  })

  const creditCustomer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Credit Wholesale Ltd",
      phone: "+250788333002",
      email: "accounts@creditwholesale.test",
      customerType: CustomerType.CORPORATE,
      TIN: "222222222",
      balance: new Prisma.Decimal("0"),
    },
  })

  const insuranceCustomer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Insurance Member Jane",
      phone: "+250788333003",
      customerType: CustomerType.INSURANCE,
      balance: new Prisma.Decimal("0"),
    },
  })

  const ctx: DemoIds = {
    orgId: org.id,
    mainBranchId: mainBranch.id,
    eastBranchId: eastBranch.id,
    adminId: adminUser.id,
    sellerId: sellerUser.id,
  }

  const cashSale = await createSaleInTransaction(ctx, {
    saleNumber: `SEED-SALE-CASH-${Date.now()}`,
    customerId: walkIn.id,
    userId: sellerUser.id,
    branchId: mainBranch.id,
    paymentType: SalePaymentType.CASH,
    cashAmount: 150 * 4 + 800 * 2,
    insuranceAmount: 0,
    debtAmount: 0,
    items: [
      { productId: p1.id, quantity: 4, unitPrice: 150 },
      { productId: p2.id, quantity: 2, unitPrice: 800 },
    ],
  })

  const debtSale = await createSaleInTransaction(ctx, {
    saleNumber: `SEED-SALE-DEBT-${Date.now()}`,
    customerId: creditCustomer.id,
    userId: sellerUser.id,
    branchId: mainBranch.id,
    paymentType: SalePaymentType.MIXED,
    cashAmount: 5000,
    insuranceAmount: 0,
    debtAmount: 19000,
    items: [{ productId: p4.id, quantity: 10, unitPrice: 2400 }],
  })

  await prisma.debtPayment.create({
    data: {
      saleId: debtSale.id,
      customerId: creditCustomer.id,
      organizationId: org.id,
      recordedById: accountantUser.id,
      amount: new Prisma.Decimal("5000.00"),
      paymentMethod: "MOBILE_MONEY",
      reference: "SEED-DEBT-PAY-1",
      notes: "Partial payment on seeded credit sale",
    },
  })

  await prisma.customer.update({
    where: { id: creditCustomer.id },
    data: { balance: { decrement: new Prisma.Decimal("5000.00") } },
  })

  const insuranceTotal = 3500 * 3
  await createSaleInTransaction(ctx, {
    saleNumber: `SEED-SALE-INS-${Date.now()}`,
    customerId: insuranceCustomer.id,
    userId: sellerUser.id,
    branchId: mainBranch.id,
    paymentType: SalePaymentType.INSURANCE,
    cashAmount: 0,
    insuranceAmount: insuranceTotal,
    debtAmount: 0,
    items: [{ productId: p3.id, quantity: 3, unitPrice: 3500 }],
  })

  await createSaleInTransaction(ctx, {
    saleNumber: `SEED-SALE-PRO-${Date.now()}`,
    customerId: walkIn.id,
    userId: sellerUser.id,
    branchId: mainBranch.id,
    paymentType: SalePaymentType.CASH,
    cashAmount: 12000,
    insuranceAmount: 0,
    debtAmount: 0,
    items: [{ productId: p6.id, quantity: 1, unitPrice: 12000 }],
    isProforma: true,
  })

  await prisma.ebmTransaction.create({
    data: {
      organizationId: org.id,
      saleId: cashSale.id,
      invoiceNumber: cashSale.invoiceNumber,
      operation: "SALE",
      submissionStatus: EbmSubmissionStatus.SUCCESS,
      submittedAt: new Date(),
      ebmInvoiceNumber: "EBM-SEED-001",
      responseData: { note: "Seeded EBM success row for reporting" },
    },
  })

  const pendingPo = await prisma.purchaseOrder.create({
    data: {
      orderNumber: `PO-SEED-PENDING-${Date.now()}`,
      supplierId: supplierA.id,
      organizationId: org.id,
      userId: adminUser.id,
      totalAmount: new Prisma.Decimal("45000.00"),
      status: "PENDING",
      notes: "Awaiting supplier confirmation",
      items: {
        create: [
          {
            productId: p2.id,
            productName: p2.name,
            quantity: 50,
            unitPrice: new Prisma.Decimal("800.00"),
            totalPrice: new Prisma.Decimal("40000.00"),
          },
          {
            productName: "Custom order item (no product link)",
            quantity: 10,
            unitPrice: new Prisma.Decimal("500.00"),
            totalPrice: new Prisma.Decimal("5000.00"),
          },
        ],
      },
    },
  })

  const completedPo = await prisma.purchaseOrder.create({
    data: {
      orderNumber: `PO-SEED-RECV-${Date.now()}`,
      supplierId: supplierB.id,
      organizationId: org.id,
      userId: adminUser.id,
      totalAmount: new Prisma.Decimal("24000.00"),
      status: "COMPLETED",
      receivedAt: new Date(),
      notes: "Received into main branch stock",
      items: {
        create: [
          {
            productId: p1.id,
            productName: p1.name,
            quantity: 100,
            unitPrice: new Prisma.Decimal("120.00"),
            totalPrice: new Prisma.Decimal("12000.00"),
          },
          {
            productId: p5.id,
            productName: p5.name,
            quantity: 20,
            unitPrice: new Prisma.Decimal("600.00"),
            totalPrice: new Prisma.Decimal("12000.00"),
          },
        ],
      },
    },
    include: { items: true },
  })

  for (const item of completedPo.items) {
    if (item.productId) {
      await addStock({
        organizationId: org.id,
        productId: item.productId,
        userId: adminUser.id,
        quantity: item.quantity,
        movementType: "PURCHASE",
        branchId: mainBranch.id,
        unitCost: Number(item.unitPrice),
        reference: completedPo.orderNumber,
        referenceType: "PURCHASE_ORDER",
        note: `PO received (seed): ${completedPo.orderNumber}`,
      })
    }
  }

  await prisma.supplierPayment.create({
    data: {
      purchaseOrderId: completedPo.id,
      organizationId: org.id,
      amount: new Prisma.Decimal("24000.00"),
      paymentMethod: "BANK_TRANSFER",
      paymentDate: new Date(),
      reference: "SEED-PO-PAY-1",
      recordedById: accountantUser.id,
      notes: "Full payment for completed seed PO",
    },
  })

  await prisma.expense.create({
    data: {
      organizationId: org.id,
      userId: accountantUser.id,
      branchId: mainBranch.id,
      category: "RENT",
      amount: new Prisma.Decimal("350000.00"),
      paymentMethod: "BANK_TRANSFER",
      description: "Monthly rent — main store",
      expenseDate: new Date(),
      reference: "RENT-SEED-1",
    },
  })

  await prisma.expense.create({
    data: {
      organizationId: org.id,
      userId: managerUser.id,
      branchId: eastBranch.id,
      category: "UTILITIES",
      amount: new Prisma.Decimal("45000.00"),
      paymentMethod: "MOBILE_MONEY",
      description: "Electricity — east branch",
      expenseDate: new Date(),
    },
  })

  await prisma.cashBalance.create({
    data: {
      organizationId: org.id,
      branchId: mainBranch.id,
      balance: new Prisma.Decimal("125000.50"),
      balanceDate: new Date(),
      recordedById: sellerUser.id,
      notes: "Opening cash count (seed)",
    },
  })

  await prisma.stockTransfer.create({
    data: {
      organizationId: org.id,
      fromBranchId: mainBranch.id,
      toBranchId: eastBranch.id,
      status: StockTransferStatus.PENDING,
      requestedById: managerUser.id,
      notes: "Awaiting approval — seed transfer",
      items: {
        create: [{ productId: p1.id, quantity: 25 }],
      },
    },
  })

  const transferCompleted = await prisma.stockTransfer.create({
    data: {
      organizationId: org.id,
      fromBranchId: eastBranch.id,
      toBranchId: mainBranch.id,
      status: StockTransferStatus.COMPLETED,
      requestedById: adminUser.id,
      approvedById: adminUser.id,
      completedAt: new Date(),
      notes: "Completed seed transfer (ledger adjusted below)",
      items: {
        create: [{ productId: p2.id, quantity: 5 }],
      },
    },
  })

  await removeStock({
    organizationId: org.id,
    productId: p2.id,
    userId: adminUser.id,
    quantity: 5,
    movementType: "TRANSFER_OUT",
    branchId: eastBranch.id,
    reference: `ST-${transferCompleted.id}`,
    referenceType: "STOCK_TRANSFER",
    note: "Seed stock transfer out",
  })

  await addStock({
    organizationId: org.id,
    productId: p2.id,
    userId: adminUser.id,
    quantity: 5,
    movementType: "TRANSFER_IN",
    branchId: mainBranch.id,
    reference: `ST-${transferCompleted.id}`,
    referenceType: "STOCK_TRANSFER",
    note: "Seed stock transfer in",
  })

  await prisma.stockMovement.create({
    data: {
      organizationId: org.id,
      productId: p1.id,
      userId: adminUser.id,
      branchId: mainBranch.id,
      type: StockMovementType.ADJUSTMENT,
      quantity: 2,
      previousStock: 100,
      newStock: 102,
      note: "Seed adjustment (legacy movement row)",
    },
  })

  await prisma.notification.create({
    data: {
      organizationId: org.id,
      title: "Low stock reminder",
      message: "Review min stock levels for demo products.",
      type: "ALERT",
      isRead: false,
    },
  })

  await prisma.activityLog.create({
    data: {
      organizationId: org.id,
      userId: adminUser.id,
      branchId: mainBranch.id,
      type: ActivityType.USER_LOGIN,
      description: "Demo admin login (seeded activity)",
      module: LogModule.SYSTEM,
      status: LogStatus.SUCCESS,
      entityType: "User",
      entityId: String(adminUser.id),
    },
  })

  const inviteToken = crypto.randomBytes(24).toString("hex")
  await prisma.organizationInvitation.create({
    data: {
      organizationId: org.id,
      email: "pending.invite@exceledge.test",
      role: UserRole.SELLER,
      token: inviteToken,
      defaultPassword: "InviteTemp#1",
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedBy: adminUser.id,
    },
  })

  console.log("")
  console.log("--- Demo dataset (development) ---")
  console.log(`Organization: ${org.name} (id=${org.id})`)
  console.log(`Branches: ${mainBranch.code} (id=${mainBranch.id}), ${eastBranch.code} (id=${eastBranch.id})`)
  console.log(`Password for all demo users: ${DEMO_PASSWORD}`)
  console.log(`  ${DEMO_ADMIN_EMAIL} (ADMIN)`)
  console.log(`  demo.manager@exceledge.test (BRANCH_MANAGER)`)
  console.log(`  demo.seller@exceledge.test (SELLER)`)
  console.log(`  demo.accountant@exceledge.test (ACCOUNTANT)`)
  console.log(`Sample sales: cash, mixed/debt + partial debt payment, insurance, proforma`)
  console.log(`Purchase orders: pending #${pendingPo.id}, completed #${completedPo.id} + supplier payment`)
  console.log(`Stock: batches on MAIN + EAST; completed stock transfer id=${transferCompleted.id}`)
  console.log("-----------------------------------")
  console.log("")
}

async function main() {
  console.log("Starting database seeding...")
  await seedSubscriptionPlans()
  await seedDemoDataset()
  console.log("✅ Database seeding completed successfully")
}

main()
  .catch((e) => {
    console.error("❌ Error during database seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
