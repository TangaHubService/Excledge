/**
 * Tops up an organization's RRA purchase-code pool (organization_purchase_codes)
 * so B2B test sales don't get blocked once the seeded codes run out.
 *
 * These codes stand in for codes the buyer's own VSDC/OSDC would issue in
 * production (see consumeOrgPurchaseCode / consumeAnyOrgPurchaseCode in
 * src/services/rra-ebm.service.ts). The sandbox accepts any 6-character code,
 * so freshly generated ones work fine for testing — this script just keeps
 * the pool from running dry. Idempotent: skips any code that already exists
 * for the organization.
 *
 * Usage:
 *   npx tsx scripts/topup-purchase-codes.ts [organizationId] [buyerTin] [count]
 *
 * Defaults:
 *   organizationId -> first org (preferring name containing "test" or "demo")
 *   buyerTin       -> "100000000" (the seeded sandbox B2B test TIN)
 *   count          -> 20
 */
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

dotenv.config()

const prisma = new PrismaClient()

const DEFAULT_BUYER_TIN = "100000000"
const DEFAULT_COUNT = 20

async function main() {
  const [orgArg, buyerTinArg, countArg] = process.argv.slice(2)

  let orgId = orgArg ? parseInt(orgArg, 10) : null
  if (orgArg && !Number.isInteger(orgId)) {
    throw new Error(`Invalid organizationId: "${orgArg}"`)
  }

  const buyerTin = buyerTinArg?.trim() || DEFAULT_BUYER_TIN

  const count = countArg ? parseInt(countArg, 10) : DEFAULT_COUNT
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Invalid count: "${countArg}"`)
  }

  let org = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId } })
    : null

  if (!org) {
    org =
      (await prisma.organization.findFirst({
        where: { name: { contains: "test", mode: "insensitive" } },
      })) ??
      (await prisma.organization.findFirst({
        where: { name: { contains: "demo", mode: "insensitive" } },
      })) ??
      (await prisma.organization.findFirst())
  }

  if (!org) {
    throw new Error("No organization found. Create one first (e.g. npm run prisma:seed).")
  }

  // Existing codes for this org, so we generate fresh ones instead of colliding
  // with (org.id, code) unique constraint on repeated runs.
  const existing = await prisma.organizationPurchaseCode.findMany({
    where: { organizationId: org.id },
    select: { code: true },
  })
  const existingCodes = new Set(existing.map((c) => c.code))

  // 6-digit numeric codes in the 01xxxx range, matching the seeded style
  // (010301, 010307-010310, ...). Start past the highest existing numeric
  // code so runs are additive rather than reused.
  const highestSeen = existing
    .map((c) => parseInt(c.code, 10))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 10300)

  const newCodes: string[] = []
  let next = highestSeen + 1
  while (newCodes.length < count) {
    const code = String(next).padStart(6, "0")
    if (!existingCodes.has(code)) {
      newCodes.push(code)
    }
    next++
  }

  await prisma.organizationPurchaseCode.createMany({
    data: newCodes.map((code) => ({
      organizationId: org!.id,
      code,
      buyerTin,
    })),
  })

  const poolCount = await prisma.organizationPurchaseCode.count({
    where: { organizationId: org.id, buyerTin, consumed: false },
  })

  console.log("Purchase-code pool topped up:")
  console.log(`  Organization      : ${org.name} (id=${org.id})`)
  console.log(`  Buyer TIN         : ${buyerTin}`)
  console.log(`  Codes added       : ${newCodes.length} (${newCodes[0]}..${newCodes[newCodes.length - 1]})`)
  console.log(`  Unconsumed in pool: ${poolCount}`)
}

main()
  .catch((e) => {
    console.error("Failed to top up purchase codes:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
