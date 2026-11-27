import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ cursor: null as string | null }))

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    rraSyncCursor: {
      findUnique: vi.fn(async () => (state.cursor ? { id: 1, lastReqDt: state.cursor } : null)),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async () => ({})),
    },
  },
}))
vi.mock("../src/services/rra-ebm.service", async () => ({
  ...(await vi.importActual<any>("../src/services/rra-ebm.service")),
  isEbmEnabled: () => true,
}))
vi.mock("../src/services/vsdc-api.service", async () => ({
  ...(await vi.importActual<any>("../src/services/vsdc-api.service")),
  buildVsdcEnvelope: vi.fn(async () => ({ tin: "100000000", bhfId: "00" })),
  selectPurchases: vi.fn(async () => ({ success: true, resultCd: "001", resultMsg: "none", raw: null, data: { saleList: [] } })),
}))
vi.mock("../src/utils/socket", () => ({ emitToBranch: vi.fn(), emitToOrganization: vi.fn() }))

import { PURCHASES_DEFAULT_LAST_REQ_DT, syncRraPurchases } from "../src/services/purchase-sync.service"
import { selectPurchases } from "../src/services/vsdc-api.service"

const sentReqDt = () => vi.mocked(selectPurchases).mock.calls.at(-1)?.[1]

beforeEach(() => {
  state.cursor = null
  vi.mocked(selectPurchases).mockClear()
})

describe("purchase pull start = last request date + 1 second", () => {
  it("asks VSDC from one second after the last request", async () => {
    state.cursor = "20261127235959"
    const r = await syncRraPurchases(1)
    expect(sentReqDt()).toBe("20261128000000")
    expect(r.lastReqDt).toBe("20261128000000")
  })
  it("the first pull ever starts at the default date itself", async () => {
    await syncRraPurchases(1)
    expect(sentReqDt()).toBe(PURCHASES_DEFAULT_LAST_REQ_DT)
  })
  it("a hand-picked request date is sent as is", async () => {
    state.cursor = "20261127100000"
    await syncRraPurchases(1, { requestDate: "2026-11-01" })
    expect(sentReqDt()).toBe("20261101000000")
  })
})
