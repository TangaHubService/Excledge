import { describe, expect, it, vi, beforeEach } from "vitest"

let updatePayload: any = null
let addStockArgs: any = null
const importUpserts: any[] = []
let cursorValue = "20260101000000"
const cursorUpserts: any[] = []
let importLineStatus = "PENDING"

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    rraSyncCursor: {
      findUnique: vi.fn(async () => ({ lastReqDt: cursorValue })),
      upsert: vi.fn(async (a: any) => { cursorUpserts.push(a); return a.create }),
    },
    rraImportItem: {
      upsert: vi.fn(async (a: any) => { importUpserts.push(a); return a.create }),
      findFirst: vi.fn(async () => ({
        id: 1, organizationId: 1, taskCd: "TASK1", dclNo: "DCL9", dclDe: "20260815", itemSeq: 1,
        hsCd: "1234.56", itemNm: "Imported widget", itemCd: null, itemClsCd: null,
        status: importLineStatus, qty: { toNumber: () => 40 },
      })),
      update: vi.fn(async () => ({})),
    },
    user: { findUnique: vi.fn(async () => ({ id: 2, name: "Importer" })) },
    organization: { update: vi.fn(async () => ({})) },
  },
}))

vi.mock("../src/services/rra-ebm.service", async () => {
  const actual = await vi.importActual<any>("../src/services/rra-ebm.service")
  return { ...actual, isEbmEnabled: () => true }
})

vi.mock("../src/services/inventory-ledger.service", () => ({
  addStock: vi.fn(async (a: any) => { addStockArgs = a; return { id: 5 } }),
}))

vi.mock("../src/services/vsdc-api.service", async () => {
  const actual = await vi.importActual<any>("../src/services/vsdc-api.service")
  return {
    ...actual,
    buildVsdcEnvelope: vi.fn(async () => ({ tin: "100000000", bhfId: "00", sdcId: "SDC1", mrcNo: "MRC1", dvcSrlNo: "MRC1", env: "sandbox" })),
    validateVsdcEnvelope: vi.fn(() => null),
    selectImportItems: vi.fn(async () => ({
      success: true, resultCd: "000", resultMsg: "ok", raw: null,
      data: { itemList: [
        { taskCd: "TASK1", dclDe: "20260815", itemSeq: 1, dclNo: "DCL9", hsCd: "1234.56", itemNm: "Imported widget",
          qty: 40, qtyUnitCd: "U", pkgUnitCd: "CT", spplrNm: "OVERSEAS CO", invcFcurAmt: 2000, invcFcurCd: "USD" },
      ] },
    })),
    updateImportItems: vi.fn(async (_e: any, p: any) => { updatePayload = p; return { success: true, rawStatus: 200, rawBody: {} } }),
  }
})

import { syncRraImports, actionRraImport } from "../src/services/rra-import.service"

beforeEach(() => {
  updatePayload = null
  addStockArgs = null
  importUpserts.length = 0
  cursorUpserts.length = 0
  cursorValue = "20260101000000"
  importLineStatus = "PENDING"
})

describe("syncRraImports — request-date validation (§67)", () => {
  it("rejects a request date that is not later than the previous request", async () => {
    cursorValue = "20260201000000"
    const r = await syncRraImports(1, { requestDate: "2026-01-15" })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/later than the previous/)
  })

  it("accepts a later request date and caches the returned lines (§66)", async () => {
    cursorValue = "20260101000000"
    const r = await syncRraImports(1, { requestDate: "2026-08-01" })
    expect(r.ok).toBe(true)
    expect(r.cached).toBe(1)
    expect(importUpserts[0].where.organizationId_taskCd_dclDe_itemSeq).toEqual({
      organizationId: 1, taskCd: "TASK1", dclDe: "20260815", itemSeq: 1,
    })
    // cursor advances to the run time, not the request date
    expect(cursorUpserts.at(-1).create.lastResult).toMatch(/OK/)
  })

  it("uses the stored cursor when no request date is given", async () => {
    const r = await syncRraImports(1)
    expect(r.ok).toBe(true)
  })
})

describe("actionRraImport — approve/reject (§68)", () => {
  it("approves with imptItemSttsCd 2 and books the stock-in when a product is linked", async () => {
    const r = await actionRraImport(1, 1, "approve", { branchId: 3, userId: 2, itemClsCd: "5059690800", itemCd: "RW2CTU0000009", linkProductId: 77 })
    expect(r.success).toBe(true)
    expect(updatePayload.imptItemSttsCd).toBe("2")
    expect(updatePayload.taskCd).toBe("TASK1")
    expect(updatePayload.itemClsCd).toBe("5059690800")

    expect(addStockArgs.productId).toBe(77)
    expect(addStockArgs.quantity).toBe(40)
    expect(addStockArgs.referenceType).toBe("RRA_IMPORT")
  })

  it("rejects with imptItemSttsCd 3 and does not touch stock", async () => {
    const r = await actionRraImport(1, 1, "reject", { branchId: 3, userId: 2, remark: "wrong HS code" })
    expect(r.success).toBe(true)
    expect(updatePayload.imptItemSttsCd).toBe("3")
    expect(addStockArgs).toBeNull()
  })

  it("refuses to action a line that is not pending", async () => {
    importLineStatus = "APPROVED"
    const r = await actionRraImport(1, 1, "approve", { branchId: 3 })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/already approved/)
  })
})
