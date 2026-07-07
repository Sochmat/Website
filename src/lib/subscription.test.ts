import { describe, it, expect } from "vitest";
import {
  isSubscriptionHost,
  isEligible,
  buildWeekDates,
  computePlanTotals,
  generatePlanNumber,
  GST_RATE,
  type PlanItem,
} from "./subscription";

describe("isSubscriptionHost", () => {
  it("matches the subscription subdomain, ignoring port and case", () => {
    expect(isSubscriptionHost("subscription.sochmat.com")).toBe(true);
    expect(isSubscriptionHost("Subscription.sochmat.com:443")).toBe(true);
    expect(isSubscriptionHost("localhost:3000")).toBe(false);
    expect(isSubscriptionHost("sochmat.com")).toBe(false);
    expect(isSubscriptionHost(null)).toBe(false);
    expect(isSubscriptionHost(undefined)).toBe(false);
  });
});

describe("isEligible", () => {
  it("requires the flag AND a positive subscriptionPrice", () => {
    expect(isEligible({ isAvailableForSubscription: true, subscriptionPrice: 120 })).toBe(true);
    expect(isEligible({ isAvailableForSubscription: true, subscriptionPrice: 0 })).toBe(false);
    expect(isEligible({ isAvailableForSubscription: false, subscriptionPrice: 120 })).toBe(false);
    expect(isEligible({})).toBe(false);
  });
});

describe("buildWeekDates", () => {
  it("returns 7 consecutive dates with weekday labels", () => {
    const week = buildWeekDates("2026-07-07"); // a Tuesday (UTC)
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ date: "2026-07-07", weekday: "Tuesday" });
    expect(week[1].date).toBe("2026-07-08");
    expect(week[6].date).toBe("2026-07-13");
  });
});

describe("computePlanTotals", () => {
  const items = new Map<string, PlanItem>([
    ["a", { name: "Paneer Bowl", protein: 30, kcal: 400, subscriptionPrice: 100, isAvailableForSubscription: true }],
    ["b", { name: "Egg Bowl", protein: 25, kcal: 350, subscriptionPrice: 80, isAvailableForSubscription: true }],
    ["bad", { name: "Not Eligible", protein: 10, kcal: 100, subscriptionPrice: 0, isAvailableForSubscription: true }],
  ]);

  it("sums price/protein/kcal, rounds 5% GST, and snapshots item fields", () => {
    const totals = computePlanTotals(
      [
        { date: "2026-07-07", weekday: "Tuesday", productId: "a" },
        { date: "2026-07-08", weekday: "Wednesday", productId: "b" },
      ],
      items,
    );
    expect(totals.itemCount).toBe(2);
    expect(totals.subtotal).toBe(180);
    expect(totals.totalProtein).toBe(55);
    expect(totals.totalKcal).toBe(750);
    expect(totals.tax).toBe(Math.round(180 * GST_RATE)); // 9
    expect(totals.totalAmount).toBe(189);
    expect(totals.days[0].itemName).toBe("Paneer Bowl");
    expect(totals.days[0].subscriptionPrice).toBe(100);
  });

  it("throws when a day references an ineligible or unknown item", () => {
    expect(() =>
      computePlanTotals([{ date: "2026-07-07", weekday: "Tuesday", productId: "bad" }], items),
    ).toThrow();
    expect(() =>
      computePlanTotals([{ date: "2026-07-07", weekday: "Tuesday", productId: "missing" }], items),
    ).toThrow();
  });
});

describe("generatePlanNumber", () => {
  it("produces a SUBP-prefixed code", () => {
    expect(generatePlanNumber()).toMatch(/^SUBP-[A-Z0-9]+-[A-Z0-9]+$/);
  });
});
