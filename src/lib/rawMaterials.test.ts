import { describe, it, expect } from "vitest";
import {
  normalizeMaterialName,
  formatUnitConversion,
  pricePerConsumptionUnit,
  isBelowAlert,
  isLowStock,
  sanitizeRawMaterial,
  planImport,
  type RawMaterial,
} from "./rawMaterials";

const CATEGORIES = new Set(["cat-veg", "cat-dairy"]);

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Toor Dal",
    categoryId: "cat-veg",
    consumptionUnit: "gm",
    purchaseUnit: "kg",
    unitConversion: 1000,
    pricePerPurchaseUnit: 120,
    alertQty: 500,
    ...overrides,
  };
}

describe("normalizeMaterialName", () => {
  it("collapses case, whitespace and trailing punctuation to one key", () => {
    const key = normalizeMaterialName("Toor Dal");
    expect(normalizeMaterialName("  toor   dal  ")).toBe(key);
    expect(normalizeMaterialName("TOOR DAL.")).toBe(key);
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizeMaterialName("Toor Dal")).not.toBe(
      normalizeMaterialName("Moong Dal"),
    );
  });
});

describe("formatUnitConversion", () => {
  it("reads as the sentence shown in the table", () => {
    expect(
      formatUnitConversion({
        purchaseUnit: "kg",
        unitConversion: 1000,
        consumptionUnit: "gm",
      }),
    ).toBe("1 kg = 1,000 gm");
  });
});

describe("pricePerConsumptionUnit", () => {
  it("divides the purchase price by the conversion factor", () => {
    expect(
      pricePerConsumptionUnit({ pricePerPurchaseUnit: 120, unitConversion: 1000 }),
    ).toBeCloseTo(0.12);
  });

  it("returns 0 rather than Infinity when conversion is 0", () => {
    expect(
      pricePerConsumptionUnit({ pricePerPurchaseUnit: 120, unitConversion: 0 }),
    ).toBe(0);
  });
});

describe("isLowStock", () => {
  const base: RawMaterial = {
    name: "Toor Dal",
    nameKey: "toor dal",
    categoryId: "cat-veg",
    consumptionUnit: "gm",
    purchaseUnit: "kg",
    unitConversion: 1000,
    pricePerPurchaseUnit: 120,
    alertQty: 500,
  };

  it("flags stock at or below the threshold", () => {
    expect(isLowStock({ ...base, currentStock: 500 })).toBe(true);
    expect(isLowStock({ ...base, currentStock: 499 })).toBe(true);
  });

  it("does not flag stock above the threshold", () => {
    expect(isLowStock({ ...base, currentStock: 501 })).toBe(false);
  });

  it("treats untracked stock as unknown, not as zero", () => {
    // The regression this guards: `currentStock ?? 0 <= alertQty` would badge
    // every material as critical before stock tracking ships.
    expect(isLowStock(base)).toBe(false);
  });

  it("still flags a genuine tracked zero", () => {
    expect(isLowStock({ ...base, currentStock: 0 })).toBe(true);
  });
});

