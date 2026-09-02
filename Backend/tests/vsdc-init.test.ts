import { describe, expect, it, vi, beforeEach } from "vitest"

let branchUpdateArgs: any = null
let counterQuery: any = null

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    branch: { update: vi.fn(async (a: any) => { branchUpdateArgs = a; return {} }) },
    organization: { update: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async (strings: any, ...values: any[]) => {
      counterQuery = { strings, values }
      return [{ nextSequence: 5001 }]
    }),
  },
}))

vi.mock("../src/services/rra-ebm.service", async () => {
  const actual = await vi.importActual<any>("../src/services/rra-ebm.service")
  return { ...actual, isEbmEnabled: () => true }
})

vi.mock("../src/services/vsdc-api.service", async () => {
  const actual = await vi.importActual<any>("../src/services/vsdc-api.service")
  return {
    ...actual,
    buildVsdcEnvelope: vi.fn(async () => ({ tin: "100000000", bhfId: "00", sdcId: "OLD", mrcNo: "OLDMRC", dvcSrlNo: "SRL1", env: "sandbox" })),
    validateVsdcEnvelope: vi.fn(() => null),
    selectInitInfo: vi.fn(async () => ({
      success: true, resultCd: "000", resultMsg: "ok", raw: null,
      data: { info: { tin: "100000000", taxprNm: "REAL LTD", bhfId: "00", bhfNm: "HQ", sdcId: "SDC012000250", mrcNo: "MRC012000250", dvcId: "DVC7", lastSaleInvcNo: 5000, lastSaleRcptNo: 4210 } },
    })),
  }
})

import { initializeVsdcDevice } from "../src/services/vsdc-init.service"

beforeEach(() => {
  branchUpdateArgs = null
  counterQuery = null
})

describe("initializeVsdcDevice (§58)", () => {
  it("stores the RRA sdcId/mrcNo on the branch and seeds the counter past lastSaleInvcNo", async () => {
    const r = await initializeVsdcDevice(1, 3)
    expect(r.success).toBe(true)
    expect(r.info?.sdcId).toBe("SDC012000250")

    expect(branchUpdateArgs.where).toEqual({ id: 3 })
    expect(branchUpdateArgs.data.ebmDeviceId).toBe("SDC012000250")
    expect(branchUpdateArgs.data.ebmSerialNo).toBe("MRC012000250")
    expect(branchUpdateArgs.data.ebmInitializedAt).toBeInstanceOf(Date)

    // counter seed uses lastSaleInvcNo + 1 = 5001
    expect(counterQuery.values).toContain(5001)
    expect(r.seededCounterTo).toBe(5001)
  })

  it("rejects a device registered to a different TIN (§22)", async () => {
    const mod = await import("../src/services/vsdc-api.service")
    ;(mod.selectInitInfo as any).mockResolvedValueOnce({
      success: true, resultCd: "000", resultMsg: "ok", raw: null,
      data: { info: { tin: "200000002", sdcId: "X", mrcNo: "Y" } },
    })
    const r = await initializeVsdcDevice(1, 3)
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/registered to TIN 200000002/)
  })
})
