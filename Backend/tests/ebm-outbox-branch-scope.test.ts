import { AsyncLocalStorage } from "async_hooks"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ outboxUpdates: [] as any[], rows: [] as any[], sale: null as any }))

vi.mock("../src/lib/prisma", () => {
  const branchStorage = new AsyncLocalStorage<{ branchId?: number | number[] }>()
  return {
    branchStorage,
    withBranchScope: (branchId: number, fn: () => unknown) => branchStorage.run({ branchId }, fn),
    prisma: {
      ebmOutbox: {
        findMany: vi.fn(async () => mocks.rows),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async (args: any) => {
          mocks.outboxUpdates.push(args.data)
          return {}
        }),
      },
      sale: {
        // Behaves like the branch filter in lib/prisma.ts.
        findFirst: vi.fn(async () => {
          const scope = branchStorage.getStore()?.branchId
          return scope === undefined || scope === mocks.sale.branchId ? mocks.sale : null
        }),
      },
    },
  }
})

import { config } from "../src/config"
import { withBranchScope } from "../src/lib/prisma"
import { processEbmOutboxBatch } from "../src/services/ebm-outbox.service"

describe("processEbmOutboxBatch: started from one branch's request", () => {
  beforeEach(() => {
    config.ebm.enabled = true
    mocks.outboxUpdates.length = 0
    mocks.rows = [{ id: 1, saleId: 50, organizationId: 1, operation: "SALE", status: "PENDING", retryCount: 0, updatedAt: new Date() }]
    // A cancelled sale stops the worker right after loading it, so only the lookup is under test.
    mocks.sale = { id: 50, branchId: 2, status: "CANCELLED" }
  })

  it("can see another branch's sale, so it does not mark it as missing", async () => {
    await withBranchScope(1, () => processEbmOutboxBatch(5))
    expect(mocks.outboxUpdates).toEqual([
      { status: "DEAD_LETTER", lastError: "Sale cancelled before VSDC processing" },
    ])
  })

  it("does not change the branch scope of the request that started it", async () => {
    const { branchStorage } = await import("../src/lib/prisma")
    await withBranchScope(1, async () => {
      await processEbmOutboxBatch(5)
      expect(branchStorage.getStore()?.branchId).toBe(1)
    })
  })
})