describe("sanitizeRawMaterial", () => {
  it("accepts a valid record and derives the name key", () => {
    const { doc, error } = sanitizeRawMaterial(input(), CATEGORIES);
    expect(error).toBeUndefined();
    expect(doc?.nameKey).toBe("toor dal");
    expect(doc?.unitConversion).toBe(1000);
  });

  it("trims the name and collapses internal whitespace, keeping case", () => {
    expect(sanitizeRawMaterial(input({ name: "  Ghee  " }), CATEGORIES).doc?.name).toBe(
      "Ghee",
    );
    expect(
      sanitizeRawMaterial(input({ name: "TOOR  DAL" }), CATEGORIES).doc?.name,
    ).toBe("TOOR DAL");
  });

  it("parses numbers written with commas or padding", () => {
    const { doc } = sanitizeRawMaterial(
      input({ unitConversion: "1,000", pricePerPurchaseUnit: " 12.5 " }),
      CATEGORIES,
    );
    expect(doc?.unitConversion).toBe(1000);
    expect(doc?.pricePerPurchaseUnit).toBe(12.5);
  });

  it.each([
    ["name", { name: "   " }, "Name is required"],
    ["category", { categoryId: "" }, "Category is required"],
    ["unknown category", { categoryId: "cat-nope" }, "Unknown category"],
    ["consumption unit", { consumptionUnit: "" }, "Consumption unit is required"],
    ["purchase unit", { purchaseUnit: "" }, "Purchase unit is required"],
    ["conversion", { unitConversion: "abc" }, "Unit conversion is required"],
    ["zero conversion", { unitConversion: 0 }, "Unit conversion must be greater than 0"],
    ["negative price", { pricePerPurchaseUnit: -1 }, "Price cannot be negative"],
    ["negative alert", { alertQty: -5 }, "Alert qty cannot be negative"],
  ])("rejects a bad %s", (_label, overrides, expected) => {
    const { doc, error } = sanitizeRawMaterial(input(overrides), CATEGORIES);
    expect(doc).toBeUndefined();
    expect(error).toBe(expected);
  });

  it("accepts a zero alert qty and a zero price", () => {
    const { error } = sanitizeRawMaterial(
      input({ alertQty: 0, pricePerPurchaseUnit: 0 }),
      CATEGORIES,
    );
    expect(error).toBeUndefined();
  });

  it.each([
    ["blank", ""],
    ["whitespace", "   "],
    ["absent", undefined],
  ])("treats a %s alert qty as no threshold rather than an error", (_l, value) => {
    const { doc, error } = sanitizeRawMaterial(
      input({ alertQty: value }),
      CATEGORIES,
    );
    expect(error).toBeUndefined();
    // 0 is what isBelowAlert reads as "no threshold set", so nothing is
    // flagged low for a material that never asked to be.
    expect(doc?.alertQty).toBe(0);
    expect(isBelowAlert(0, doc?.alertQty)).toBe(false);
  });
});

describe("brands", () => {
  const BRANDS = new Set(["brand-amul"]);

  it("accepts a blank brand — unbranded is normal", () => {
    const { doc, error } = sanitizeRawMaterial(
      input({ brandId: "" }),
      CATEGORIES,
      BRANDS,
    );
    expect(error).toBeUndefined();
    expect(doc?.brandId).toBe("");
  });

  it("accepts a known brand", () => {
    const { doc, error } = sanitizeRawMaterial(
      input({ brandId: "brand-amul" }),
      CATEGORIES,
      BRANDS,
    );
    expect(error).toBeUndefined();
    expect(doc?.brandId).toBe("brand-amul");
  });

  it("rejects an unknown brand", () => {
    const { error } = sanitizeRawMaterial(
      input({ brandId: "brand-nope" }),
      CATEGORIES,
      BRANDS,
    );
    expect(error).toBe("Unknown brand");
  });

  it("fails closed when the caller omits the brand set entirely", () => {
    // Guards against a route forgetting to pass validBrandIds and thereby
    // storing an unvalidated id.
    const { error } = sanitizeRawMaterial(
      input({ brandId: "brand-amul" }),
      CATEGORIES,
    );
    expect(error).toBe("Unknown brand");
  });

  it("always emits brandId so clearing a brand unsets it", () => {
    const { doc } = sanitizeRawMaterial(input(), CATEGORIES, BRANDS);
    expect(doc).toHaveProperty("brandId", "");
  });
});

