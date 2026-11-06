import { beforeEach, describe, expect, it, vi } from "vitest"

// Items moved D → B by the VAT switch may change their tax type only once.

const existing = vi.hoisted(() => ({ product: null as any, soldLines: [] as Array<{ productId: number }> }))
const productUpdate = vi.fn(async (args: any) => ({ ...existing.product, ...args.data }))

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(async () => existing.product),
      update: (...a: any[]) => (productUpdate as any)(...a),
    },
    organization: { findUnique: vi.fn(async () => ({ vatRegistered: true })) },
    saleItem: { findMany: vi.fn(async () => existing.soldLines) },
  },
}))
vi.mock("../src/services/rra-code.service", () => ({
  isCachedTaxCode: vi.fn(async () => true),
  isCachedCountryCode: vi.fn(async () => true),
  getTaxationTypes: vi.fn(async () => []),
}))
vi.mock("../src/services/product-sync.service", () => ({ syncProductToRraAsync: vi.fn() }))
vi.mock("../src/utils/auditLogger", () => ({ auditLogger: { inventory: vi.fn(async () => {}) } }))

import { updateProduct } from "../src/controllers/inventory.controller"

function run(body: any) {
  const res: any = { statusCode: 200 }
  res.status = vi.fn((c: number) => { res.statusCode = c; return res })
  res.json = vi.fn((b: any) => { res.body = b; return res })
  const req: any = { params: { id: "7", organizationId: "1" }, body, user: { userId: "1" } }
  return updateProduct(req, res).then(() => res)
}

const base = { id: 7, organizationId: 1, name: "Soap", itemCd: "RW1NTXU0000001", ebmSyncStatus: "SYNCED", measurementUnit: "PCS" }

beforeEach(() => {
  productUpdate.mockClear()
})

describe("tax type review after VAT registration", () => {
  it("allows the one change on a converted item and marks it used", async () => {
    existing.product = { ...base, taxCode: "B", taxCodeReviewPending: true, taxCodeReviewedAt: null }
    const res = await run({ taxCode: "A" })
    expect(res.statusCode).toBe(200)
    const data = productUpdate.mock.calls[0][0].data
    expect(data.taxCode).toBe("A")
    expect(data.taxCodeReviewPending).toBe(false)
    expect(data.taxCodeReviewedAt).toBeInstanceOf(Date)
  })

  it("refuses the change once a converted item has been sold", async () => {
    existing.product = { ...base, taxCode: "B", taxCodeReviewPending: true, taxCodeReviewedAt: null }
    existing.soldLines = [{ productId: existing.product.id ?? 1 }]
    const res = await run({ taxCode: "A" })
    existing.soldLines = []
    expect(res.statusCode).toBe(422)
    expect(productUpdate).not.toHaveBeenCalled()
  })

  it("does not spend the change when the same code is resent", async () => {
    existing.product = { ...base, taxCode: "B", taxCodeReviewPending: true, taxCodeReviewedAt: null }
    await run({ taxCode: "b", name: "Soap 2" })
    const data = productUpdate.mock.calls[0][0].data
    expect(data.taxCodeReviewPending).toBeUndefined()
    expect(data.taxCodeReviewedAt).toBeUndefined()
  })

  it("refuses a second change once it was used", async () => {
    existing.product = { ...base, taxCode: "A", taxCodeReviewPending: false, taxCodeReviewedAt: new Date() }
    const res = await run({ taxCode: "B" })
    expect(res.statusCode).toBe(422)
    expect(productUpdate).not.toHaveBeenCalled()
  })

  it("leaves items that were never converted freely editable", async () => {
    existing.product = { ...base, taxCode: "B", taxCodeReviewPending: false, taxCodeReviewedAt: null }
    const res = await run({ taxCode: "C" })
    expect(res.statusCode).toBe(200)
    const data = productUpdate.mock.calls[0][0].data
    expect(data.taxCode).toBe("C")
    expect(data.taxCodeReviewedAt).toBeUndefined()
  })
})
