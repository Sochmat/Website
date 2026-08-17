import { describe, it, expect } from "vitest";
import {
  computeCost,
  expandOnSpot,
  productionDependencies,
  recipeConsumption,
  roundCurrency,
  sanitizeProductionItem,
  toRecipeLines,
  type OnSpotItem,
  type CostingMaterial,
  type ProductionRecipeLine,
} from "@/lib/productionItems";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Toor Dal: ₹120 per kg, 1000 gm per kg  -> ₹0.12 per gm
// Ghee:     ₹650 per litre, 1000 ml      -> ₹0.65 per ml
// Masala Base: a production item costed like any other component, from its
// own stored price — ₹80 per kg over 1000 gm -> ₹0.08 per gm.
const MATERIALS = new Map<string, CostingMaterial>([
  ["raw:dal", { pricePerPurchaseUnit: 120, unitConversion: 1000 }],
  ["raw:ghee", { pricePerPurchaseUnit: 650, unitConversion: 1000 }],
  ["production:base", { pricePerPurchaseUnit: 80, unitConversion: 1000 }],
]);

/** A raw-material recipe line, spelled out once. */
const raw = (refId: string, qtyUsed: unknown) => ({
  refType: "raw" as const,
  refId,
  qtyUsed: qtyUsed as number,
});

/** A nested production-item line. */
const made = (refId: string, qtyUsed: number) => ({
  refType: "production" as const,
  refId,
  qtyUsed,
});

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
    raw("dal", 2000), // 2000 × 0.12 = ₹240
    raw("ghee", 100), // 100  × 0.65 = ₹65
  ];

  it("costs each line from the component's per-consumption-unit price", () => {
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
      ["raw:dal", { pricePerPurchaseUnit: 0, unitConversion: 1000 }],
    ]);
    const { lines, totalRecipeCost } = computeCost(
      [raw("dal", 10)],
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

  it("costs a missing component as zero and flags it", () => {
    const { lines, totalRecipeCost } = computeCost(
      [raw("ghost", 100)],
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
        raw("dal", Number.NaN),
        raw("ghee", 100),
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
        raw("dal", 2000),
        raw("ghee", 100),
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
    expect(sanitize({ recipe: [] }).error).toBe("Add at least one component");
    expect(sanitize({ recipe: undefined }).error).toBe(
      "Add at least one component",
    );
  });

  it("rejects an unknown raw material", () => {
    expect(
      sanitize({ recipe: [raw("ghost", 1)] }).error,
    ).toBe("Unknown raw material in recipe");
  });

  it("rejects the same raw material listed twice", () => {
    expect(
      sanitize({
        recipe: [
          raw("dal", 100),
          raw("dal", 200),
        ],
      }).error,
    ).toBe("The same component is listed twice");
  });

  it.each([
    [0, "Recipe quantities must be greater than 0"],
    [-5, "Recipe quantities must be greater than 0"],
  ])("rejects a qty of %s", (qty, expected) => {
    expect(
      sanitize({ recipe: [raw("dal", qty)] }).error,
    ).toBe(expected);
  });

  it("rejects a missing quantity", () => {
    expect(
      sanitize({ recipe: [{ refType: "raw", refId: "dal" }] }).error,
    ).toBe("Every recipe row needs a quantity");
  });

  it("stores the recipe in the order given", () => {
    const { doc } = sanitize();
    expect(doc?.recipe.map((r) => r.refId)).toEqual(["dal", "ghee"]);
  });
});

describe("recipeConsumption", () => {
  // A yields 100 gm from 50 gm of B and 50 gm of C.
  const RECIPE = [
    raw("b", 50),
    raw("c", 50),
  ];

  it("draws down one batch's worth for one batch produced", () => {
    expect(recipeConsumption(RECIPE, 100, 100)).toEqual([
      { refType: "raw", refId: "b", qty: 50 },
      { refType: "raw", refId: "c", qty: 50 },
    ]);
  });

  it("scales linearly with the quantity produced", () => {
    expect(recipeConsumption(RECIPE, 100, 250)).toEqual([
      { refType: "raw", refId: "b", qty: 125 },
      { refType: "raw", refId: "c", qty: 125 },
    ]);
    expect(recipeConsumption(RECIPE, 100, 10)).toEqual([
      { refType: "raw", refId: "b", qty: 5 },
      { refType: "raw", refId: "c", qty: 5 },
    ]);
  });

  it("sums a component named twice in one recipe", () => {
    expect(
      recipeConsumption(
        [
          raw("b", 30),
          raw("b", 20),
        ],
        100,
        100,
      ),
    ).toEqual([{ refType: "raw", refId: "b", qty: 50 }]);
  });

  it("consumes nothing without a batch yield to scale from", () => {
    expect(recipeConsumption(RECIPE, 0, 100)).toEqual([]);
    expect(recipeConsumption(RECIPE, Number.NaN, 100)).toEqual([]);
  });

  it("consumes nothing for a non-positive quantity", () => {
    expect(recipeConsumption(RECIPE, 100, 0)).toEqual([]);
    expect(recipeConsumption(RECIPE, 100, -50)).toEqual([]);
  });

  it("skips lines with no component or no quantity", () => {
    expect(
      recipeConsumption(
        [
          raw("", 10),
          raw("b", 0),
          raw("c", 50),
        ],
        100,
        100,
      ),
    ).toEqual([{ refType: "raw", refId: "c", qty: 50 }]);
  });

  it("handles an empty recipe", () => {
    expect(recipeConsumption([], 100, 100)).toEqual([]);
  });
});

