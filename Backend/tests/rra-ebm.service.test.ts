import { describe, expect, it } from "vitest";

import {
  buildVsdcBranchMasterPayload,
  buildVsdcItemMasterPayload,
  buildVsdcReferencePayload,
  buildVsdcStockMovementPayload,
  buildCancelGatewayPayload,
  buildRefundGatewayPayload,
  buildSaleGatewayPayload,
  parseGatewayResponse,
  summarizeVsdcSyncResponse,
} from "../src/services/rra-ebm.service";

describe("rra-ebm.service", () => {
  it("maps the current sale model into a VSDC-style sales payload", () => {
    const payload = buildSaleGatewayPayload(
      {
        id: 42,
        saleNumber: "SALE-42",
        invoiceNumber: "INV-1130-2026-000042",
        purchaseOrderCode: "PO-7788",
        status: "PENDING",
        createdAt: new Date("2026-04-10T08:09:10Z"),
        paymentType: "MOBILE_MONEY",
        cashAmount: { toNumber: () => 0 } as never,
        debtAmount: { toNumber: () => 0 } as never,
        insuranceAmount: { toNumber: () => 0 } as never,
        totalAmount: { toNumber: () => 118 } as never,
        taxableAmount: { toNumber: () => 100 } as never,
        vatAmount: { toNumber: () => 18 } as never,
        branchId: 7,
        branch: {
          id: 7,
          name: "Kigali Branch",
          code: "KIGALI-01",
          bhfId: "12",
          address: "KN 1 Ave",
        },
        customer: {
          name: "Acme Ltd",
          phone: "0788000000",
          TIN: "100600570",
          customerType: "CORPORATE",
          email: "finance@acme.test",
        },
        user: {
          id: 9,
          name: "Verifier",
        },
        saleItems: [
          {
            productId: 3,
            quantity: 2,
            unitPrice: { toNumber: () => 59 } as never,
            totalPrice: { toNumber: () => 118 } as never,
            taxRate: { toNumber: () => 18 } as never,
            taxAmount: { toNumber: () => 18 } as never,
            taxCode: "A",
            product: {
              name: "Router",
              sku: "RTR-001",
              itemCode: "RW1NTXU0000001",
              itemClassCode: "5059690800",
              packageUnitCode: "BX",
              quantityUnitCode: "EA",
              barcode: "1234567890123",
              category: "5059690800",
            },
          },
        ],
      },
      {
        TIN: "999991130",
        ebmDeviceId: "dvcv1130",
        ebmSerialNo: "serial-1",
        name: "Excledge Test",
        address: "KG 1 Ave",
      }
    );

    expect(payload).toMatchObject({
      tin: "999991130",
      bhfId: "12",
      invcNo: 42,
      salesTyCd: "N",
      rcptTyCd: "S",
      pmtTyCd: "06",
      salesSttsCd: "02",
      custTin: "100600570",
      prcOrdCd: "PO-7788",
      taxblAmtB: 100,
      taxAmtB: 18,
      totTaxblAmt: 100,
      totTaxAmt: 18,
      totAmt: 118,
      receipt: {
        custTin: "100600570",
        custMblNo: "0788000000",
        rptNo: 42,
      },
    });

    expect(payload.itemList[0]).toMatchObject({
      itemSeq: 1,
      itemClsCd: "5059690800",
      itemCd: "RW1NTXU0000001",
      pkgUnitCd: "BX",
      qtyUnitCd: "EA",
      qty: 2,
      taxblAmt: 100,
      taxTyCd: "B",
    });
  });

  it("rejects fiscalization when the branch has no configured BHF ID", () => {
    expect(() =>
      buildSaleGatewayPayload(
        {
          id: 42,
          saleNumber: "SALE-42",
          invoiceNumber: "INV-1130-2026-000042",
          purchaseOrderCode: "PO-7788",
          status: "PENDING",
          createdAt: new Date("2026-04-10T08:09:10Z"),
          paymentType: "MOBILE_MONEY",
          cashAmount: { toNumber: () => 0 } as never,
          debtAmount: { toNumber: () => 0 } as never,
          insuranceAmount: { toNumber: () => 0 } as never,
          totalAmount: { toNumber: () => 118 } as never,
          taxableAmount: { toNumber: () => 100 } as never,
          vatAmount: { toNumber: () => 18 } as never,
          branchId: 7,
          branch: {
            id: 7,
            name: "Kigali Branch",
            code: "KIGALI-01",
            bhfId: null,
            address: "KN 1 Ave",
          },
          customer: {
            name: "Acme Ltd",
            phone: "0788000000",
            TIN: "100600570",
            customerType: "CORPORATE",
            email: "finance@acme.test",
          },
          user: {
            id: 9,
            name: "Verifier",
          },
          saleItems: [
            {
              productId: 3,
              quantity: 2,
              unitPrice: { toNumber: () => 59 } as never,
              totalPrice: { toNumber: () => 118 } as never,
              taxRate: { toNumber: () => 18 } as never,
              taxAmount: { toNumber: () => 18 } as never,
              taxCode: "A",
              product: {
                name: "Router",
                sku: "RTR-001",
                itemCode: "RW1NTXU0000001",
                itemClassCode: "5059690800",
                packageUnitCode: "BX",
                quantityUnitCode: "EA",
                barcode: "1234567890123",
                category: "5059690800",
              },
            },
          ],
        },
        {
          TIN: "999991130",
          ebmDeviceId: "dvcv1130",
          ebmSerialNo: "serial-1",
          name: "Excledge Test",
          address: "KG 1 Ave",
        }
      )
    ).toThrow(/VSDC master data: branch "Kigali Branch" \(KIGALI-01\) is missing its VSDC BHF ID/);
  });

  it("rejects fiscalization when a product is missing required VSDC codes", () => {
    expect(() =>
      buildSaleGatewayPayload(
        {
          id: 42,
          saleNumber: "SALE-42",
          invoiceNumber: "INV-1130-2026-000042",
          purchaseOrderCode: "PO-7788",
          status: "PENDING",
          createdAt: new Date("2026-04-10T08:09:10Z"),
          paymentType: "MOBILE_MONEY",
          cashAmount: { toNumber: () => 0 } as never,
          debtAmount: { toNumber: () => 0 } as never,
          insuranceAmount: { toNumber: () => 0 } as never,
          totalAmount: { toNumber: () => 118 } as never,
          taxableAmount: { toNumber: () => 100 } as never,
          vatAmount: { toNumber: () => 18 } as never,
          branchId: 7,
          branch: {
            id: 7,
            name: "Kigali Branch",
            code: "KIGALI-01",
            bhfId: "12",
            address: "KN 1 Ave",
          },
          customer: {
            name: "Acme Ltd",
            phone: "0788000000",
            TIN: "100600570",
            customerType: "CORPORATE",
            email: "finance@acme.test",
          },
          user: {
            id: 9,
            name: "Verifier",
          },
          saleItems: [
            {
              productId: 3,
              quantity: 2,
              unitPrice: { toNumber: () => 59 } as never,
              totalPrice: { toNumber: () => 118 } as never,
              taxRate: { toNumber: () => 18 } as never,
              taxAmount: { toNumber: () => 18 } as never,
              taxCode: "A",
              product: {
                name: "Router",
                sku: "RTR-001",
                itemCode: null,
                itemClassCode: "5059690800",
                packageUnitCode: "BX",
                quantityUnitCode: "EA",
                barcode: "1234567890123",
                category: "5059690800",
              },
            },
          ],
        },
        {
          TIN: "999991130",
          ebmDeviceId: "dvcv1130",
          ebmSerialNo: "serial-1",
          name: "Excledge Test",
          address: "KG 1 Ave",
        }
      )
    ).toThrow(/VSDC master data: product "Router" is missing its VSDC item code/);
  });

  it("maps a refund into the official correction payload model", () => {
    const originalSale = {
      id: 42,
      saleNumber: "SALE-42",
      invoiceNumber: "INV-1130-2026-000042",
      purchaseOrderCode: "PO-7788",
      status: "COMPLETED",
      createdAt: new Date("2026-04-10T08:09:10Z"),
      paymentType: "MOBILE_MONEY",
      cashAmount: { toNumber: () => 0 } as never,
      debtAmount: { toNumber: () => 0 } as never,
      insuranceAmount: { toNumber: () => 0 } as never,
      totalAmount: { toNumber: () => 118 } as never,
      taxableAmount: { toNumber: () => 100 } as never,
      vatAmount: { toNumber: () => 18 } as never,
      branchId: 7,
      branch: {
        id: 7,
        name: "Kigali Branch",
        code: "KIGALI-01",
        bhfId: "12",
        address: "KN 1 Ave",
      },
      customer: {
        name: "Acme Ltd",
        phone: "0788000000",
        TIN: "100600570",
        customerType: "CORPORATE",
        email: "finance@acme.test",
      },
      user: {
        id: 9,
        name: "Verifier",
      },
      saleItems: [
        {
          productId: 3,
          quantity: 2,
          unitPrice: { toNumber: () => 59 } as never,
          totalPrice: { toNumber: () => 118 } as never,
          taxRate: { toNumber: () => 18 } as never,
          taxAmount: { toNumber: () => 18 } as never,
          taxCode: "A",
          product: {
            name: "Router",
            sku: "RTR-001",
            itemCode: "RW1NTXU0000001",
            itemClassCode: "5059690800",
            packageUnitCode: "BX",
            quantityUnitCode: "EA",
            barcode: "1234567890123",
            category: "5059690800",
          },
        },
      ],
    };

    const payload = buildRefundGatewayPayload({
      originalSale,
      refundInvoiceNumber: "INV-1130-2026-000143",
      refundedAt: new Date("2026-04-11T09:10:11Z"),
      reason: "Wrong customer TIN",
      org: {
        TIN: "999991130",
        ebmDeviceId: "dvcv1130",
        ebmSerialNo: "serial-1",
        name: "Excledge Test",
        address: "KG 1 Ave",
      },
    });

    expect(payload).toMatchObject({
      invcNo: 143,
      orgInvcNo: 42,
      rcptTyCd: "R",
      salesSttsCd: "05",
      rfdDt: "20260411111011",
      rfdRsnCd: "07",
      cnclReqDt: null,
      cnclDt: null,
      totAmt: 118,
    });
  });

  it("maps a cancellation into the official VSDC status payload", () => {
    const payload = buildCancelGatewayPayload({
      originalSale: {
        id: 42,
        saleNumber: "SALE-42",
        invoiceNumber: "INV-1130-2026-000042",
        purchaseOrderCode: "PO-7788",
        status: "COMPLETED",
        createdAt: new Date("2026-04-10T08:09:10Z"),
        paymentType: "CASH",
        cashAmount: { toNumber: () => 118 } as never,
        debtAmount: { toNumber: () => 0 } as never,
        insuranceAmount: { toNumber: () => 0 } as never,
        totalAmount: { toNumber: () => 118 } as never,
        taxableAmount: { toNumber: () => 100 } as never,
        vatAmount: { toNumber: () => 18 } as never,
        branchId: 7,
        branch: {
          id: 7,
          name: "Kigali Branch",
          code: "KIGALI-01",
          bhfId: "12",
          address: "KN 1 Ave",
        },
        customer: {
          name: "Acme Ltd",
          phone: "0788000000",
          TIN: "100600570",
          customerType: "CORPORATE",
          email: "finance@acme.test",
        },
        user: {
          id: 9,
          name: "Verifier",
        },
        saleItems: [
          {
            productId: 3,
            quantity: 2,
            unitPrice: { toNumber: () => 59 } as never,
            totalPrice: { toNumber: () => 118 } as never,
            taxRate: { toNumber: () => 18 } as never,
            taxAmount: { toNumber: () => 18 } as never,
            taxCode: "A",
            product: {
              name: "Router",
              sku: "RTR-001",
              itemCode: "RW1NTXU0000001",
              itemClassCode: "5059690800",
              packageUnitCode: "BX",
              quantityUnitCode: "EA",
              barcode: "1234567890123",
              category: "5059690800",
            },
          },
        ],
      },
      cancelInvoiceNumber: "INV-1130-2026-000144",
      cancelledAt: new Date("2026-04-11T10:11:12Z"),
      reason: "Customer requested cancellation",
      org: {
        TIN: "999991130",
        ebmDeviceId: "dvcv1130",
        ebmSerialNo: "serial-1",
        name: "Excledge Test",
        address: "KG 1 Ave",
      },
    });

    expect(payload).toMatchObject({
      invcNo: 144,
      orgInvcNo: 42,
      rcptTyCd: "S",
      salesSttsCd: "04",
      cnclReqDt: "20260411121112",
      cnclDt: "20260411121112",
      rfdDt: null,
      rfdRsnCd: null,
      totAmt: 118,
    });
  });

  it("parses official VSDC response fields and derives the QR payload", () => {
    const parsed = parseGatewayResponse({
      resultCd: "000",
      resultMsg: "It is succeeded",
      data: {
        rcptNo: 27,
        intrlData: "GZGGIZLYTJSSD7YLYLGIIG6FCY",
        rcptSign: "TQZMKL57AGBMSTPO",
        totRcptNo: 32,
        vsdcRcptPbctDate: "20211027162114",
        sdcId: "SDC010000005",
        mrcNo: "WIS01006230",
      },
    });

    expect(parsed).toMatchObject({
      ebmInvoiceNumber: "27",
      receiptNumber: "27",
      totalReceiptNumber: "32",
      internalData: "GZGGIZLYTJSSD7YLYLGIIG6FCY",
      receiptSignature: "TQZMKL57AGBMSTPO",
      sdcDateTime: "20211027162114",
      sdcId: "SDC010000005",
      mrcNo: "WIS01006230",
      resultCode: "000",
      resultMessage: "It is succeeded",
    });

    expect(parsed.receiptQrPayload).toBe(
      "20211027162114#SDC010000005#27#GZGGIZLYTJSSD7YLYLGIIG6FCY#TQZMKL57AGBMSTPO"
    );
  });

  it("builds the organization reference-sync payload from configured VSDC identifiers", () => {
    const payload = buildVsdcReferencePayload({
      organization: {
        id: 99,
        name: "Excledge Test",
        TIN: "999991130",
        ebmDeviceId: "device-42",
        ebmSerialNo: "serial-42",
      },
      branchContext: {
        bhfId: "12",
      },
      target: "CODE_TABLES",
      lastSyncedAt: new Date("2026-04-10T08:09:10Z"),
    });

    expect(payload).toMatchObject({
      tin: "999991130",
      bhfId: "12",
      dvcId: "device-42",
      dvcSrlNo: "serial-42",
      lastReqDt: "20260410100910",
    });
  });

  it("summarizes synced code-table responses into counts and preview labels", () => {
    const summary = summarizeVsdcSyncResponse(
      "CODE_TABLES",
      {
        resultCd: "000",
        resultMsg: "Success",
        data: {
          codes: [
            { cdCls: "TAX_TYPE", cd: "B", cdNm: "VAT 18%" },
            { cdCls: "QTY_UNIT", cd: "EA", cdNm: "Each" },
            { cdCls: "PKG_UNIT", cd: "BX", cdNm: "Box" },
          ],
        },
      },
      {
        resultCode: "000",
        resultMessage: "Success",
      }
    );

    expect(summary).toMatchObject({
      itemCount: 3,
      groupCount: 3,
      resultCode: "000",
      resultMessage: "Success",
    });
    expect(summary.preview).toContain("TAX_TYPE: VAT 18%");
    expect(summary.preview).toContain("QTY_UNIT: Each");
  });

  it("builds a stock branch and item master payload from active inventory master data", () => {
    const branchPayload = buildVsdcBranchMasterPayload({
      organization: {
        id: 99,
        name: "Excledge Test",
        TIN: "999991130",
        ebmDeviceId: "device-42",
        ebmSerialNo: "serial-42",
      },
      branchContext: {
        bhfId: "12",
      },
      branches: [
        {
          id: 7,
          name: "Kigali Branch",
          code: "KGL-01",
          bhfId: "12",
          status: "ACTIVE",
        },
      ],
    });

    const itemPayload = buildVsdcItemMasterPayload({
      organization: {
        id: 99,
        name: "Excledge Test",
        TIN: "999991130",
        ebmDeviceId: "device-42",
        ebmSerialNo: "serial-42",
      },
      branchContext: {
        bhfId: "12",
      },
      products: [
        {
          id: 5,
          name: "Router",
          sku: "RTR-001",
          barcode: "1234567890123",
          category: "Networking",
          unitPrice: { toNumber: () => 25000 } as never,
          itemCode: "RW1NTXU0000001",
          itemClassCode: "5059690800",
          packageUnitCode: "BX",
          quantityUnitCode: "EA",
        },
      ],
    });

    expect(branchPayload).toMatchObject({
      tin: "999991130",
      branchList: [
        {
          bhfId: "12",
          bhfNm: "Kigali Branch",
          bhfCd: "KGL-01",
        },
      ],
    });

    expect(itemPayload).toMatchObject({
      tin: "999991130",
      itemList: [
        {
          itemCd: "RW1NTXU0000001",
          itemClsCd: "5059690800",
          pkgUnitCd: "BX",
          qtyUnitCd: "EA",
          stdPrc: 25000,
        },
      ],
    });
  });

  it("builds delta stock-movement payloads from ledger-style rows", () => {
    const payload = buildVsdcStockMovementPayload({
      organization: {
        id: 99,
        name: "Excledge Test",
        TIN: "999991130",
        ebmDeviceId: "device-42",
        ebmSerialNo: "serial-42",
      },
      branchContext: {
        bhfId: "12",
      },
      lastSyncedAt: new Date("2026-04-10T08:09:10Z"),
      movements: [
        {
          id: 81,
          branchId: 7,
          productId: 5,
          movementType: "SALE",
          direction: "OUT",
          quantity: 2,
          runningBalance: 14,
          reference: "SALE-42",
          referenceType: "SALE",
          batchNumber: "BATCH-01",
          note: "Sold at POS",
          createdAt: new Date("2026-04-11T10:11:12Z"),
        },
      ],
      branchesById: new Map([
        [7, { id: 7, name: "Kigali Branch", code: "KGL-01", bhfId: "12", status: "ACTIVE" }],
      ]),
      productsById: new Map([
        [5, {
          id: 5,
          name: "Router",
          sku: "RTR-001",
          barcode: "1234567890123",
          category: "Networking",
          unitPrice: { toNumber: () => 25000 } as never,
          itemCode: "RW1NTXU0000001",
          itemClassCode: "5059690800",
          packageUnitCode: "BX",
          quantityUnitCode: "EA",
        }],
      ]),
    });

    expect(payload).toMatchObject({
      tin: "999991130",
      lastReqDt: "20260410100910",
      stockIoList: [
        {
          bhfId: "12",
          itemCd: "RW1NTXU0000001",
          mvmtTy: "SALE",
          ioTy: "OUT",
          qty: 2,
          rsdQty: 14,
          refNo: "SALE-42",
        },
      ],
    });
  });
});
