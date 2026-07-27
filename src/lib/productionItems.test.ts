import { describe, it, expect } from "vitest";
import {
  computeCost,
  recipeConsumption,
  roundCurrency,
  sanitizeProductionItem,
  type CostingMaterial,
} from "./productionItems";
import { normalizeMaterialName } from "./rawMaterials";

// Toor Dal: ₹120 per kg, 1000 gm per kg  -> ₹0.12 per gm
// Ghee:     ₹650 per litre, 1000 ml      -> ₹0.65 per ml
const MATERIALS = new Map<string, CostingMaterial>([
  ["dal", { pricePerPurchaseUnit: 120, unitConversion: 1000 }],
  ["ghee", { pricePerPurchaseUnit: 650, unitConversion: 1000 }],
]);

describe("roundCurrency", () => {
  it("rounds to paise", () => {
    expect(roundCurrency(12.3456)).toBe(12.35);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it("returns 0 for non-finite input rather than NaN", () => {
    expect(roundCurrency(Infinity)).toBe(0);
    expect(roundCurrency(NaN)).toBe(0);
  });
});

describe("computeCost", () => {
  const recipe = [
    { rawMaterialId: "dal", qtyUsed: 2000 }, // 2000 × 0.12 = ₹240
    { rawMaterialId: "ghee", qtyUsed: 100 }, // 100  × 0.65 = ₹65
  ];

  it("costs each line from the raw material's per-consumption-unit price", () => {
    const { lines } = computeCost(recipe, 5000, 1000, MATERIALS);
    expect(lines[0].unitCost).toBeCloseTo(0.12);
    expect(lines[0].cost).toBeCloseTo(240);
    expect(lines[1].cost).toBeCloseTo(65);
  });

  it("totals the lines", () => {
    expect(computeCost(recipe, 5000, 1000, MATERIALS).totalRecipeCost).toBeCloseTo(
      305,
    );
  });

  it("divides the total by the batch yield", () => {
    // ₹305 over 5000 gm = ₹0.061 per gm
    expect(
      computeCost(recipe, 5000, 1000, MATERIALS).costPerConsumptionUnit,
    ).toBeCloseTo(0.061);
  });

  it("scales the per-unit cost up to the purchase unit", () => {
    // ₹0.061/gm × 1000 gm per kg = ₹61.00 per kg
    expect(computeCost(recipe, 5000, 1000, MATERIALS).pricePerPurchaseUnit).toBe(
      61,
    );
  });

  it("reports each line's share of the total", () => {
    const { lines } = computeCost(recipe, 5000, 1000, MATERIALS);
    expect(lines[0].share).toBeCloseTo(240 / 305);
    expect(lines[1].share).toBeCloseTo(65 / 305);
    expect(lines[0].share + lines[1].share).toBeCloseTo(1);
  });

  it("gives every line a zero share when nothing costs anything", () => {
    const free = new Map<string, CostingMaterial>([
      ["dal", { pricePerPurchaseUnit: 0, unitConversion: 1000 }],
    ]);
    const { lines, totalRecipeCost } = computeCost(
      [{ rawMaterialId: "dal", qtyUsed: 10 }],
      100,
      1000,
      free,
    );
    expect(totalRecipeCost).toBe(0);
    expect(lines[0].share).toBe(0); // not NaN from 0/0
  });

  it("returns 0 rather than Infinity when the batch yield is 0", () => {
    // The form calls this on every keystroke; a half-typed yield must not
    // produce Infinity.
    const result = computeCost(recipe, 0, 1000, MATERIALS);
    expect(result.costPerConsumptionUnit).toBe(0);
    expect(result.pricePerPurchaseUnit).toBe(0);
  });

  it("costs a missing raw material as zero and flags it", () => {
    const { lines, totalRecipeCost } = computeCost(
      [{ rawMaterialId: "ghost", qtyUsed: 100 }],
      100,
      1,
      MATERIALS,
    );
    expect(lines[0].found).toBe(false);
    expect(lines[0].cost).toBe(0);
    expect(totalRecipeCost).toBe(0);
  });

  it("treats a NaN quantity as zero instead of poisoning the total", () => {
    const { totalRecipeCost } = computeCost(
      [
        { rawMaterialId: "dal", qtyUsed: Number.NaN },
        { rawMaterialId: "ghee", qtyUsed: 100 },
      ],
      100,
      1,
      MATERIALS,
    );
    expect(totalRecipeCost).toBeCloseTo(65);
  });

  it("handles an empty recipe", () => {
    const result = computeCost([], 100, 1000, MATERIALS);
    expect(result.totalRecipeCost).toBe(0);
    expect(result.pricePerPurchaseUnit).toBe(0);
  });
});

describe("sanitizeProductionItem", () => {
  function input(overrides: Record<string, unknown> = {}) {
    return {
      name: "Dal Tadka Base",
      consumptionUnit: "gm",
      purchaseUnit: "kg",
      unitConversion: 1000,
      batchYieldQty: 5000,
      recipe: [
        { rawMaterialId: "dal", qtyUsed: 2000 },
        { rawMaterialId: "ghee", qtyUsed: 100 },
      ],
      ...overrides,
    };
  }

  const sanitize = (o: Record<string, unknown> = {}) =>
    sanitizeProductionItem(input(o), MATERIALS, normalizeMaterialName);

  it("accepts a valid item and derives the price", () => {
    const { doc, error } = sanitize();
    expect(error).toBeUndefined();
    expect(doc?.pricePerPurchaseUnit).toBe(61);
    expect(doc?.nameKey).toBe("dal tadka base");
  });

  it("normalizes the name the same way raw materials do", () => {
    expect(sanitize({ name: "  Dal   Tadka Base " }).doc?.name).toBe(
      "Dal Tadka Base",
    );
  });

  it("parses numbers written with commas", () => {
    const { doc } = sanitize({ batchYieldQty: "5,000" });
    expect(doc?.batchYieldQty).toBe(5000);
  });

  it.each([
    ["name", { name: "  " }, "Name is required"],
    ["consumption unit", { consumptionUnit: "" }, "Consumption unit is required"],
    ["purchase unit", { purchaseUnit: "" }, "Purchase unit is required"],
    ["conversion", { unitConversion: "abc" }, "Unit conversion is required"],
    ["zero conversion", { unitConversion: 0 }, "Unit conversion must be greater than 0"],
    ["missing yield", { batchYieldQty: "" }, "Batch yield qty is required"],
    ["zero yield", { batchYieldQty: 0 }, "Batch yield qty must be greater than 0"],
    ["negative yield", { batchYieldQty: -1 }, "Batch yield qty must be greater than 0"],
  ])("rejects a bad %s", (_label, overrides, expected) => {
    const { doc, error } = sanitize(overrides);
    expect(doc).toBeUndefined();
    expect(error).toBe(expected);
  });

  it("requires at least one recipe line", () => {
    expect(sanitize({ recipe: [] }).error).toBe("Add at least one raw material");
    expect(sanitize({ recipe: undefined }).error).toBe(
      "Add at least one raw material",
    );
  });

  it("rejects an unknown raw material", () => {
    expect(
      sanitize({ recipe: [{ rawMaterialId: "ghost", qtyUsed: 1 }] }).error,
    ).toBe("Unknown raw material in recipe");
  });

  it("rejects the same raw material listed twice", () => {
    expect(
      sanitize({
        recipe: [
          { rawMaterialId: "dal", qtyUsed: 100 },
          { rawMaterialId: "dal", qtyUsed: 200 },
        ],
      }).error,
    ).toBe("The same raw material is listed twice");
  });

  it.each([
    [0, "Recipe quantities must be greater than 0"],
    [-5, "Recipe quantities must be greater than 0"],
  ])("rejects a qty of %s", (qty, expected) => {
    expect(
      sanitize({ recipe: [{ rawMaterialId: "dal", qtyUsed: qty }] }).error,
    ).toBe(expected);
  });

  it("rejects a missing quantity", () => {
    expect(
      sanitize({ recipe: [{ rawMaterialId: "dal" }] }).error,
    ).toBe("Every recipe row needs a quantity");
  });

  it("stores the recipe in the order given", () => {
    const { doc } = sanitize();
    expect(doc?.recipe.map((r) => r.rawMaterialId)).toEqual(["dal", "ghee"]);
  });
});

describe("recipeConsumption", () => {
  // A yields 100 gm from 50 gm of B and 50 gm of C.
  const RECIPE = [
    { rawMaterialId: "b", qtyUsed: 50 },
    { rawMaterialId: "c", qtyUsed: 50 },
  ];

  it("draws down one batch's worth for one batch produced", () => {
    expect(recipeConsumption(RECIPE, 100, 100)).toEqual([
      { rawMaterialId: "b", qty: 50 },
      { rawMaterialId: "c", qty: 50 },
    ]);
  });

  it("scales linearly with the quantity produced", () => {
    expect(recipeConsumption(RECIPE, 100, 250)).toEqual([
      { rawMaterialId: "b", qty: 125 },
      { rawMaterialId: "c", qty: 125 },
    ]);
    expect(recipeConsumption(RECIPE, 100, 10)).toEqual([
      { rawMaterialId: "b", qty: 5 },
      { rawMaterialId: "c", qty: 5 },
    ]);
  });

  it("sums a material named twice in one recipe", () => {
    expect(
      recipeConsumption(
        [
          { rawMaterialId: "b", qtyUsed: 30 },
          { rawMaterialId: "b", qtyUsed: 20 },
        ],
        100,
        100,
      ),
    ).toEqual([{ rawMaterialId: "b", qty: 50 }]);
  });

  it("consumes nothing without a batch yield to scale from", () => {
    expect(recipeConsumption(RECIPE, 0, 100)).toEqual([]);
    expect(recipeConsumption(RECIPE, Number.NaN, 100)).toEqual([]);
  });

  it("consumes nothing for a non-positive quantity", () => {
    expect(recipeConsumption(RECIPE, 100, 0)).toEqual([]);
    expect(recipeConsumption(RECIPE, 100, -50)).toEqual([]);
  });

  it("skips lines with no material or no quantity", () => {
    expect(
      recipeConsumption(
        [
          { rawMaterialId: "", qtyUsed: 10 },
          { rawMaterialId: "b", qtyUsed: 0 },
          { rawMaterialId: "c", qtyUsed: 50 },
        ],
        100,
        100,
      ),
    ).toEqual([{ rawMaterialId: "c", qty: 50 }]);
  });

  it("handles an empty recipe", () => {
    expect(recipeConsumption([], 100, 100)).toEqual([]);
  });
});
