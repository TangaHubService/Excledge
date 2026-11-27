import { beforeEach, describe, expect, it, vi } from "vitest"

const branches: Array<{ id: number; isDefault: boolean; status: string; ebmSerialNo: string | null }> = []

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    branch: {
      findFirst: vi.fn(async ({ where }: any) => {
        const rows = branches.filter((b) =>
          b.status === where.status
          && (where.isDefault == null || b.isDefault === where.isDefault)
          && (where.OR == null || b.ebmSerialNo != null))
        return rows.sort((a, b) => a.id - b.id)[0] ?? null
      }),
      findMany: vi.fn(async () => branches.map((b) => ({ id: b.id }))),
    },
  },
}))

import { getMainBranchId, resolveVsdcBranchId, vsdcBranchGroup } from "../src/services/vsdc-branch.service"
import { stockMovementNeedsEbm } from "../src/services/stock-movement-sync.service"

beforeEach(() => { branches.length = 0 })

describe("one RRA/VSDC configuration on the main branch", () => {
  it("uses the branch marked main", async () => {
    branches.push(
      { id: 1, isDefault: false, status: "ACTIVE", ebmSerialNo: "SRL1" },
      { id: 2, isDefault: true, status: "ACTIVE", ebmSerialNo: null },
    )
    expect(await getMainBranchId(1)).toBe(2)
  })

  it("falls back to the first active branch with device credentials when none is marked main", async () => {
    branches.push(
      { id: 1, isDefault: false, status: "ACTIVE", ebmSerialNo: null },
      { id: 4, isDefault: false, status: "ACTIVE", ebmSerialNo: "SRL4" },
    )
    expect(await getMainBranchId(1)).toBe(4)
  })

  it("routes every branch — even one with its own serial — through the main branch", async () => {
    branches.push(
      { id: 1, isDefault: true, status: "ACTIVE", ebmSerialNo: "SRL1" },
      { id: 2, isDefault: false, status: "ACTIVE", ebmSerialNo: "SRL2" },
      { id: 3, isDefault: false, status: "ACTIVE", ebmSerialNo: null },
    )
    expect(await resolveVsdcBranchId(1, 2)).toBe(1)
    expect(await resolveVsdcBranchId(1, 3)).toBe(1)
    expect(await resolveVsdcBranchId(1, null)).toBe(1)
    expect(await vsdcBranchGroup(1)).toEqual([1, 2, 3])
  })

  it("keeps the requested branch only when the organization has no active branch", async () => {
    expect(await resolveVsdcBranchId(1, 9)).toBe(9)
  })
})

describe("stock movements under one device", () => {
  it("keeps transfers between the organization's own branches local", () => {
    expect(stockMovementNeedsEbm("TRANSFER_OUT" as any, "STOCK_TRANSFER")).toBe(false)
    expect(stockMovementNeedsEbm("TRANSFER_IN" as any, "STOCK_TRANSFER")).toBe(false)
  })

  it("still reports purchases and sales to VSDC", () => {
    expect(stockMovementNeedsEbm("PURCHASE" as any, "RRA_PURCHASE")).toBe(true)
    expect(stockMovementNeedsEbm("SALE" as any, "SALE")).toBe(true)
    expect(stockMovementNeedsEbm("INITIAL_STOCK" as any)).toBe(false)
  })
})
