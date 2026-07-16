import { describe, it, expect } from "vitest";
import type { SubscriptionBracket, SubscriptionMenuItem } from "./types";
import {
  MEALS_PER_PLAN,
  CREDIT_VALIDITY_DAYS,
  isBracketKey,
  isDiet,
  pricePerMeal,
  computeBracketPlanTotals,
  isItemAllowed,
  filterItemsForPlan,
  toPublicSubscriptionItem,
} from "./subscriptionBrackets";

const bracket = (vegPrice: number, nonVegPrice: number, active = true) =>
  ({ vegPrice, nonVegPrice, active }) as SubscriptionBracket;

describe("constants", () => {
  it("sells 7 meals valid for 30 days", () => {
    expect(MEALS_PER_PLAN).toBe(7);
    expect(CREDIT_VALIDITY_DAYS).toBe(30);
  });
});

describe("isBracketKey", () => {
  it("accepts the three real brackets", () => {
    expect(isBracketKey("25-30")).toBe(true);
    expect(isBracketKey("30-40")).toBe(true);
    expect(isBracketKey("40-50")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isBracketKey("50-60")).toBe(false);
    expect(isBracketKey("")).toBe(false);
    expect(isBracketKey(undefined)).toBe(false);
    expect(isBracketKey(30)).toBe(false);
  });
});

describe("isDiet", () => {
  it("accepts the two diets", () => {
    expect(isDiet("veg")).toBe(true);
    expect(isDiet("veg-nonveg")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDiet("nonveg")).toBe(false);
    expect(isDiet(null)).toBe(false);
  });
});

describe("pricePerMeal", () => {
  it("charges the veg price for a veg-only plan", () => {
    expect(pricePerMeal(bracket(250, 272), "veg")).toBe(250);
  });

  it("charges the non-veg price for a veg+non-veg plan", () => {
    expect(pricePerMeal(bracket(250, 272), "veg-nonveg")).toBe(272);
  });
});

describe("computeBracketPlanTotals", () => {
  // The six real prices from Subscriptions.xlsx.
  it.each([
    ["25-30", "veg", 188, 1316, 66, 1382],
    ["25-30", "veg-nonveg", 198, 1386, 69, 1455],
    ["30-40", "veg", 250, 1750, 88, 1838], // Math.round(87.5) === 88
    ["30-40", "veg-nonveg", 272, 1904, 95, 1999],
    ["40-50", "veg", 300, 2100, 105, 2205],
    ["40-50", "veg-nonveg", 340, 2380, 119, 2499],
  ])("%s %s: ₹%i/meal → %i + %i GST = %i", (_k, diet, per, subtotal, tax, total) => {
    const b = diet === "veg" ? bracket(per as number, 999) : bracket(1, per as number);
    const t = computeBracketPlanTotals(b, diet as "veg" | "veg-nonveg");
    expect(t.pricePerMeal).toBe(per);
    expect(t.mealCount).toBe(7);
    expect(t.subtotal).toBe(subtotal);
    expect(t.tax).toBe(tax);
    expect(t.totalAmount).toBe(total);
  });

  it("honours an explicit mealCount", () => {
    const t = computeBracketPlanTotals(bracket(100, 200), "veg", 3);
    expect(t.subtotal).toBe(300);
    expect(t.tax).toBe(15);
    expect(t.totalAmount).toBe(315);
  });

  it("throws on a non-positive price", () => {
    expect(() => computeBracketPlanTotals(bracket(0, 200), "veg")).toThrow();
    expect(() => computeBracketPlanTotals(bracket(100, -1), "veg-nonveg")).toThrow();
  });

  it("throws on an inactive bracket", () => {
    expect(() => computeBracketPlanTotals(bracket(250, 272, false), "veg")).toThrow();
  });

  it("throws on a non-positive mealCount", () => {
    expect(() => computeBracketPlanTotals(bracket(250, 272), "veg", 0)).toThrow();
  });
});

const item = (over: Partial<SubscriptionMenuItem> = {}) =>
  ({
    bracket: "30-40",
    name: "Paneer Salad Bowl (Large)",
    nameKey: "paneer salad bowl (large)",
    importKey: "paneer salad bowl (large)",
    protein: 32.7,
    kcal: 500,
    image: "",
    isVeg: true,
    referencePrice: 300,
    source: "sheet",
    _id: "abc123",
    ...over,
  }) as SubscriptionMenuItem;

describe("isItemAllowed", () => {
  it("allows a veg item on a veg plan", () => {
    expect(isItemAllowed(item(), "30-40", "veg")).toBe(true);
  });

  it("rejects a non-veg item on a veg plan", () => {
    expect(isItemAllowed(item({ isVeg: false }), "30-40", "veg")).toBe(false);
  });

  it("allows both veg and non-veg on a veg+non-veg plan", () => {
    expect(isItemAllowed(item(), "30-40", "veg-nonveg")).toBe(true);
    expect(isItemAllowed(item({ isVeg: false }), "30-40", "veg-nonveg")).toBe(true);
  });

  it("rejects an item from another bracket", () => {
    expect(isItemAllowed(item({ bracket: "25-30" }), "30-40", "veg")).toBe(false);
    expect(isItemAllowed(item({ bracket: "40-50" }), "30-40", "veg-nonveg")).toBe(false);
  });

  it("rejects a hidden item under either diet", () => {
    expect(isItemAllowed(item({ hidden: true }), "30-40", "veg")).toBe(false);
    expect(isItemAllowed(item({ hidden: true }), "30-40", "veg-nonveg")).toBe(false);
  });
});

describe("filterItemsForPlan", () => {
  it("keeps only the allowed items", () => {
    const items = [
      item({ name: "veg-ok" }),
      item({ name: "nonveg", isVeg: false }),
      item({ name: "other-bracket", bracket: "40-50" }),
      item({ name: "hidden", hidden: true }),
    ];
    expect(filterItemsForPlan(items, "30-40", "veg").map((i) => i.name)).toEqual([
      "veg-ok",
    ]);
    expect(filterItemsForPlan(items, "30-40", "veg-nonveg").map((i) => i.name)).toEqual([
      "veg-ok",
      "nonveg",
    ]);
  });
});

describe("toPublicSubscriptionItem", () => {
  it("exposes only the whitelisted fields (incl. referencePrice) and no other internal field", () => {
    const pub = toPublicSubscriptionItem(item());
    // Asserting the exact key set — a future `...item` spread cannot silently
    // start shipping other internal data to customers without failing here.
    // `referencePrice` is intentionally public (the Zomato comparison price).
    expect(Object.keys(pub).sort()).toEqual(
      [
        "id",
        "bracket",
        "name",
        "description",
        "protein",
        "kcal",
        "fiber",
        "carbs",
        "image",
        "isVeg",
        "ingredients",
        "sortOrder",
        "referencePrice",
      ].sort(),
    );
    expect(pub.referencePrice).toBe(300);
    expect(pub).not.toHaveProperty("nameKey");
    expect(pub).not.toHaveProperty("importKey");
    expect(pub).not.toHaveProperty("source");
    expect(pub).not.toHaveProperty("_id");
    expect(pub).not.toHaveProperty("hidden");
  });

  it("exposes _id as a string `id`", () => {
    expect(toPublicSubscriptionItem(item()).id).toBe("abc123");
  });
});
