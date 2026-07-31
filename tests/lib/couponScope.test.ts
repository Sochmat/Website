import { describe, it, expect } from "vitest";
import {
  sanitizeCouponSocietyIds,
  couponAppliesToSociety,
  describeCouponScope,
} from "@/lib/couponScope";
import { SOCIETIES } from "@/lib/societies";

const PIVOTAL = "pivotal-paradise-sector-62";
const ZOMATO = "zomato-office-sector-62";

describe("sanitizeCouponSocietyIds", () => {
  it("de-duplicates a repeated id", () => {
    expect(sanitizeCouponSocietyIds([ZOMATO, ZOMATO])).toEqual([ZOMATO]);
  });

  // The SOCIETIES-order branch only runs for a PROPER subset, and SOCIETIES
  // currently holds two locations — so every multi-id selection is "all
  // locations" and collapses to [] by design. Ordering therefore cannot be
  // exercised today; it starts mattering the moment a third location exists.
  // Do not "fix" a future failure here by weakening the collapse rule: it is
  // what keeps an all-locations coupon working when a location is added.
  it.skip("keeps a proper subset in SOCIETIES order", () => {
    expect(sanitizeCouponSocietyIds([ZOMATO, PIVOTAL])).toEqual([
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
