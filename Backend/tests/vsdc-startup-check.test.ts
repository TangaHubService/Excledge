import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

const devices: any[] = []
let deviceRow: any = null
let stuckRows: any[] = []

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn(async () => deviceRow) },
    branch: { findUnique: vi.fn(async () => deviceRow) },
    ebmOutbox: { groupBy: vi.fn(async () => stuckRows) },
  },
}))

const probeVsdc = vi.fn()
const validateVsdcEnvelope = vi.fn()
vi.mock("../src/services/vsdc-api.service", () => ({
  listActiveVsdcDevices: vi.fn(async () => devices),
  buildVsdcEnvelope: vi.fn(async () => ({ tin: "999945560", bhfId: "00" })),
  probeVsdc: (...args: unknown[]) => probeVsdc(...args),
  validateVsdcEnvelope: (...args: unknown[]) => validateVsdcEnvelope(...args),
}))

import { config } from "../src/config"
import { runVsdcStartupChecks } from "../src/services/vsdc-startup-check.service"

const HQ = { organizationId: 1, branchId: 1, tin: "999945560", label: "Demo / HQ" }

describe("runVsdcStartupChecks", () => {
  const original = { enabled: config.ebm.enabled, useMock: config.ebm.useMock, apiUrl: config.ebm.apiUrl }

  beforeEach(() => {
    devices.length = 0
    devices.push(HQ)
    deviceRow = { ebmInitializedAt: new Date(), ebmDeviceId: "SDC1" }
    stuckRows = []
    probeVsdc.mockReset().mockResolvedValue({ reachable: true, resultCd: "001" })
    validateVsdcEnvelope.mockReset().mockReturnValue(null)
    Object.assign(config.ebm, { enabled: true, useMock: false, apiUrl: "http://vsdc.test" })
  })

  afterEach(() => {
    Object.assign(config.ebm, original)
  })

  it("finds nothing when every device is healthy", async () => {
    await expect(runVsdcStartupChecks()).resolves.toEqual([])
  })

  it("skips everything when EBM is off", async () => {
    config.ebm.enabled = false
    await expect(runVsdcStartupChecks()).resolves.toEqual([])
    expect(probeVsdc).not.toHaveBeenCalled()
  })

  it("flags a device that was never registered", async () => {
    deviceRow = { ebmInitializedAt: null, ebmDeviceId: null }
    const issues = await runVsdcStartupChecks()
    expect(issues).toHaveLength(1)
    expect(issues[0].problem).toMatch(/not registered/)
  })

  it("flags VSDC not answering", async () => {
    probeVsdc.mockResolvedValue({ reachable: false, error: "fetch failed" })
    const issues = await runVsdcStartupChecks()
    expect(issues[0].problem).toMatch(/not answering/)
  })

  it("flags a bad device setup", async () => {
    validateVsdcEnvelope.mockReturnValue("TIN is missing")
    const issues = await runVsdcStartupChecks()
    expect(issues[0].problem).toBe("TIN is missing")
  })

  it("flags documents VSDC has not signed", async () => {
    stuckRows = [{ organizationId: 1, status: "FAILED", _count: { _all: 4 } }]
    const issues = await runVsdcStartupChecks()
    expect(issues[0].problem).toMatch(/4 document/)
  })

  it("keeps checking other devices when one check throws", async () => {
    devices.push({ ...HQ, branchId: 2, label: "Demo / East" })
    probeVsdc.mockRejectedValueOnce(new Error("boom"))
    const issues = await runVsdcStartupChecks()
    expect(issues).toEqual([{ label: "Demo / HQ", problem: "check failed: boom" }])
    expect(probeVsdc).toHaveBeenCalledTimes(2)
  })
})
