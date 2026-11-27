import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  org: { vatRegistered: true } as { vatRegistered: boolean } | null,
  products: [] as Array<{ id: number }>,
  productUpdate: vi.fn(async (_args: unknown) => ({ count: 0 })),
  productFind: vi.fn(async (_args: unknown) => [] as Array<{ id: number }>),
  orgUpdate: vi.fn(async (_args: unknown) => ({})),
}))

vi.mock("../src/lib/prisma", () => {
  const tx = {
    product: {
      findMany: (a: unknown) => db.productFind(a),
      updateMany: (a: unknown) => db.productUpdate(a),
    },
    organization: { update: (a: unknown) => db.orgUpdate(a) },
  }
  return {
    prisma: {
      organization: { findUnique: vi.fn(async () => db.org) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("../src/services/product-sync.service", () => ({ syncProductToRraAsync: vi.fn() }))
vi.mock("../src/utils/auditLogger", () => ({ auditLogger: { system: vi.fn(async () => undefined) } }))
const vsdc = vi.hoisted(() => ({
  ebm: true,
  devices: [] as Array<{ organizationId: number; branchId: number | null; tin: string; label: string }>,
  init: vi.fn(async (_e: unknown): Promise<any> => ({ success: true, data: { info: {} } })),
}))
vi.mock("../src/services/rra-ebm.service", () => ({ isEbmEnabled: () => vsdc.ebm }))
vi.mock("../src/services/vsdc-api.service", () => ({
  listActiveVsdcDevices: vi.fn(async () => vsdc.devices),
  buildVsdcEnvelope: vi.fn(async () => ({ tin: "999945560", bhfId: "00" })),
  selectInitInfo: (e: unknown) => vsdc.init(e),
}))
vi.mock("../src/utils/logger", () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { applyRraVatStatus, isVatNotEnabledError, lookupRraVatStatus, rraVatRegisteredFromInit } from "../src/services/rra-vat-status.service"
import { syncProductToRraAsync } from "../src/services/product-sync.service"

describe("rraVatRegisteredFromInit", () => {
  it("is VAT-registered only for vatTyCd 1, like the VSDC", () => {
    expect(rraVatRegisteredFromInit(1)).toBe(true)
    expect(rraVatRegisteredFromInit("1")).toBe(true)
    expect(rraVatRegisteredFromInit(2)).toBe(false)
    expect(rraVatRegisteredFromInit("0")).toBe(false)
  })
  it("returns null when RRA did not say", () => {
    expect(rraVatRegisteredFromInit(undefined)).toBeNull()
    expect(rraVatRegisteredFromInit(null)).toBeNull()
    expect(rraVatRegisteredFromInit("")).toBeNull()
  })
})

describe("isVatNotEnabledError", () => {
  it("matches the VSDC 910 VAT refusal", () => {
    expect(
      isVatNotEnabledError(
        "VSDC error 910: Request parameter error: VAT is not enabled: [taxblAmtB] must be 0 or null,",
      ),
    ).toBe(true)
  })
  it("ignores other errors", () => {
    expect(isVatNotEnabledError("VSDC error 910: Request parameter error: [pmtTyCd]")).toBe(false)
    expect(isVatNotEnabledError("VSDC error 881: purchase code required")).toBe(false)
    expect(isVatNotEnabledError(undefined)).toBe(false)
  })
})

describe("applyRraVatStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.org = { vatRegistered: true }
    db.productFind.mockResolvedValue([{ id: 7 }, { id: 9 }])
  })

  it("switches VAT off and moves A/B/C items to D", async () => {
    const res = await applyRraVatStatus(4, false, "test")
    expect(res).toEqual({ changed: true, vatRegistered: false, productsConverted: 2 })
    expect(db.productFind.mock.calls[0][0]).toMatchObject({
      where: { organizationId: 4, OR: [{ taxCode: { in: ["A", "B", "C"] } }] },
    })
    expect(db.productUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: { in: [7, 9] } },
      data: { taxCode: "D", taxCodeReviewPending: false, ebmSyncStatus: "PENDING" },
    })
    expect(db.orgUpdate).toHaveBeenCalledWith({ where: { id: 4 }, data: { vatRegistered: false } })
    expect(syncProductToRraAsync).toHaveBeenCalledTimes(2)
  })

  it("switches VAT on and moves D items to B for review", async () => {
    db.org = { vatRegistered: false }
    await applyRraVatStatus(4, true, "test")
    expect(db.productUpdate.mock.calls[0][0]).toMatchObject({
      data: { taxCode: "B", taxCodeReviewPending: true },
    })
  })

  it("does nothing when the flag already matches RRA", async () => {
    const res = await applyRraVatStatus(4, true, "test")
    expect(res.changed).toBe(false)
    expect(db.orgUpdate).not.toHaveBeenCalled()
    expect(db.productUpdate).not.toHaveBeenCalled()
  })
})

describe("lookupRraVatStatus", () => {
  beforeEach(() => {
    vsdc.ebm = true
    vsdc.devices = [{ organizationId: 1, branchId: 1, tin: "999945560", label: "Org / HQ" }]
    vsdc.init.mockReset()
  })
  it("reports RRA's non-VAT status from selectInitInfo", async () => {
    vsdc.init.mockResolvedValue({ success: true, data: { info: { vatTyCd: 2 } } })
    expect((await lookupRraVatStatus(1)).vatRegistered).toBe(false)
  })
  it("reports VAT-registered for vatTyCd 1", async () => {
    vsdc.init.mockResolvedValue({ success: true, data: { info: { vatTyCd: "1" } } })
    expect((await lookupRraVatStatus(1)).vatRegistered).toBe(true)
  })
  it("returns null when RRA cannot be asked", async () => {
    vsdc.init.mockResolvedValue({ success: false, resultCd: "894", resultMsg: "down" })
    const r = await lookupRraVatStatus(1)
    expect(r.vatRegistered).toBeNull()
    expect(r.detail).toContain("894")
  })
  it("ignores other organizations' devices and EBM-off", async () => {
    vsdc.devices = [{ organizationId: 2, branchId: 5, tin: "x", label: "Other" }]
    expect((await lookupRraVatStatus(1)).vatRegistered).toBeNull()
    vsdc.ebm = false
    expect((await lookupRraVatStatus(1)).detail).toBe("EBM is not enabled")
    expect(vsdc.init).not.toHaveBeenCalled()
  })
})