describe("planImport", () => {
  const categoryIdsByName = new Map([
    ["vegetables", "cat-veg"],
    ["dairy", "cat-dairy"],
  ]);
  const brandIdsByName = new Map([["amul", "brand-amul"]]);

  function sheetRow(overrides: Record<string, unknown> = {}) {
    return {
      Name: "Toor Dal",
      Category: "Vegetables",
      "Consumption Unit": "gm",
      "Purchase Unit": "kg",
      "Unit Conversion": 1000,
      "Price per Purchase Unit": 120,
      "Alert Qty": 500,
      ...overrides,
    };
  }

  it("creates rows with no existing match", () => {
    const plan = planImport([sheetRow()], categoryIdsByName, new Map());
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.errors).toHaveLength(0);
  });

  it("updates rows matched by normalized name, carrying the existing id", () => {
    const existing = new Map([["toor dal", "id-1"]]);
    const plan = planImport(
      [sheetRow({ Name: "  TOOR  DAL " })],
      categoryIdsByName,
      existing,
    );
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toEqual([expect.objectContaining({ _id: "id-1" })]);
  });

  it("matches categories case-insensitively", () => {
    const plan = planImport(
      [sheetRow({ Category: "vegetables" })],
      categoryIdsByName,
      new Map(),
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.creates[0].categoryId).toBe("cat-veg");
  });

  it("adds a category the sheet introduces rather than failing the row", () => {
    const plan = planImport(
      [sheetRow({ Category: "Frozen" })],
      categoryIdsByName,
      new Map(),
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.creates).toHaveLength(1);
    expect(plan.newCategories).toEqual(["Frozen"]);
    // The row carries the name; the commit resolves the real id from it.
    expect(plan.creates[0].categoryName).toBe("Frozen");
  });

  it("reports a blank category as missing, not unknown", () => {
    const plan = planImport(
      [sheetRow({ Category: "" })],
      categoryIdsByName,
      new Map(),
    );
    expect(plan.errors[0].message).toBe("Category is required");
  });

  it("numbers error rows the way Excel does, header included", () => {
    const plan = planImport(
      [sheetRow(), sheetRow({ Name: "" })],
      categoryIdsByName,
      new Map(),
    );
    // First data row is sheet row 2, so the second one is row 3.
    expect(plan.errors[0].rowNumber).toBe(3);
  });

  it("rejects the later of two rows sharing a name in one file", () => {
    const plan = planImport(
      [sheetRow(), sheetRow({ Name: "toor dal", "Alert Qty": 999 })],
      categoryIdsByName,
      new Map(),
    );
    expect(plan.creates).toHaveLength(1);
    expect(plan.errors).toEqual([
      expect.objectContaining({ rowNumber: 3, message: "Duplicate name in this file" }),
    ]);
  });

  it("keeps processing after a bad row", () => {
    const plan = planImport(
      [sheetRow({ Name: "" }), sheetRow({ Name: "Ghee", Category: "Dairy" })],
      categoryIdsByName,
      new Map(),
    );
    expect(plan.errors).toHaveLength(1);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].name).toBe("Ghee");
  });

  it("leaves the brand blank when the sheet has no Brand column", () => {
    const plan = planImport([sheetRow()], categoryIdsByName, new Map(), brandIdsByName);
    expect(plan.errors).toHaveLength(0);
    expect(plan.creates[0].brandId).toBe("");
  });

  it("resolves a brand name case-insensitively", () => {
    const plan = planImport(
      [sheetRow({ Brand: "AMUL" })],
      categoryIdsByName,
      new Map(),
      brandIdsByName,
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.creates[0].brandId).toBe("brand-amul");
  });

  it("adds a brand the sheet introduces rather than failing the row", () => {
    const plan = planImport(
      [sheetRow({ Brand: "Nestle" })],
      categoryIdsByName,
      new Map(),
      brandIdsByName,
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.creates).toHaveLength(1);
    expect(plan.newBrands).toEqual(["Nestle"]);
    expect(plan.creates[0].brandName).toBe("Nestle");
  });

  it("splits a mixed sheet into creates, updates and errors", () => {
    const existing = new Map([["toor dal", "id-1"]]);
    const plan = planImport(
      [
        sheetRow(),
        sheetRow({ Name: "Ghee", Category: "Dairy" }),
        // An unknown category is no longer an error — it is added. This row
        // fails on something the importer genuinely cannot resolve.
        sheetRow({ Name: "Bad", "Unit Conversion": "abc" }),
      ],
      categoryIdsByName,
      existing,
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.creates).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
  });
});

