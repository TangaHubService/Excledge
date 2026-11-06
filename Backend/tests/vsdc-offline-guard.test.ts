import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

let orgRow: any = null
const findManyResult: any[] = []
let saleRow: any = null
let branchRow: any = null
const orgUpdate = vi.fn(async () => ({}))

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(async () => orgRow),
      findMany: vi.fn(async () => findManyResult),
      update: (...args: unknown[]) => (orgUpdate as any)(...args),
    },
    sale: {
      findFirst: vi.fn(async () => saleRow),
    },
    branch: {
      findFirst: vi.fn(async () => branchRow),
      findUnique: vi.fn(async ({ where }: any) => ({ bhfId: "00", vsdcUrl: `http://vsdc-${where.id}.test` })),
    },
  },
}))

import { config } from "../src/config"
import {
  checkVsdcConnection,
  clearVsdcProbeCache,
  verifyVsdcOnlineStatus,
  vsdcOnlineGuardForSale,
} from "../src/middleware/vsdc-offline-guard.middleware"
import { listActiveVsdcDevices, probeVsdc } from "../src/services/vsdc-api.service"

const fetchMock = vi.fn()
const vsdcReply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) }) as any
const BLOCKED = /Cannot connect to VSDC/

const device = (extra: Record<string, unknown> = {}) => ({
  TIN: "999945560",
  ebmDeviceId: null,
  ebmSerialNo: null,
  branches: [{ id: 3 }],
  ...extra,
})

