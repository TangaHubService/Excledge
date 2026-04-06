import { describe, expect, it } from "vitest";
import { createProductSchema } from "../src/validations/products.validation";

describe("product validation schemas", () => {
  it("applies defaults and accepts the minimal required payload", () => {
    const result = createProductSchema.parse({
      body: {
        name: "widget",
        quantity: 5,
        unitPrice: 12.5,
      },
      params: {
        organizationId: 2,
      },
    });

    expect(result.body.taxCategory).toBe("STANDARD");
    expect(result.body.minStock).toBe(10);
    expect(result.body.name).toBe("widget");
    expect(result.body.quantity).toBe(5);
  });

  it("rejects a payload that tries to set a negative quantity", () => {
    expect(() =>
      createProductSchema.parse({
        body: {
          name: "invalid",
          quantity: -1,
          unitPrice: 10,
        },
        params: {
          organizationId: 2,
        },
      })
    ).toThrow();
  });
});
