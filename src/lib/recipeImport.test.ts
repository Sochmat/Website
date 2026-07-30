import { describe, expect, it } from "vitest";
import { loopedNameKeys, planProductionImport } from "./recipeImport";
import type { CostingMaterial } from "./productionItems";

const COMPONENTS = new Map<string, CostingMaterial>([
  ["raw:dal-id", { pricePerPurchaseUnit: 120, unitConversion: 1000 }],
  ["raw:ghee-id", { pricePerPurchaseUnit: 650, unitConversion: 1000 }],
  ["production:base-id", { pricePerPurchaseUnit: 80, unitConversion: 1000 }],
  ["production:tadka-id", { pricePerPurchaseUnit: 90, unitConversion: 1000 }],
]);

const RAW_IDS = new Map([
  ["toor dal", "dal-id"],
  ["ghee", "ghee-id"],
]);
const PRODUCTION_IDS = new Map([
  ["masala base", "base-id"],
  ["tadka base", "tadka-id"],
]);

/** One row of the Production Items sheet, with the boring columns filled in. */
const itemRow = (name: string) => ({
  "Item Name": name,
  "Consumption Unit": "gm",
  "Purchase Unit": "kg",
  "Unit Conversion": 1000,
  "Batch Yield Qty": 5000,
});

describe("loopedNameKeys", () => {
  it("finds nothing in a graph that does not close", () => {
    const stored = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", []],
    ]);
    expect(loopedNameKeys(stored, new Map())).toEqual(new Set());
  });

  it("flags every name in a loop, not just the one that closed it", () => {
    const stored = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
    ]);
    expect(loopedNameKeys(stored, new Map())).toEqual(new Set(["a", "b", "c"]));
  });

  it("flags a name that is made from itself", () => {
    expect(loopedNameKeys(new Map([["a", ["a"]]]), new Map())).toEqual(
      new Set(["a"]),
    );
  });

  it("does not flag a name that merely reaches a loop", () => {
    const stored = new Map([
      ["outsider", ["a"]],
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    expect(loopedNameKeys(stored, new Map())).toEqual(new Set(["a", "b"]));
  });

  it("lets the sheet REPLACE a stored recipe rather than adding to it", () => {
    // Stored: a -> b -> a, a loop. The sheet re-points b at nothing, which
    // breaks it — an upload replaces a recipe, it does not merge into one.
    const stored = new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    expect(loopedNameKeys(stored, new Map([["b", []]]))).toEqual(new Set());
  });

  it("finds a loop the sheet itself creates", () => {
    const stored = new Map([["a", []]]);
    const sheet = new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    expect(loopedNameKeys(stored, sheet)).toEqual(new Set(["a", "b"]));
  });
});

describe("planProductionImport", () => {
  const plan = (recipeRows: Record<string, unknown>[], names = ["Dal Fry"]) =>
    planProductionImport(
      names.map(itemRow),
      recipeRows,
      RAW_IDS,
      PRODUCTION_IDS,
      new Map(),
      COMPONENTS,
      new Map(),
    );

  it("reads a sheet written before the Type column existed", () => {
    const result = plan([
      { "Item Name": "Dal Fry", "Raw Material": "Toor Dal", "Qty Used": 2000 },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.creates[0].recipe).toEqual([
      { refType: "raw", refId: "dal-id", qtyUsed: 2000 },
    ]);
  });

  it("accepts a production item as a component", () => {
    const result = plan([
      {
        "Item Name": "Dal Fry",
        Type: "Production Item",
        Component: "Masala Base",
        "Qty Used": 300,
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.creates[0].recipe).toEqual([
      { refType: "production", refId: "base-id", qtyUsed: 300 },
    ]);
  });

  it("looks a name up in the list its Type names", () => {
    // "Masala Base" is a production item; asking for it as raw must fail
    // rather than silently resolving to something else.
    const result = plan([
      {
        "Item Name": "Dal Fry",
        Type: "Raw Material",
        Component: "Masala Base",
        "Qty Used": 300,
      },
    ]);
    expect(result.creates).toEqual([]);
    expect(result.errors[0].message).toBe('Unknown raw material "Masala Base"');
  });

  it("rejects an unreadable Type", () => {
    const result = plan([
      {
        "Item Name": "Dal Fry",
        Type: "Something Else",
        Component: "Toor Dal",
        "Qty Used": 1,
      },
    ]);
    expect(result.errors[0].message).toMatch(/^Type must be/);
  });

  it("rejects a loop the sheet would create", () => {
    // Masala Base is made from Tadka Base, and Tadka Base from Masala Base.
    const result = planProductionImport(
      [itemRow("Masala Base"), itemRow("Tadka Base")],
      [
        {
          "Item Name": "Masala Base",
          Type: "Production Item",
          Component: "Tadka Base",
          "Qty Used": 100,
        },
        {
          "Item Name": "Tadka Base",
          Type: "Production Item",
          Component: "Masala Base",
          "Qty Used": 100,
        },
      ],
      RAW_IDS,
      PRODUCTION_IDS,
      new Map(),
      COMPONENTS,
      new Map(),
    );
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/made from itself/);
  });

  it("rejects a loop closed against a recipe already stored", () => {
    // Stored: Masala Base is made from Tadka Base. The sheet now points Tadka
    // Base back at Masala Base, which closes the ring.
    const result = planProductionImport(
      [itemRow("Tadka Base")],
      [
        {
          "Item Name": "Tadka Base",
          Type: "Production Item",
          Component: "Masala Base",
          "Qty Used": 100,
        },
      ],
      RAW_IDS,
      PRODUCTION_IDS,
      new Map(),
      COMPONENTS,
      new Map([["masala base", ["tadka base"]]]),
    );
    expect(result.creates).toEqual([]);
    expect(result.errors[0].message).toMatch(/made from itself/);
  });

  it("still rejects the same component listed twice for one item", () => {
    const result = plan([
      {
        "Item Name": "Dal Fry",
        Type: "Production Item",
        Component: "Masala Base",
        "Qty Used": 100,
      },
      {
        "Item Name": "Dal Fry",
        Type: "Production Item",
        Component: "Masala Base",
        "Qty Used": 200,
      },
    ]);
    expect(result.errors[0].message).toMatch(/listed twice/);
  });

  it("keeps a raw material and a production item of the same name apart", () => {
    const result = plan([
      { "Item Name": "Dal Fry", Component: "Toor Dal", "Qty Used": 2000 },
      {
        "Item Name": "Dal Fry",
        Type: "Production Item",
        Component: "Masala Base",
        "Qty Used": 300,
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.creates[0].recipe).toHaveLength(2);
  });
});