describe("toRecipeLines", () => {
  it("reads a line stored before recipes could name production items", () => {
    expect(toRecipeLines([{ rawMaterialId: "dal", qtyUsed: 100 }])).toEqual([
      { refType: "raw", refId: "dal", qtyUsed: 100 },
    ]);
  });

  it("reads a current line unchanged", () => {
    expect(toRecipeLines([made("base", 250)])).toEqual([
      { refType: "production", refId: "base", qtyUsed: 250 },
    ]);
  });

  it("treats an unknown type as raw rather than dropping the line", () => {
    expect(toRecipeLines([{ refType: "junk", refId: "dal", qtyUsed: 5 }])).toEqual(
      [{ refType: "raw", refId: "dal", qtyUsed: 5 }],
    );
  });

  it("reads anything that is not an array as no recipe", () => {
    expect(toRecipeLines(undefined)).toEqual([]);
    expect(toRecipeLines("nonsense")).toEqual([]);
  });
});

describe("productionDependencies", () => {
  // A is made from B, B from C. C is made from raw material only.
  const GRAPH = new Map<string, ProductionRecipeLine[]>([
    ["a", [made("b", 1), raw("dal", 1)]],
    ["b", [made("c", 1)]],
    ["c", [raw("ghee", 1)]],
  ]);

  it("follows the chain, not just the first hop", () => {
    expect(productionDependencies("a", GRAPH)).toEqual(new Set(["b", "c"]));
  });

  it("does not include the item itself", () => {
    expect(productionDependencies("c", GRAPH)).toEqual(new Set());
  });

  it("terminates on data that already contains a loop", () => {
    const looped = new Map<string, ProductionRecipeLine[]>([
      ["a", [made("b", 1)]],
      ["b", [made("a", 1)]],
    ]);
    expect(productionDependencies("a", looped)).toEqual(new Set(["a", "b"]));
  });
});

describe("sanitizeProductionItem with nested production items", () => {
  const base = {
    name: "Dal Tadka Base",
    consumptionUnit: "gm",
    purchaseUnit: "kg",
    unitConversion: 1000,
    batchYieldQty: 5000,
  };

  it("accepts a production item as a component and costs it", () => {
    // 2000 gm dal (₹240) + 1000 gm of the base (₹0.08 × 1000 = ₹80) = ₹320,
    // over a 5000 gm yield, × 1000 = ₹64 per kg.
    const { doc, error } = sanitizeProductionItem(
      { ...base, recipe: [raw("dal", 2000), made("base", 1000)] },
      MATERIALS,
      normalizeMaterialName,
    );
    expect(error).toBeUndefined();
    expect(doc?.pricePerPurchaseUnit).toBe(64);
    expect(doc?.recipe[1]).toEqual({
      refType: "production",
      refId: "base",
      qtyUsed: 1000,
    });
  });

  it("rejects an unknown production item by name, not as a raw material", () => {
    expect(
      sanitizeProductionItem(
        { ...base, recipe: [made("ghost", 1)] },
        MATERIALS,
        normalizeMaterialName,
      ).error,
    ).toBe("Unknown production item in recipe");
  });

  it("tells a raw material and a production item of the same id apart", () => {
    // "base" exists only as a production item, so naming it as raw fails.
    expect(
      sanitizeProductionItem(
        { ...base, recipe: [raw("base", 1)] },
        MATERIALS,
        normalizeMaterialName,
      ).error,
    ).toBe("Unknown raw material in recipe");
  });

  it("reads a body written in the raw-material-only shape", () => {
    const { doc, error } = sanitizeProductionItem(
      { ...base, recipe: [{ rawMaterialId: "dal", qtyUsed: 2000 }] },
      MATERIALS,
      normalizeMaterialName,
    );
    expect(error).toBeUndefined();
    expect(doc?.recipe).toEqual([
      { refType: "raw", refId: "dal", qtyUsed: 2000 },
    ]);
  });

  it("rejects an item made from itself", () => {
    expect(
      sanitizeProductionItem(
        { ...base, recipe: [made("base", 1)] },
        MATERIALS,
        normalizeMaterialName,
        { selfId: "base", recipesById: new Map() },
      ).error,
    ).toBe("A production item cannot be made from itself");
  });

  it("rejects a loop closed through another production item", () => {
    // "base" is already made from "self", so "self" may not be made from it.
    const recipesById = new Map<string, ProductionRecipeLine[]>([
      ["base", [made("self", 1)]],
    ]);
    expect(
      sanitizeProductionItem(
        { ...base, recipe: [made("base", 1)] },
        MATERIALS,
        normalizeMaterialName,
        { selfId: "self", recipesById },
      ).error,
    ).toMatch(/loop/);
  });

  it("allows a chain that does not close", () => {
    const recipesById = new Map<string, ProductionRecipeLine[]>([
      ["base", [raw("dal", 1)]],
    ]);
    expect(
      sanitizeProductionItem(
        { ...base, recipe: [made("base", 1)] },
        MATERIALS,
        normalizeMaterialName,
        { selfId: "self", recipesById },
      ).error,
    ).toBeUndefined();
  });
});