beforeEach(() => {
  orgRow = null
  saleRow = null
  branchRow = { name: "HQ", bhfId: "00", ebmDeviceId: "SDC1", ebmInitializedAt: new Date() }
  findManyResult.length = 0
  orgUpdate.mockClear()
  fetchMock.mockReset()
  clearVsdcProbeCache()
  vi.stubGlobal("fetch", fetchMock)
  config.ebm.enabled = true
  config.ebm.useMock = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("verifyVsdcOnlineStatus: live VSDC check", () => {
  it("blocks when VSDC cannot be reached, even if it answered recently", async () => {
    orgRow = device({ lastSuccessfulVdsContact: new Date() })
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(BLOCKED)
    expect(orgUpdate).not.toHaveBeenCalled()
  })

  it("blocks a training-mode organization too (TS/TR go through VSDC)", async () => {
    orgRow = device({ trainingMode: true })
    fetchMock.mockRejectedValue(new Error("fetch failed"))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(BLOCKED)
  })

  it("blocks a device that has never made contact when VSDC is down", async () => {
    orgRow = device({ lastSuccessfulVdsContact: null })
    fetchMock.mockRejectedValue(new Error("fetch failed"))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(BLOCKED)
  })

  it("allows the sale when VSDC answers and records the contact", async () => {
    orgRow = device()
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001", resultMsg: "There is no search result" }))
    await expect(verifyVsdcOnlineStatus(2, 3)).resolves.toBe(true)
    expect(orgUpdate).toHaveBeenCalledTimes(1)
  })

  it("leaves the decision to VSDC when it answers with its own error code", async () => {
    orgRow = device()
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "894", resultMsg: "server communication error" }))
    await expect(verifyVsdcOnlineStatus(2, 3)).resolves.toBe(true)
  })

  it("treats a gateway error or a non-VSDC reply as disconnected", async () => {
    orgRow = device()
    fetchMock.mockResolvedValueOnce(vsdcReply("Bad gateway", 502))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(BLOCKED)

    clearVsdcProbeCache()
    fetchMock.mockResolvedValueOnce(vsdcReply("<html>proxy login</html>"))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(BLOCKED)
  })

  it("does not call anything when no VSDC device is set up", async () => {
    orgRow = device({ branches: [] })
    await expect(verifyVsdcOnlineStatus(2, 3)).resolves.toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not call anything when EBM is switched off", async () => {
    config.ebm.enabled = false
    orgRow = device()
    await expect(verifyVsdcOnlineStatus(2, 3)).resolves.toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reuses a recent answer so a busy till does not call VSDC for every sale", async () => {
    orgRow = device()
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await verifyVsdcOnlineStatus(2, 3)
    await verifyVsdcOnlineStatus(2, 3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("makes one call when several sales arrive together", async () => {
    orgRow = device()
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await Promise.all([verifyVsdcOnlineStatus(2, 3), verifyVsdcOnlineStatus(2, 3), verifyVsdcOnlineStatus(2, 3)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("checks the device of the selected branch", async () => {
    orgRow = device()
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await verifyVsdcOnlineStatus(2, 9)
    expect(fetchMock.mock.calls[0][0]).toBe("http://vsdc-9.test/code/selectCodes")
  })

  it.each([null, undefined, -1])("falls back to the main device when the branch is %s", async (branchId) => {
    orgRow = device()
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await verifyVsdcOnlineStatus(2, branchId)
    expect(fetchMock.mock.calls[0][0]).toBe("http://vsdc-3.test/code/selectCodes")
  })

  it("refuses a branch whose device was never registered, even when VSDC answers", async () => {
    orgRow = device()
    branchRow = { name: "East Branch", bhfId: "01", ebmDeviceId: null, ebmInitializedAt: null }
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(/East Branch is not registered/)
  })

  it("accepts a device registered before initialization was tracked", async () => {
    orgRow = device()
    branchRow = { name: "HQ", bhfId: "00", ebmDeviceId: "SDC1", ebmInitializedAt: null }
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await expect(verifyVsdcOnlineStatus(2, 3)).resolves.toBe(true)
  })

  it("reports VSDC being down before an unregistered device", async () => {
    orgRow = device()
    branchRow = { name: "East Branch", bhfId: "01", ebmDeviceId: null, ebmInitializedAt: null }
    fetchMock.mockRejectedValue(new Error("fetch failed"))
    await expect(verifyVsdcOnlineStatus(2, 3)).rejects.toThrow(BLOCKED)
  })

  it("reports a missing device as not configured", async () => {
    orgRow = device({ branches: [] })
    await expect(checkVsdcConnection(2, 3)).resolves.toEqual({ configured: false, online: false, registered: false })
  })
})

describe("vsdcOnlineGuardForSale: refunds, corrections and regenerated invoices", () => {
  const run = async (params: Record<string, string>, param: "id" | "saleId" = "id") => {
    const json = vi.fn()
    const res = { status: vi.fn(() => ({ json })) } as any
    await new Promise<void>((resolve) => {
      const next = vi.fn(() => resolve())
      json.mockImplementation(() => resolve())
      vsdcOnlineGuardForSale(param)({ params } as any, res, next)
      ;(run as any).next = next
    })
    return { res, json, next: (run as any).next }
  }

  it("refuses when the VSDC of the sale's branch is down", async () => {
    orgRow = device()
    saleRow = { branchId: 9 }
    fetchMock.mockRejectedValue(new Error("fetch failed"))
    const { res, json, next } = await run({ organizationId: "2", id: "50" })
    expect(res.status).toHaveBeenCalledWith(503)
    expect(json.mock.calls[0][0].error ?? json.mock.calls[0][0].message).toMatch(/not saved/)
    expect(next).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][0]).toBe("http://vsdc-9.test/code/selectCodes")
  })

  it("continues when the VSDC of the sale's branch answers", async () => {
    orgRow = device()
    saleRow = { branchId: 9 }
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    const { next } = await run({ organizationId: "2", saleId: "50" }, "saleId")
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("leaves an unknown sale for the controller to answer", async () => {
    orgRow = device()
    const { next } = await run({ organizationId: "2", id: "50" })
    expect(next).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a bad sale id", async () => {
    const { res } = await run({ organizationId: "2", id: "abc" })
    expect(res.status).toHaveBeenCalledWith(400)
  })
})

describe("probeVsdc", () => {
  const envelope = { tin: "999945560", bhfId: "00", vsdcUrl: "http://vsdc.test" } as any

  it("gives up when VSDC does not answer in time", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    )
    await expect(probeVsdc(envelope, 5)).resolves.toEqual({ reachable: false, error: "aborted" })
  })

  it("asks only for codes newer than now, so the reply stays small", async () => {
    fetchMock.mockResolvedValue(vsdcReply({ resultCd: "001" }))
    await probeVsdc(envelope)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.lastReqDt).toMatch(/^\d{14}$/)
    expect(body.lastReqDt.startsWith("2020")).toBe(false)
  })
})

describe("listActiveVsdcDevices — branch-aware target list", () => {
  it("emits one target per credentialed branch, not per org", async () => {
    findManyResult.push({
      id: 2, name: "Demo Pharmacy", TIN: "999945560", ebmDeviceId: null, ebmSerialNo: null,
      branches: [{ id: 3, name: "East Branch" }, { id: 9, name: "West Branch" }],
    })
    const targets = await listActiveVsdcDevices()
    expect(targets).toEqual([
      { organizationId: 2, branchId: 3, tin: "999945560", label: "Demo Pharmacy / East Branch" },
      { organizationId: 2, branchId: 9, tin: "999945560", label: "Demo Pharmacy / West Branch" },
    ])
  })

  it("falls back to an org-level target only when no branch is credentialed", async () => {
    findManyResult.push({
      id: 5, name: "Legacy Co", TIN: "100000000", ebmDeviceId: "SDC5", ebmSerialNo: "MRC5", branches: [],
    })
    const targets = await listActiveVsdcDevices()
    expect(targets).toEqual([{ organizationId: 5, branchId: null, tin: "100000000", label: "Legacy Co" }])
  })

  it("skips an org with no credentials anywhere", async () => {
    findManyResult.push({ id: 7, name: "Unconfigured", TIN: "200000000", ebmDeviceId: null, ebmSerialNo: null, branches: [] })
    expect(await listActiveVsdcDevices()).toEqual([])
  })
})
