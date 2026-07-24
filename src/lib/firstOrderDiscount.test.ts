import { describe, it, expect } from "vitest";
import {
  FIRST_ORDER_DISCOUNT_RATE,
  computeFirstOrderDiscount,
  resolveOfferDiscount,
} from "./firstOrderDiscount";

describe("FIRST_ORDER_DISCOUNT_RATE", () => {
  it("is 20%", () => {
    expect(FIRST_ORDER_DISCOUNT_RATE).toBe(0.2);
  });
});

describe("computeFirstOrderDiscount", () => {
  it("is 20% of the subtotal, rounded", () => {
    expect(computeFirstOrderDiscount(500)).toBe(100);
    expect(computeFirstOrderDiscount(499)).toBe(100); // 99.8 → 100
    expect(computeFirstOrderDiscount(105)).toBe(21);
  });

  it("is 0 for a non-positive subtotal", () => {
    expect(computeFirstOrderDiscount(0)).toBe(0);
    expect(computeFirstOrderDiscount(-50)).toBe(0);
  });
});

describe("resolveOfferDiscount", () => {
  it("takes the first-order discount when it is larger", () => {
    expect(resolveOfferDiscount(50, 140)).toEqual({
      offerDiscount: 140,
      firstOrderApplied: true,
    });
  });

  it("takes the coupon when it is larger", () => {
    expect(resolveOfferDiscount(200, 140)).toEqual({
      offerDiscount: 200,
      firstOrderApplied: false,
    });
  });

  it("breaks a tie in favour of the first-order discount", () => {
    expect(resolveOfferDiscount(100, 100)).toEqual({
      offerDiscount: 100,
      firstOrderApplied: true,
    });
  });

  it("uses the coupon when there is no first-order discount", () => {
    expect(resolveOfferDiscount(80, 0)).toEqual({
      offerDiscount: 80,
      firstOrderApplied: false,
    });
  });

  it("is zero/false when neither applies", () => {
    expect(resolveOfferDiscount(0, 0)).toEqual({
      offerDiscount: 0,
      firstOrderApplied: false,
    });
  });

  it("ignores negative inputs", () => {
    expect(resolveOfferDiscount(-10, -5)).toEqual({
      offerDiscount: 0,
      firstOrderApplied: false,
    });
  });
});
