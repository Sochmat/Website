import { describe, it, expect } from "vitest";
import {
  sanitizeCouponSocietyIds,
  couponAppliesToSociety,
  describeCouponScope,
} from "./couponScope";
import { SOCIETIES } from "./societies";

const PIVOTAL = "pivotal-paradise-sector-62";
const ZOMATO = "zomato-office-sector-62";

describe("sanitizeCouponSocietyIds", () => {
  it("keeps known ids in SOCIETIES order, de-duplicated", () => {
    expect(sanitizeCouponSocietyIds([ZOMATO, PIVOTAL, ZOMATO])).toEqual([
      PIVOTAL,
      ZOMATO,
    ]);
  });

  it("drops unknown ids and non-strings", () => {
    expect(sanitizeCouponSocietyIds([ZOMATO, "nope", 7, null])).toEqual([
      ZOMATO,
    ]);
  });

  it("stores 'every location' as an empty list", () => {
    expect(sanitizeCouponSocietyIds(SOCIETIES.map((s) => s.id))).toEqual([]);
    expect(sanitizeCouponSocietyIds([])).toEqual([]);
    expect(sanitizeCouponSocietyIds(undefined)).toEqual([]);
  });
});

describe("couponAppliesToSociety", () => {
  it("runs everywhere when unscoped", () => {
    expect(couponAppliesToSociety([], PIVOTAL)).toBe(true);
    expect(couponAppliesToSociety(undefined, ZOMATO)).toBe(true);
    expect(couponAppliesToSociety(undefined, undefined)).toBe(true);
  });

  it("runs only at its own locations when scoped", () => {
    expect(couponAppliesToSociety([ZOMATO], ZOMATO)).toBe(true);
    expect(couponAppliesToSociety([ZOMATO], PIVOTAL)).toBe(false);
    expect(couponAppliesToSociety([ZOMATO], undefined)).toBe(false);
  });

  it("fails closed for a location that no longer exists", () => {
    expect(couponAppliesToSociety(["removed-society"], PIVOTAL)).toBe(false);
  });
});

describe("describeCouponScope", () => {
  it("labels an unscoped coupon", () => {
    expect(describeCouponScope([])).toBe("All locations");
  });

  it("names the scoped locations", () => {
    expect(describeCouponScope([PIVOTAL, ZOMATO])).toBe(
      "Pivotal Paradise, Zomato office",
    );
  });
});
