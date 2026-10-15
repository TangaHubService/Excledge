import { beforeEach, describe, expect, it, vi } from "vitest"

const ebmConfig = vi.hoisted(() => ({ environment: "production", useMock: false }))

vi.mock("../src/config", () => ({ config: { ebm: ebmConfig } }))

const orgUpdate = vi.fn(async () => ({}))
const branchUpdateMany = vi.fn(async () => ({ count: 1 }))
const stored = { org: null as string | null, branch: null as string | null }

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    organization: {
      update: (...a: any[]) => (orgUpdate as any)(...a),
      findUnique: vi.fn(async () => ({ ebmSerialNo: stored.org, vatRegistered: true, TIN: "100000000", ebmDeviceId: null })),
    },
    branch: {
      updateMany: (...a: any[]) => (branchUpdateMany as any)(...a),
      findFirst: vi.fn(async () => ({ bhfId: "00", ebmSerialNo: stored.branch })),
    },
    $queryRaw: vi.fn(async () => [{ sidebarConfig: {}, featureFlags: {}, preferences: {} }]),
  },
}))

import {
  checkMrc,
  isMrcValidationRelaxed,
  MRC_FORMAT_ERROR_CODE,
  MrcFormatError,
  normalizeMrcOrThrow,
  resolveReportMrc,
} from "../src/utils/mrc"
import { upsertOrganizationSettings } from "../src/services/organization-settings.service"

beforeEach(() => {
  ebmConfig.environment = "production"
  ebmConfig.useMock = false
  stored.org = null
  stored.branch = null
  orgUpdate.mockClear()
  branchUpdateMany.mockClear()
})

describe("checkMrc", () => {
  it("accepts a valid BBBCCNNNNNN MRC, trimmed and uppercased", () => {
    expect(checkMrc("  wis01000123 ", { relaxed: false })).toEqual({ ok: true, value: "WIS01000123" })
  })

  it.each(["WIS0100012", "WIS010001234", "WIS01ABC123", "WIS-0100012", "MRC012000250"])(
    "rejects %s outside sandbox/mock",
    (v) => {
      const r = checkMrc(v, { relaxed: false })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe(MRC_FORMAT_ERROR_CODE)
    },
  )

  it("treats undefined as not supplied and null/blank as clearing", () => {
    expect(checkMrc(undefined, { relaxed: false })).toEqual({ ok: true, value: undefined })
    expect(checkMrc(null, { relaxed: false })).toEqual({ ok: true, value: null })
    expect(checkMrc("   ", { relaxed: false })).toEqual({ ok: true, value: null })
  })

  it("is relaxed in sandbox or mock mode (still normalized)", () => {
    ebmConfig.environment = "sandbox"
    expect(isMrcValidationRelaxed()).toBe(true)
    expect(checkMrc(" test-serial ")).toEqual({ ok: true, value: "TEST-SERIAL" })

    ebmConfig.environment = "production"
    ebmConfig.useMock = true
    expect(checkMrc("anything")).toEqual({ ok: true, value: "ANYTHING" })

    ebmConfig.useMock = false
    expect(isMrcValidationRelaxed()).toBe(false)
    expect(checkMrc("anything").ok).toBe(false)
  })

  it("lets an unchanged stored value through so unrelated edits are not blocked", () => {
    expect(checkMrc("mrc012000250", { relaxed: false, current: [null, "MRC012000250"] }).ok).toBe(true)
    expect(checkMrc("MRC012000251", { relaxed: false, current: ["MRC012000250"] }).ok).toBe(false)
  })

  it("normalizeMrcOrThrow throws a 400 MrcFormatError", () => {
    expect(() => normalizeMrcOrThrow("bad", { relaxed: false })).toThrow(MrcFormatError)
    try {
      normalizeMrcOrThrow("bad", { relaxed: false })
    } catch (e: any) {
      expect(e.statusCode).toBe(400)
      expect(e.code).toBe(MRC_FORMAT_ERROR_CODE)
    }
  })
})

describe("resolveReportMrc precedence", () => {
  const org = { ebmSerialNo: "ORG01000001" }

  it("prefers the VSDC-returned ebmInitInfo.mrcNo", () => {
    expect(resolveReportMrc({ ebmInitInfo: { mrcNo: "WIS01000999" }, ebmSerialNo: "BRA01000002" }, org)).toBe("WIS01000999")
  })

  it("falls back to branch.ebmSerialNo, then org.ebmSerialNo", () => {
    expect(resolveReportMrc({ ebmInitInfo: null, ebmSerialNo: "BRA01000002" }, org)).toBe("BRA01000002")
    expect(resolveReportMrc({ ebmInitInfo: { mrcNo: "  " }, ebmSerialNo: null }, org)).toBe("ORG01000001")
    expect(resolveReportMrc(null, org)).toBe("ORG01000001")
  })

  it("ignores malformed init payloads and returns null when nothing is configured", () => {
    expect(resolveReportMrc({ ebmInitInfo: ["x"], ebmSerialNo: null }, null)).toBeNull()
    expect(resolveReportMrc({ ebmInitInfo: { mrcNo: 123 }, ebmSerialNo: "" }, { ebmSerialNo: null })).toBeNull()
  })
})

describe("upsertOrganizationSettings ebmConfig.dvcSrlNo", () => {
  it("writes the normalized MRC to the org and default branch", async () => {
    await upsertOrganizationSettings(1, { ebmConfig: { dvcSrlNo: " wis01000123 " } } as any)
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 1 }, data: { ebmSerialNo: "WIS01000123" } })
    expect(branchUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: 1, isDefault: true },
      data: { ebmSerialNo: "WIS01000123" },
    })
  })

  it("rejects a malformed MRC before writing anything", async () => {
    await expect(
      upsertOrganizationSettings(1, { ebmConfig: { tin: "100000000", dvcSrlNo: "BAD" } } as any),
    ).rejects.toBeInstanceOf(MrcFormatError)
    expect(orgUpdate).not.toHaveBeenCalled()
    expect(branchUpdateMany).not.toHaveBeenCalled()
  })

  it("accepts the echoed-back stored value even if it predates validation", async () => {
    stored.branch = "MRC012000250"
    await upsertOrganizationSettings(1, { ebmConfig: { dvcSrlNo: "MRC012000250" } } as any)
    expect(branchUpdateMany).toHaveBeenCalledTimes(1)
  })

  it("clears the MRC on blank input", async () => {
    await upsertOrganizationSettings(1, { ebmConfig: { dvcSrlNo: "" } } as any)
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 1 }, data: { ebmSerialNo: null } })
  })
})
