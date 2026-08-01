import { describe, it, expect } from "vitest";
import {
  componentKey,
  computeItemRecipeCost,
  itemRecipeCostsById,
  itemRecipeDependencies,
  sanitizeItemRecipe,
  type ItemRecipe,
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

// ---------------------------------------------------------------------------
// Food items as components
// ---------------------------------------------------------------------------

describe("itemRecipeDependencies", () => {
  const linesById = new Map([
    ["combo", [{ refType: "item" as const, refId: "thali", qtyUsed: 1 }]],
    ["thali", [{ refType: "item" as const, refId: "rice", qtyUsed: 1 }]],
    ["rice", [{ refType: "raw" as const, refId: "dal", qtyUsed: 10 }]],
  ]);

  it("reaches every recipe below, not just the ones named directly", () => {
    expect([...itemRecipeDependencies("combo", linesById)].sort()).toEqual([
      "rice",
      "thali",
    ]);
  });

  it("does not include the recipe it started from", () => {
    expect(itemRecipeDependencies("combo", linesById).has("combo")).toBe(false);
  });

  it("terminates on a graph that already loops", () => {
    const looped = new Map([
      ["a", [{ refType: "item" as const, refId: "b", qtyUsed: 1 }]],
      ["b", [{ refType: "item" as const, refId: "a", qtyUsed: 1 }]],
    ]);
    expect(itemRecipeDependencies("a", looped).has("a")).toBe(true);
  });
});

describe("itemRecipeCostsById", () => {
  // thali: 100 gm dal = ₹12
  const thali: ItemRecipe = {
    _id: "thali",
    name: "Thali",
    nameKey: "thali",
    lines: [{ refType: "raw", refId: "dal", qtyUsed: 100 }],
    totalCost: 0,
  };
  // combo: 2 thali (₹24) + 200 gm base (₹12.20) = ₹36.20
  const combo: ItemRecipe = {
    _id: "combo",
    name: "Combo",
    nameKey: "combo",
    lines: [
      { refType: "item", refId: "thali", qtyUsed: 2 },
      { refType: "production", refId: "base", qtyUsed: 200 },
    ],
    totalCost: 0,
  };

  it("prices a nested recipe at what its own components cost", () => {
    const costs = itemRecipeCostsById([thali, combo], COMPONENTS);
    expect(costs.get("thali")).toBe(12);
    expect(costs.get("combo")).toBe(36.2);
  });

  it("settles the child first, whatever order the recipes arrive in", () => {
    const reversed = itemRecipeCostsById([combo, thali], COMPONENTS);
    expect(reversed.get("combo")).toBe(36.2);
  });

  it("ignores the stored total and recomputes from the components", () => {
    const stale = { ...thali, totalCost: 999 };
    const costs = itemRecipeCostsById([stale, combo], COMPONENTS);
    expect(costs.get("combo")).toBe(36.2);
  });

  it("prices a loop at zero rather than recursing forever", () => {
    const a: ItemRecipe = {
      _id: "a",
      name: "A",
      nameKey: "a",
      lines: [{ refType: "item", refId: "b", qtyUsed: 1 }],
      totalCost: 0,
    };
    const b: ItemRecipe = { ...a, _id: "b", name: "B", nameKey: "b",
      lines: [{ refType: "item", refId: "a", qtyUsed: 1 }] };

    expect(itemRecipeCostsById([a, b], COMPONENTS).get("a")).toBe(0);
  });
});

describe("sanitizeItemRecipe with a food item", () => {
  const GRAPH = {
    linesById: new Map([
      ["thali", [{ refType: "raw" as const, refId: "dal", qtyUsed: 100 }]],
      ["combo", [{ refType: "item" as const, refId: "thali", qtyUsed: 1 }]],
    ]),
    costsById: new Map([
      ["thali", 12],
      ["combo", 12],
    ]),
  };

  const sanitizeWith = (input: unknown, selfId?: string) =>
    sanitizeItemRecipe(
      input as Parameters<typeof sanitizeItemRecipe>[0],
      COMPONENTS,
      normalizeMaterialName,
      { ...GRAPH, selfId },
    );

  it("accepts a food item and costs it at that recipe's total", () => {
    const { doc, error } = sanitizeWith({
      name: "Feast",
      lines: [{ refType: "item", refId: "thali", qtyUsed: 2 }],
    });

    expect(error).toBeUndefined();
    expect(doc?.totalCost).toBe(24);
  });

  it("refuses a food item that does not exist", () => {
    expect(
      sanitizeWith({
        name: "Feast",
        lines: [{ refType: "item", refId: "ghost", qtyUsed: 1 }],
      }).error,
    ).toBe("Unknown food item in recipe");
  });

  it("refuses a fractional portion", () => {
    expect(
      sanitizeWith({
        name: "Half Plate",
        lines: [{ refType: "item", refId: "thali", qtyUsed: 0.5 }],
      }).error,
    ).toBe("A food item's quantity must be a whole number");
  });

  it("still allows a fraction of a raw material", () => {
    expect(
      sanitizeWith({
        name: "Pinch",
        lines: [{ refType: "raw", refId: "dal", qtyUsed: 2.5 }],
      }).error,
    ).toBeUndefined();
  });

  it("refuses a recipe made from itself", () => {
    expect(
      sanitizeWith(
        { name: "Thali", lines: [{ refType: "item", refId: "thali", qtyUsed: 1 }] },
        "thali",
      ).error,
    ).toBe("An item cannot be made from itself");
  });

  it("refuses a food item that already leads back to this one", () => {
    // combo is built on thali, so thali may not be built on combo.
    expect(
      sanitizeWith(
        { name: "Thali", lines: [{ refType: "item", refId: "combo", qtyUsed: 1 }] },
        "thali",
      ).error,
    ).toContain("would create a loop");
  });

  it("allows the same pairing when nothing leads back", () => {
    expect(
      sanitizeWith({
        name: "New Combo",
        lines: [{ refType: "item", refId: "combo", qtyUsed: 1 }],
      }).error,
    ).toBeUndefined();
  });

  it("refuses a food item when no graph was supplied at all", () => {
    expect(
      sanitizeItemRecipe(
        {
          name: "Feast",
          lines: [{ refType: "item", refId: "thali", qtyUsed: 1 }],
        },
        COMPONENTS,
        normalizeMaterialName,
      ).error,
    ).toBe("Unknown food item in recipe");
  });
});
