import { describe, it, expect } from "vitest";
import {
  componentKey,
  computeItemRecipeCost,
  sanitizeItemRecipe,
} from "@/lib/itemRecipes";
import type { CostingMaterial } from "@/lib/productionItems";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// dal: ₹120/kg over 1000 gm -> ₹0.12/gm
// base: a production item, ₹61/kg over 1000 gm -> ₹0.061/gm
const COMPONENTS = new Map<string, CostingMaterial>([
  ["raw:dal", { pricePerPurchaseUnit: 120, unitConversion: 1000 }],
  ["production:base", { pricePerPurchaseUnit: 61, unitConversion: 1000 }],
]);

describe("componentKey", () => {
  it("keeps a raw material and a production item of the same id apart", () => {
    expect(componentKey("raw", "abc")).not.toBe(componentKey("production", "abc"));
  });
});

describe("computeItemRecipeCost", () => {
  const lines = [
    { refType: "raw" as const, refId: "dal", qtyUsed: 100 }, // 100 × 0.12 = ₹12
    { refType: "production" as const, refId: "base", qtyUsed: 200 }, // 200 × 0.061 = ₹12.20
  ];

  it("costs raw materials and production items with the same formula", () => {
    const { lines: costed } = computeItemRecipeCost(lines, COMPONENTS);
    expect(costed[0].cost).toBeCloseTo(12);
    expect(costed[1].unitCost).toBeCloseTo(0.061);
    expect(costed[1].cost).toBeCloseTo(12.2);
  });

  it("totals the lines and rounds to paise", () => {
    expect(computeItemRecipeCost(lines, COMPONENTS).totalCost).toBe(24.2);
  });

  it("reports each line's share", () => {
    const { lines: costed } = computeItemRecipeCost(lines, COMPONENTS);
    expect(costed[0].share + costed[1].share).toBeCloseTo(1);
  });

  it("gives a zero share rather than NaN when nothing costs anything", () => {
    const free = new Map<string, CostingMaterial>([
      ["raw:x", { pricePerPurchaseUnit: 0, unitConversion: 1000 }],
    ]);
    const { lines: costed, totalCost } = computeItemRecipeCost(
      [{ refType: "raw", refId: "x", qtyUsed: 5 }],
      free,
    );
    expect(totalCost).toBe(0);
    expect(costed[0].share).toBe(0);
  });

  it("costs a missing component as zero and flags it", () => {
    const { lines: costed, totalCost } = computeItemRecipeCost(
      [{ refType: "raw", refId: "ghost", qtyUsed: 100 }],
      COMPONENTS,
    );
    expect(costed[0].found).toBe(false);
    expect(totalCost).toBe(0);
  });

  it("does not cost a production item as if it were a raw material", () => {
    // Same id, wrong type -> not found, rather than silently borrowing the
    // other collection's price.
    const { lines: costed } = computeItemRecipeCost(
      [{ refType: "raw", refId: "base", qtyUsed: 100 }],
      COMPONENTS,
    );
    expect(costed[0].found).toBe(false);
  });

  it("treats a NaN quantity as zero", () => {
    const { totalCost } = computeItemRecipeCost(
      [
        { refType: "raw", refId: "dal", qtyUsed: Number.NaN },
        { refType: "production", refId: "base", qtyUsed: 200 },
      ],
      COMPONENTS,
    );
    expect(totalCost).toBeCloseTo(12.2);
  });

  it("handles an empty recipe", () => {
    expect(computeItemRecipeCost([], COMPONENTS).totalCost).toBe(0);
  });
});

describe("sanitizeItemRecipe", () => {
  const input = (overrides: Record<string, unknown> = {}) => ({
    name: "Dal Thali",
    lines: [
      { refType: "raw", refId: "dal", qtyUsed: 100 },
      { refType: "production", refId: "base", qtyUsed: 200 },
    ],
    ...overrides,
  });

  const sanitize = (o: Record<string, unknown> = {}) =>
    sanitizeItemRecipe(input(o), COMPONENTS, normalizeMaterialName);

  it("accepts a valid recipe and derives the cost", () => {
    const { doc, error } = sanitize();
    expect(error).toBeUndefined();
    expect(doc?.totalCost).toBe(24.2);
    expect(doc?.nameKey).toBe("dal thali");
  });

  it("normalizes the name", () => {
    expect(sanitize({ name: "  Dal   Thali " }).doc?.name).toBe("Dal Thali");
  });

  it("rejects a blank name", () => {
    expect(sanitize({ name: "  " }).error).toBe("Name is required");
  });

  it("requires at least one component", () => {
    expect(sanitize({ lines: [] }).error).toBe("Add at least one component");
    expect(sanitize({ lines: undefined }).error).toBe(
      "Add at least one component",
    );
  });

  it("rejects an unknown component type", () => {
    expect(
      sanitize({ lines: [{ refType: "nonsense", refId: "dal", qtyUsed: 1 }] })
        .error,
    ).toBe("A component row has an unknown type");
  });

  it("names the right collection when a reference is missing", () => {
    expect(
      sanitize({ lines: [{ refType: "raw", refId: "ghost", qtyUsed: 1 }] }).error,
    ).toBe("Unknown raw material in recipe");
    expect(
      sanitize({ lines: [{ refType: "production", refId: "ghost", qtyUsed: 1 }] })
        .error,
    ).toBe("Unknown production item in recipe");
  });

  it("rejects the same component twice", () => {
    expect(
      sanitize({
        lines: [
          { refType: "raw", refId: "dal", qtyUsed: 1 },
          { refType: "raw", refId: "dal", qtyUsed: 2 },
        ],
      }).error,
    ).toBe("The same component is listed twice");
  });

  it("allows a raw material and a production item sharing an id", () => {
    const components = new Map<string, CostingMaterial>([
      ["raw:same", { pricePerPurchaseUnit: 10, unitConversion: 10 }],
      ["production:same", { pricePerPurchaseUnit: 20, unitConversion: 10 }],
    ]);
    const { error } = sanitizeItemRecipe(
      {
        name: "Mixed",
        lines: [
          { refType: "raw", refId: "same", qtyUsed: 1 },
          { refType: "production", refId: "same", qtyUsed: 1 },
        ],
      },
      components,
      normalizeMaterialName,
    );
    expect(error).toBeUndefined();
  });

  it.each([
    [0, "Quantities must be greater than 0"],
    [-2, "Quantities must be greater than 0"],
  ])("rejects a qty of %s", (qty, expected) => {
    expect(
      sanitize({ lines: [{ refType: "raw", refId: "dal", qtyUsed: qty }] }).error,
    ).toBe(expected);
  });

  it("rejects a missing quantity", () => {
    expect(sanitize({ lines: [{ refType: "raw", refId: "dal" }] }).error).toBe(
      "Every component row needs a quantity",
    );
  });
});