describe("planImport adds the lookups a sheet introduces", () => {
  const categoryIdsByName = new Map([["vegetables", "cat-veg"]]);
  const brandIdsByName = new Map([["amul", "brand-amul"]]);
  const knownUnits = {
    consumption: new Set(["gm"]),
    purchase: new Set(["kg"]),
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    Name: "Toor Dal",
    Category: "Vegetables",
    "Consumption Unit": "gm",
    "Purchase Unit": "kg",
    "Unit Conversion": 1000,
    "Price per Purchase Unit": 120,
    "Alert Qty": 500,
    ...overrides,
  });

  const plan = (rows: Record<string, unknown>[]) =>
    planImport(rows, categoryIdsByName, new Map(), brandIdsByName, knownUnits);

  it("reports nothing new when the sheet only uses what exists", () => {
    const result = plan([row()]);
    expect(result.newCategories).toEqual([]);
    expect(result.newBrands).toEqual([]);
    expect(result.newUnits).toEqual([]);
  });

  it("collects a new unit per kind", () => {
    const result = plan([
      row({ "Consumption Unit": "leaf", "Purchase Unit": "crate" }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.newUnits).toEqual([
      { name: "leaf", kind: "consumption" },
      { name: "crate", kind: "purchase" },
    ]);
  });

  it("keeps the two unit lists apart", () => {
    // "kg" is a known purchase unit but not a consumption one, so using it as
    // a consumption unit adds it to that list rather than reading as known.
    const result = plan([row({ "Consumption Unit": "kg" })]);
    expect(result.newUnits).toEqual([{ name: "kg", kind: "consumption" }]);
  });

  it("matches existing names case-insensitively rather than duplicating", () => {
    const result = plan([
      row({ Category: "VEGETABLES", Brand: "amul", "Purchase Unit": "KG" }),
    ]);
    expect(result.newCategories).toEqual([]);
    expect(result.newBrands).toEqual([]);
    expect(result.newUnits).toEqual([]);
    expect(result.creates[0].categoryId).toBe("cat-veg");
    expect(result.creates[0].brandId).toBe("brand-amul");
  });

  it("adds one entry for a name the sheet spells in two cases", () => {
    const result = plan([
      row({ Name: "A", Category: "Frozen" }),
      row({ Name: "B", Category: "FROZEN" }),
    ]);
    expect(result.creates).toHaveLength(2);
    expect(result.newCategories).toEqual(["Frozen"]);
  });

  it("gives both rows the same placeholder id for one new category", () => {
    const result = plan([
      row({ Name: "A", Category: "Frozen" }),
      row({ Name: "B", Category: "Frozen" }),
    ]);
    expect(result.creates[0].categoryId).toBe(result.creates[1].categoryId);
  });

  it("still rejects a blank category — that row forgot to say what it is", () => {
    const result = plan([row({ Category: "" })]);
    expect(result.creates).toHaveLength(0);
    expect(result.errors[0].message).toBe("Category is required");
    expect(result.newCategories).toEqual([]);
  });

  it("does not add lookups for a row that fails for another reason", () => {
    // The conversion is junk, so this row never imports — and must not drag a
    // new category, brand or unit into existence on its way out.
    const result = plan([
      row({
        Category: "Frozen",
        Brand: "Nestle",
        "Consumption Unit": "leaf",
        "Unit Conversion": "abc",
      }),
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.newCategories).toEqual([]);
    expect(result.newBrands).toEqual([]);
    expect(result.newUnits).toEqual([]);
  });

  it("does not add a lookup only a duplicate row referenced", () => {
    const result = plan([
      row({ Name: "Toor Dal" }),
      row({ Name: "Toor Dal", Category: "Frozen" }),
    ]);
    expect(result.errors[0].message).toBe("Duplicate name in this file");
    expect(result.newCategories).toEqual([]);
  });

  it("treats a blank brand as unbranded, not as a new brand", () => {
    const result = plan([row({ Brand: "   " })]);
    expect(result.newBrands).toEqual([]);
    expect(result.creates[0].brandId).toBe("");
    expect(result.creates[0].brandName).toBe("");
  });

  it("collects everything new across a mixed sheet", () => {
    const result = plan([
      row({ Name: "A", Category: "Frozen", Brand: "Nestle" }),
      row({ Name: "B", Category: "Bakery", "Purchase Unit": "crate" }),
      row({ Name: "C" }),
    ]);
    expect(result.creates).toHaveLength(3);
    expect(result.newCategories).toEqual(["Frozen", "Bakery"]);
    expect(result.newBrands).toEqual(["Nestle"]);
    expect(result.newUnits).toEqual([{ name: "crate", kind: "purchase" }]);
  });
});
