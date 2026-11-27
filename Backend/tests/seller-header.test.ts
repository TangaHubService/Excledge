import { describe, expect, it } from "vitest"
import { sellerHeaderLines } from "../src/services/invoice-format.service"
import { buildVsdcTopMsg } from "../src/services/rra-ebm.service"

const org = {
  name: "Excel Edge CPA Ltd",
  address: "KN 3 Rd, Kigali",
  phone: "+250788000000",
  email: "info@example.com",
  TIN: "999945560",
}

describe("seller header = VSDC topMsg", () => {
  it("prints every topMsg line on the invoice, in the same order", () => {
    const lines = sellerHeaderLines({ ...org, tin: org.TIN })
    expect(lines).toEqual([
      "Excel Edge CPA Ltd",
      "KN 3 Rd, Kigali",
      "TEL: +250788000000",
      "EMAIL: info@example.com",
      "TIN: 999945560",
    ])
    expect(buildVsdcTopMsg(org).split("\n")).toEqual(lines)
  })
  it("skips details that are not filled in", () => {
    expect(sellerHeaderLines({ name: "Shop", address: "", phone: null, email: " ", tin: "1" })).toEqual(["Shop", "TIN: 1"])
  })
  it("folds line breaks inside a value into one line", () => {
    expect(sellerHeaderLines({ name: "Shop", address: "KN 3 Rd\nKigali" })).toEqual(["Shop", "KN 3 Rd Kigali"])
  })
})
