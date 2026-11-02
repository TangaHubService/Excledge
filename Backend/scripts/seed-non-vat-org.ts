/**
 * Seeds a non-VAT organization with its admin user, a branch and tax-D products (development only).
 * Usage: npx tsx scripts/seed-non-vat-org.ts
 */
import dotenv from "dotenv"
import { PrismaClient, Prisma, UserRole, MeasurementUnit, RraTaxCode, ItemType } from "@prisma/client"
import bcrypt from "bcryptjs"
import { createBatch } from "../src/services/batch.service"
import { TaxService } from "../src/services/tax.service"
import { allocateItemCd, DEFAULT_ITEM_CLASSIFICATION_CD, deriveQtyUnitCd } from "../src/services/item-code.service"

dotenv.config()

const prisma = new PrismaClient()

const ADMIN_EMAIL = "nonvat.admin@exceledge.test"
const PASSWORD = "TestDemo#123"

const productDefs = [
  { name: "Rice 5kg", sku: "NV-RICE-5", category: "Groceries", unitPrice: "7500.00", unit: MeasurementUnit.PCS, type: ItemType.PRODUCT, origin: "RW", qty: 60 },
  { name: "Cooking Oil 1L", sku: "NV-OIL-1L", category: "Groceries", unitPrice: "3200.00", unit: MeasurementUnit.LTR, type: ItemType.PRODUCT, origin: "UG", qty: 40 },
  { name: "Bar Soap", sku: "NV-SOAP", category: "Hygiene", unitPrice: "500.00", unit: MeasurementUnit.PCS, type: ItemType.PRODUCT, origin: "KE", qty: 150 },
  { name: "Sugar 1kg", sku: "NV-SUGAR-1", category: "Groceries", unitPrice: "1600.00", unit: MeasurementUnit.KG, type: ItemType.PRODUCT, origin: "TZ", qty: 80 },
  { name: "Home Delivery", sku: "NV-DELIVERY", category: "Services", unitPrice: "1000.00", unit: MeasurementUnit.PCS, type: ItemType.SERVICE, origin: "RW", qty: 0 },
]

async function main() {
  if (await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })) {
    console.log(`Non-VAT org already seeded (${ADMIN_EMAIL}), skipping.`)
    return
  }

  const plan = await prisma.subscriptionPlan.findFirst({ where: { name: "Professional" } })
  if (!plan) throw new Error('Subscription plan "Professional" not found. Run the main seed first.')

  const org = await prisma.organization.create({
    data: {
      name: "Umucyo Mini Market",
      businessType: "GROCERY_STORE",
      currency: "RWF",
      TIN: "999912345",
      address: "KN 5 Rd, Nyamirambo, Kigali",
      phone: "+250788100000",
      email: "umucyo.market@exceledge.test",
      vatRegistered: false,
      isActive: true,
    },
  })

  await prisma.taxConfiguration.create({
    data: { organizationId: org.id, vatRate: new Prisma.Decimal("18.00"), effectiveDate: new Date("2020-01-01") },
  })

  await prisma.subscription.create({
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

  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "Main Shop",
      code: "MAIN",
      location: "Nyamirambo",
      status: "ACTIVE",
      isDefault: true,
      bhfId: "00",
    },
  })

  await prisma.warehouse.create({
    data: { organizationId: org.id, name: "Shop Store", code: "WH-01", isDefault: true, isActive: true },
  })

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(PASSWORD, 10),
      name: "Non-VAT Admin",
      phone: "+250788100001",
      role: UserRole.ADMIN,
      isActive: true,
      isEmailVerified: true,
    },
  })
  await prisma.userOrganization.create({
    data: { userId: admin.id, organizationId: org.id, role: UserRole.ADMIN, isOwner: true },
  })
  await prisma.userBranch.create({ data: { userId: admin.id, branchId: branch.id, isPrimary: true } })

  // Non-VAT taxpayers may only use tax type D.
  for (const def of productDefs) {
    const pkgUnitCd = "NT"
    const qtyUnitCd = deriveQtyUnitCd(def.unit)
    const product = await prisma.$transaction(async (tx) => {
      const itemCd = await allocateItemCd(org.id, def.type, pkgUnitCd, qtyUnitCd, def.origin, tx)
      return tx.product.create({
        data: {
          organizationId: org.id,
          name: def.name,
          sku: def.sku,
          category: def.category,
          quantity: def.qty,
          unitPrice: new Prisma.Decimal(def.unitPrice),
          minStock: def.type === ItemType.SERVICE ? 0 : 10,
          taxCode: RraTaxCode.D,
          taxCategory: TaxService.getTaxCategory(RraTaxCode.D),
          measurementUnit: def.unit,
          itemType: def.type,
          origin: def.origin,
          pkgUnitCd,
          qtyUnitCd,
          itemClsCd: DEFAULT_ITEM_CLASSIFICATION_CD,
          itemCd,
          ebmSyncStatus: "PENDING",
        },
      })
    })
    if (def.type !== ItemType.SERVICE) {
      await createBatch({
        productId: product.id,
        organizationId: org.id,
        branchId: branch.id,
        userId: admin.id,
        batchNumber: `B-${def.sku}-1`,
        quantity: def.qty,
        unitCost: Number(def.unitPrice) * 0.7,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
    }
  }

  console.log(`Created non-VAT org "${org.name}" (id=${org.id}) with ${productDefs.length} tax-D items.`)
  console.log(`Login: ${ADMIN_EMAIL} / ${PASSWORD}`)
}

main()
  .catch((e) => {
    console.error("Failed to seed non-VAT org:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