describe("recipeConsumption with nested production items", () => {
  it("draws a nested item off its own shelf, tagged as production", () => {
    expect(
      recipeConsumption([raw("dal", 50), made("base", 20)], 100, 200),
    ).toEqual([
      { refType: "raw", refId: "dal", qty: 100 },
      { refType: "production", refId: "base", qty: 40 },
    ]);
  });

  it("does not expand a nested item into what IT is made from", () => {
    // The base was already paid for in raw material when its own batch was
    // recorded; expanding here would deduct that twice.
    const consumed = recipeConsumption([made("base", 20)], 100, 100);
    expect(consumed).toEqual([
      { refType: "production", refId: "base", qty: 20 },
    ]);
  });

  it("keeps a raw material and a production item of the same id apart", () => {
    expect(recipeConsumption([raw("x", 10), made("x", 10)], 100, 100)).toEqual([
      { refType: "raw", refId: "x", qty: 10 },
      { refType: "production", refId: "x", qty: 10 },
    ]);
  });
});

describe("expandOnSpot", () => {
  /** Paneer Gravy: a 5000 gm batch from 800 gm paneer + 1200 gm purée. */
  const gravy: OnSpotItem = {
    batchYieldQty: 5000,
    recipe: [
      { refType: "raw", refId: "paneer", qtyUsed: 800 },
      { refType: "raw", refId: "puree", qtyUsed: 1200 },
    ],
  };

  it("leaves demand alone when nothing is made to order", () => {
    const demand = [{ refType: "production" as const, refId: "gravy", qty: 250 }];

    expect(expandOnSpot(demand, new Map()).demand).toEqual(demand);
  });

  it("replaces an on-spot item with its recipe, scaled by batch yield", () => {
    // 250 gm of a 5000 gm batch = 0.05 of it.
    const { demand: expanded } = expandOnSpot(
      [{ refType: "production", refId: "gravy", qty: 250 }],
      new Map([["gravy", gravy]]),
    );

    expect(expanded).toEqual([
      { refType: "raw", refId: "paneer", qty: 40 },
      { refType: "raw", refId: "puree", qty: 60 },
    ]);
  });

  it("never draws down the on-spot item itself", () => {
    const { demand: expanded } = expandOnSpot(
      [{ refType: "production", refId: "gravy", qty: 250 }],
      new Map([["gravy", gravy]]),
    );

    expect(expanded.some((l) => l.refId === "gravy")).toBe(false);
  });

  it("leaves a stocked production item as itself", () => {
    // Only the flagged one is expanded; a batch-prepped item is a real shelf.
    const { demand: expanded } = expandOnSpot(
      [
        { refType: "production", refId: "gravy", qty: 250 },
        { refType: "production", refId: "rice", qty: 150 },
      ],
      new Map([["gravy", gravy]]),
    );

    expect(expanded).toContainEqual({
      refType: "production",
      refId: "rice",
      qty: 150,
    });
  });

  it("sums a raw material reached both directly and through an on-spot item", () => {
    const { demand: expanded } = expandOnSpot(
      [
        { refType: "production", refId: "gravy", qty: 250 },
        { refType: "raw", refId: "paneer", qty: 10 },
      ],
      new Map([["gravy", gravy]]),
    );

    expect(expanded).toContainEqual({
      refType: "raw",
      refId: "paneer",
      qty: 50, // 40 through the gravy + 10 on its own
    });
  });

  it("expands an on-spot item made from another on-spot item", () => {
    const masala: OnSpotItem = {
      batchYieldQty: 100,
      recipe: [{ refType: "production", refId: "gravy", qtyUsed: 500 }],
    };
    // 50 of masala = 0.5 batch = 250 gm gravy = 40 paneer + 60 purée.
    const { demand: expanded } = expandOnSpot(
      [{ refType: "production", refId: "masala", qty: 50 }],
      new Map([
        ["masala", masala],
        ["gravy", gravy],
      ]),
    );

    expect(expanded).toEqual([
      { refType: "raw", refId: "paneer", qty: 40 },
      { refType: "raw", refId: "puree", qty: 60 },
    ]);
  });

  it("terminates on data that already contains a loop", () => {
    const a: OnSpotItem = {
      batchYieldQty: 10,
      recipe: [{ refType: "production", refId: "b", qtyUsed: 1 }],
    };
    const b: OnSpotItem = {
      batchYieldQty: 10,
      recipe: [{ refType: "production", refId: "a", qtyUsed: 1 }],
    };

    expect(() =>
      expandOnSpot(
        [{ refType: "production", refId: "a", qty: 5 }],
        new Map([
          ["a", a],
          ["b", b],
        ]),
      ),
    ).not.toThrow();
  });

  it("expands an on-spot item with no usable batch yield to nothing", () => {
    const broken: OnSpotItem = { batchYieldQty: 0, recipe: gravy.recipe };

    expect(
      expandOnSpot(
        [{ refType: "production", refId: "broken", qty: 250 }],
        new Map([["broken", broken]]),
      ).demand,
    ).toEqual([]);
  });

  it("ignores a raw material that happens to share an on-spot item's id", () => {
    // Keys are only unique within a collection — the type must be checked too.
    const { demand: expanded } = expandOnSpot(
      [{ refType: "raw", refId: "gravy", qty: 7 }],
      new Map([["gravy", gravy]]),
    );

    expect(expanded).toEqual([{ refType: "raw", refId: "gravy", qty: 7 }]);
  });
});

