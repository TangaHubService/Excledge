import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findFirst: vi.fn(), update: vi.fn() },
    product: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/utils/auditLogger", () => ({
  auditLogger: { purchaseOrders: vi.fn().mockResolvedValue(undefined) },
  default: { purchaseOrders: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../src/services/email.service", () => ({
  emailService: {
    sendPurchaseOrderStatusUpdate: vi.fn().mockResolvedValue(undefined),
    sendPurchaseOrderUpdatedNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/services/inventory-ledger.service", () => ({
  addStock: vi.fn().mockResolvedValue(undefined),
  removeStock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/services/notification.service", () => ({
  default: class { createNotification = vi.fn().mockResolvedValue(undefined); },
}));

vi.mock("../../src/services/vsdc-local-purchase.service", () => ({
  isLocalPurchaseRegistrationOn: vi.fn().mockResolvedValue(false),
  queueLocalPurchase: vi.fn(),
  registerLocalPurchaseAsync: vi.fn(),
}));

import { prisma } from "../../src/lib/prisma";
import { updatePurchaseOrderStatus } from "../../src/controllers/purchaseOrder.controller";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const baseOrder = (items: any[], status = "APPROVED") => ({
  id: 10, orderNumber: "PO-010", status,
  organizationId: 1, userId: 9,
  supplier: { name: "Acme" },
  user: { email: "creator@example.com" },
  organization: { name: "My Org", email: "org@test.com" },
  items,
})

const reqFor = (body: any) => ({
  params: { organizationId: "1", id: "10" },
  user: { userId: 9, name: "Receiver", email: "receiver@example.com" },
  body: { branchId: 7, ...body },
  selectedBranchId: 7,
}) as any

describe("Purchase order receiving is full approval only", () => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses PARTIALLY_RECEIVED", async () => {
    ;(prisma.purchaseOrder.findFirst as any).mockResolvedValue(baseOrder([
      { id: 1, productId: 100, productName: "Widget", quantity: 10, quantityReceived: 0, unitPrice: 50 },
    ]))
    const res = makeRes()
    await updatePurchaseOrderStatus(reqFor({ status: "PARTIALLY_RECEIVED", receivedItems: [{ productId: 100, quantity: 4 }] }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json.mock.calls[0][0].code).toBe("PARTIAL_RECEIVE_NOT_ALLOWED")
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("refuses COMPLETED when any item quantity is less than what is left", async () => {
    ;(prisma.purchaseOrder.findFirst as any).mockResolvedValue(baseOrder([
      { id: 1, productId: 100, productName: "Widget", quantity: 10, quantityReceived: 0, unitPrice: 50 },
      { id: 2, productId: 101, productName: "Gadget", quantity: 5, quantityReceived: 0, unitPrice: 30 },
    ]))
    const res = makeRes()
    await updatePurchaseOrderStatus(reqFor({
      status: "COMPLETED",
      receivedItems: [{ productId: 100, quantity: 10 }, { productId: 101, quantity: 3 }],
    }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json.mock.calls[0][0].message).toMatch(/Gadget.*in full \(5\)/)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it("accepts COMPLETED with every item at its full remaining quantity", async () => {
    ;(prisma.purchaseOrder.findFirst as any).mockResolvedValue(baseOrder([
      { id: 1, productId: 100, productName: "Widget", quantity: 10, quantityReceived: 4, unitPrice: 50 },
    ], "PARTIALLY_RECEIVED"))
    ;(prisma.$transaction as any).mockRejectedValue(new Error("stop after validation"))
    const res = makeRes()
    await updatePurchaseOrderStatus(reqFor({ status: "COMPLETED", receivedItems: [{ productId: 100, quantity: 6 }] }), res)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(res.json.mock.calls.some((c: any[]) => c[0]?.code === "PARTIAL_RECEIVE_NOT_ALLOWED")).toBe(false)
  })
})
