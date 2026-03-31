import test from "node:test";
import assert from "node:assert/strict";
import { isNegativeStock, nextStockQuantity } from "../common/stock-rules";

test("purchase increases stock", () => {
  assert.equal(nextStockQuantity(10, 5), 15);
});

test("sale decreases stock", () => {
  assert.equal(nextStockQuantity(10, -3), 7);
});

test("negative stock is blocked", () => {
  assert.equal(isNegativeStock(nextStockQuantity(2, -3)), true);
});

test("adjustment supports positive and negative deltas", () => {
  assert.equal(nextStockQuantity(10, 2), 12);
  assert.equal(nextStockQuantity(10, -2), 8);
});
