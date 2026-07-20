import { describe, it, expect } from "vitest";
import { SOCIETIES } from "./societies";
import {
  sanitizeDiscountMap,
  discountPercentFor,
  computeSocietyDiscount,
} from "./societyDiscounts";

const KNOWN = SOCIETIES[0].id;
const OTHER = SOCIETIES[1]?.id ?? "zomato-office-sector-62";

describe("sanitizeDiscountMap", () => {
  it("keeps known ids with valid integer percentages", () => {
    expect(sanitizeDiscountMap({ [KNOWN]: 10 })).toEqual({ [KNOWN]: 10 });
  });

  it("drops unknown society ids", () => {
    expect(sanitizeDiscountMap({ "not-a-society": 20 })).toEqual({});
  });

  it("drops zero and negative percentages", () => {
    expect(sanitizeDiscountMap({ [KNOWN]: 0, [OTHER]: -5 })).toEqual({});
  });

  it("rounds and clamps to 100", () => {
    expect(sanitizeDiscountMap({ [KNOWN]: 12.6, [OTHER]: 250 })).toEqual({
      [KNOWN]: 13,
      [OTHER]: 100,
    });
  });

  it("returns an empty map for non-object input", () => {
    expect(sanitizeDiscountMap(null)).toEqual({});
    expect(sanitizeDiscountMap("nope")).toEqual({});
  });
});

describe("discountPercentFor", () => {
  it("returns the percentage for a society", () => {
    expect(discountPercentFor({ [KNOWN]: 15 }, KNOWN)).toBe(15);
  });

  it("returns 0 when absent, unknown, or nullish", () => {
    expect(discountPercentFor({ [KNOWN]: 15 }, OTHER)).toBe(0);
    expect(discountPercentFor({}, KNOWN)).toBe(0);
    expect(discountPercentFor(null, KNOWN)).toBe(0);
    expect(discountPercentFor({ [KNOWN]: 15 }, null)).toBe(0);
  });
});

describe("computeSocietyDiscount", () => {
  it("computes a rounded percentage of the subtotal", () => {
    expect(computeSocietyDiscount(500, 10)).toBe(50);
    expect(computeSocietyDiscount(499, 10)).toBe(50); // 49.9 → 50
  });

  it("is 0 for non-positive percent or subtotal", () => {
    expect(computeSocietyDiscount(500, 0)).toBe(0);
    expect(computeSocietyDiscount(0, 10)).toBe(0);
    expect(computeSocietyDiscount(-100, 10)).toBe(0);
  });
});
