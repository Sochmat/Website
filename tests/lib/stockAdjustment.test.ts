import { describe, it, expect } from "vitest";
import { parseStockQty } from "@/lib/stockAdjustment";

describe("parseStockQty", () => {
  it("accepts a plain number", () => {
    expect(parseStockQty(250)).toEqual({ value: 250 });
  });

  it("accepts zero — 'we have none' is a real quantity", () => {
    // Distinct from the field being absent, which means "never counted".
    expect(parseStockQty(0)).toEqual({ value: 0 });
  });

  it("accepts decimals", () => {
    expect(parseStockQty(12.5)).toEqual({ value: 12.5 });
  });

  it("parses numeric strings with commas and padding", () => {
    expect(parseStockQty("1,000")).toEqual({ value: 1000 });
    expect(parseStockQty(" 12.5 ")).toEqual({ value: 12.5 });
  });

  it.each([
    ["a blank string", "   ", "Quantity is required"],
    ["undefined", undefined, "Quantity is required"],
    ["null", null, "Quantity is required"],
    ["an object", {}, "Quantity is required"],
    ["junk text", "abc", "Quantity must be a number"],
    ["Infinity", Infinity, "Quantity must be a number"],
    ["NaN", NaN, "Quantity must be a number"],
    ["a negative number", -1, "Quantity cannot be negative"],
    ["a negative string", "-5", "Quantity cannot be negative"],
  ])("rejects %s", (_label, input, expected) => {
    const { value, error } = parseStockQty(input);
    expect(value).toBeUndefined();
    expect(error).toBe(expected);
  });
});