describe("expandOnSpot — reporting what was made", () => {
  const gravy: OnSpotItem = {
    batchYieldQty: 5000,
    recipe: [{ refType: "raw", refId: "paneer", qtyUsed: 800 }],
  };

  it("reports nothing made when nothing is on spot", () => {
    const { onSpotQty } = expandOnSpot(
      [{ refType: "production", refId: "gravy", qty: 250 }],
      new Map(),
    );

    expect(onSpotQty.size).toBe(0);
  });

  it("reports how much of an on-spot item was made", () => {
    const { onSpotQty } = expandOnSpot(
      [{ refType: "production", refId: "gravy", qty: 250 }],
      new Map([["gravy", gravy]]),
    );

    expect(onSpotQty.get("gravy")).toBe(250);
  });

  it("sums one item demanded down two branches", () => {
    // Two dishes both calling for gravy is 750 gm made, not two figures.
    const { onSpotQty } = expandOnSpot(
      [
        { refType: "production", refId: "gravy", qty: 500 },
        { refType: "production", refId: "gravy", qty: 250 },
      ],
      new Map([["gravy", gravy]]),
    );

    expect(onSpotQty.get("gravy")).toBe(750);
  });

  it("reports every on-spot item in a nested chain, not just the outermost", () => {
    const masala: OnSpotItem = {
      batchYieldQty: 100,
      recipe: [{ refType: "production", refId: "gravy", qtyUsed: 500 }],
    };
    const { onSpotQty } = expandOnSpot(
      [{ refType: "production", refId: "masala", qty: 50 }],
      new Map([
        ["masala", masala],
        ["gravy", gravy],
      ]),
    );

    expect(onSpotQty.get("masala")).toBe(50);
    expect(onSpotQty.get("gravy")).toBe(250);
  });

  it("reports an item as made even when its recipe yields nothing usable", () => {
    // It really was made; that its recipe cannot say from what is a separate
    // failure, and hiding the item would lose both facts instead of one.
    const broken: OnSpotItem = { batchYieldQty: 0, recipe: gravy.recipe };
    const { demand, onSpotQty } = expandOnSpot(
      [{ refType: "production", refId: "broken", qty: 250 }],
      new Map([["broken", broken]]),
    );

    expect(demand).toEqual([]);
    expect(onSpotQty.get("broken")).toBe(250);
  });

  it("never reports a stocked production item as made", () => {
    const { onSpotQty } = expandOnSpot(
      [{ refType: "production", refId: "rice", qty: 150 }],
      new Map([["gravy", gravy]]),
    );

    expect(onSpotQty.has("rice")).toBe(false);
  });
});
