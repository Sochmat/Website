import { describe, it, expect } from "vitest";
import { SOCIETIES } from "@/lib/societies";
import {
  sanitizeDiscountMap,
  discountPercentFor,
  computeSocietyDiscount,
  offerDiscountBase,
} from "@/lib/societyDiscounts";
import { computeCouponDiscount } from "@/lib/couponDisplay";
import { computeFirstOrderDiscount } from "@/lib/firstOrderDiscount";

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

describe("checkout pricing composition", () => {
  // The rule: location discount off the item total first, then the offer
  // (coupon % / first-order 20%) prices off what remains.
  const priceOrder = (subtotal: number, locationPct: number, couponPct: number) => {
    const location = computeSocietyDiscount(subtotal, locationPct);
    const base = offerDiscountBase(subtotal, location);
    const offer = computeCouponDiscount(
      {
        code: "X",
        discountType: "percent",
        discountAmount: 0,
        discountPercent: couponPct,
        maxDiscount: 0,
      },
      base,
    );
    return { location, offer, net: Math.max(0, subtotal - location - offer) };
  };

  it("prices a percentage coupon off the post-location total", () => {
    // ₹500, 10% location → ₹50 off, leaving ₹450. A 20% coupon is 20% of ₹450
    // (₹90), not of ₹500 (₹100). Net ₹360.
    expect(priceOrder(500, 10, 20)).toEqual({ location: 50, offer: 90, net: 360 });
  });

  it("is unchanged when the location has no discount", () => {
    expect(priceOrder(500, 0, 20)).toEqual({ location: 0, offer: 100, net: 400 });
  });

  it("applies the first-order discount to the same base", () => {
    const location = computeSocietyDiscount(500, 10);
    expect(computeFirstOrderDiscount(offerDiscountBase(500, location))).toBe(90);
  });

  it("leaves flat coupons untouched by the location discount", () => {
    const location = computeSocietyDiscount(500, 10);
    const flat = computeCouponDiscount(
      {
        code: "FLAT50",
        discountType: "flat",
        discountAmount: 50,
        discountPercent: 0,
        maxDiscount: 0,
      },
      offerDiscountBase(500, location),
    );
    expect(flat).toBe(50);
  });
});

describe("offerDiscountBase", () => {
  it("takes the location discount off before offers are computed", () => {
    // ₹500 subtotal, 10% location discount → offers price off ₹450, not ₹500.
    expect(offerDiscountBase(500, computeSocietyDiscount(500, 10))).toBe(450);
  });

  it("is the full subtotal when there is no location discount", () => {
    expect(offerDiscountBase(500, 0)).toBe(500);
  });

  it("never goes negative", () => {
    expect(offerDiscountBase(100, 250)).toBe(0);
  });

  it("ignores a negative location discount", () => {
    expect(offerDiscountBase(500, -50)).toBe(500);
  });

  it("is 0 for a non-positive subtotal", () => {
    expect(offerDiscountBase(0, 0)).toBe(0);
    expect(offerDiscountBase(-100, 0)).toBe(0);
  });
});
