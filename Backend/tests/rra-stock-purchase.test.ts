import { describe, expect, it, vi, beforeEach } from "vitest"

// ── Mocks ────────────────────────────────────────────────────────────────
let stockItemsPayload: any = null
let stockMasterArgs: any = null
let savePurchasePayload: any = null
const ledgerUpdates: any[] = []

vi.mock("../src/lib/prisma", () => {
  const purchase = {
    id: 7,
    organizationId: 1,
    spplrTin: "200000001",
    spplrNm: "ACME WHOLESALE",
    spplrBhfId: "00",
    spplrInvcNo: 4321n,
    rcptTyCd: "P",
    pmtTyCd: "01",
    remark: null,
    status: "PENDING",
    items: [
      { itemSeq: 1, itemCd: "RW2CTU0000001", itemClsCd: "5059690800", itemNm: "Widget", bcd: null,
        pkgUnitCd: "CT", pkg: { toNumber: () => 10 }, qtyUnitCd: "U",
        qty: { toNumber: () => 10 }, prc: { toNumber: () => 118 }, splyAmt: { toNumber: () => 1180 },
        dcRt: null, dcAmt: null, taxTyCd: "B", taxblAmt: { toNumber: () => 1000 }, taxAmt: { toNumber: () => 180 }, totAmt: { toNumber: () => 1180 } },
    ],
  }
  return {
    prisma: {
      rraSyncCursor: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
      rraPurchase: {
        findFirst: vi.fn(async () => purchase),
        update: vi.fn(async () => ({})),
        upsert: vi.fn(async () => ({})),
      },
      user: { findUnique: vi.fn(async () => ({ id: 3, name: "Buyer" })) },
      inventoryLedger: {
        findUnique: vi.fn(async () => ({
          id: 99, organizationId: 1, branchId: 1, movementType: "PURCHASE", direction: "IN",
          quantity: 10, unitCost: { toNumber: () => 118 }, createdAt: new Date("2026-08-31T08:00:00Z"),
          note: "PO receipt", ebmSyncStatus: "PENDING", ebmSarNo: null,
          product: { id: 5, name: "Widget", itemCd: "RW2CTU0000001", itemClsCd: "5059690800", pkgUnitCd: "CT", qtyUnitCd: "U", barcode: null, taxCode: "B", unitPrice: { toNumber: () => 118 } },
          user: { id: 3, name: "Buyer" },
        })),
        aggregate: vi.fn(async () => ({ _max: { ebmSarNo: 41 } })),
        update: vi.fn(async (a: any) => { ledgerUpdates.push(a); return {} }),
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
        groupBy: vi.fn(async () => []),
      },
      organization: { update: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
    },
  }
})

vi.mock("../src/services/rra-ebm.service", async () => {
  const actual = await vi.importActual<any>("../src/services/rra-ebm.service")
  return { ...actual, isEbmEnabled: () => true }
})

vi.mock("../src/services/inventory-ledger.service", () => ({ getCurrentStock: vi.fn(async () => 250) }))

vi.mock("../src/services/vsdc-api.service", async () => {
  const actual = await vi.importActual<any>("../src/services/vsdc-api.service")
  return {
    ...actual,
    buildVsdcEnvelope: vi.fn(async () => ({ tin: "100000000", bhfId: "00", sdcId: "SDC1", mrcNo: "MRC1", dvcSrlNo: "MRC1", env: "sandbox" })),
    validateVsdcEnvelope: vi.fn(() => null),
    saveStockItems: vi.fn(async (_e: any, p: any) => { stockItemsPayload = p; return { success: true, data: { rcptNo: "1" }, rawStatus: 200, rawBody: {} } }),
    saveStockMaster: vi.fn(async (_e: any, itemCd: string, rsdQty: number, reg: any) => { stockMasterArgs = { itemCd, rsdQty, reg }; return { success: true, rawStatus: 200, rawBody: {} } }),
    savePurchase: vi.fn(async (_e: any, p: any) => { savePurchasePayload = p; return { success: true, rawStatus: 200, rawBody: {} } }),
  }
})

import { sarTyCdFor, stockMovementNeedsEbm, submitStockLedgerEntryToEbm } from "../src/services/stock-movement-sync.service"
import { confirmRraPurchase } from "../src/services/purchase-sync.service"

beforeEach(() => {
  stockItemsPayload = null
  stockMasterArgs = null
  savePurchasePayload = null
  ledgerUpdates.length = 0
})

describe("sarTyCdFor (§4.19 stock in/out reason)", () => {
  it("maps incoming movements to IN reason codes", () => {
    expect(sarTyCdFor("PURCHASE", "IN")).toBe("02")
    expect(sarTyCdFor("RETURN_CUSTOMER", "IN")).toBe("03")
    expect(sarTyCdFor("TRANSFER_IN", "IN")).toBe("04")
    expect(sarTyCdFor("ADJUSTMENT_IN", "IN")).toBe("06")
  })
  it("maps outgoing movements to OUT reason codes", () => {
    expect(sarTyCdFor("TRANSFER_OUT", "OUT")).toBe("13")
    expect(sarTyCdFor("DAMAGE", "OUT")).toBe("15")
    expect(sarTyCdFor("ADJUSTMENT_OUT", "OUT")).toBe("16")
  })
  it("never reports a SALE (RRA derives stock-out from saveSales)", () => {
    expect(sarTyCdFor("SALE", "OUT")).toBeNull()
    expect(stockMovementNeedsEbm("SALE")).toBe(false)
    expect(stockMovementNeedsEbm("PURCHASE")).toBe(true)
  })
})

describe("submitStockLedgerEntryToEbm (§72/§73)", () => {
  it("sends a StockIoSaveReq then pushes the new on-hand quantity to the stock master", async () => {
    const r = await submitStockLedgerEntryToEbm(99)
    expect(r.success).toBe(true)

    expect(stockItemsPayload.sarNo).toBe(42) // 41 + 1
    expect(stockItemsPayload.sarTyCd).toBe("02")
    expect(stockItemsPayload.itemList[0].itemCd).toBe("RW2CTU0000001")
    expect(stockItemsPayload.itemList[0].qty).toBe(10)
    // input VAT extracted from the 118 x 10 supply
    expect(stockItemsPayload.itemList[0].taxAmt).toBeCloseTo(180, 0)

    expect(stockMasterArgs.itemCd).toBe("RW2CTU0000001")
    expect(stockMasterArgs.rsdQty).toBe(250)

    expect(ledgerUpdates.at(-1).data.ebmSyncStatus).toBe("SYNCED")
  })
})

describe("confirmRraPurchase (§71)", () => {
  it("builds a TrnsPurchaseSaveReq with per-band tax and marks the purchase CONFIRMED", async () => {
    const r = await confirmRraPurchase(1, 7, { userId: 3 })
    expect(r.success).toBe(true)

    expect(savePurchasePayload.spplrTin).toBe("200000001")
    expect(savePurchasePayload.spplrInvcNo).toBe(4321)
    expect(savePurchasePayload.pchsSttsCd).toBe("02")
    expect(savePurchasePayload.taxblAmtB).toBeCloseTo(1000, 0)
    expect(savePurchasePayload.taxAmtB).toBeCloseTo(180, 0)
    expect(savePurchasePayload.totAmt).toBeCloseTo(1180, 0)
    expect(savePurchasePayload.itemList[0].taxTyCd).toBe("B")
  })
})
