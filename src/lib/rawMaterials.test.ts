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

  it("names the offending category in the error message", () => {
    const plan = planImport(
      [sheetRow({ Category: "Frozen" })],
      categoryIdsByName,
      new Map(),
    );
    expect(plan.errors[0].message).toBe('Unknown category "Frozen"');
    expect(plan.creates).toHaveLength(0);
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

  it("names the offending brand rather than silently unbranding the row", () => {
    const plan = planImport(
      [sheetRow({ Brand: "Nestle" })],
      categoryIdsByName,
      new Map(),
      brandIdsByName,
    );
    expect(plan.errors[0].message).toBe('Unknown brand "Nestle"');
    expect(plan.creates).toHaveLength(0);
  });

  it("splits a mixed sheet into creates, updates and errors", () => {
    const existing = new Map([["toor dal", "id-1"]]);
    const plan = planImport(
      [
        sheetRow(),
        sheetRow({ Name: "Ghee", Category: "Dairy" }),
        sheetRow({ Name: "Bad", Category: "Nope" }),
      ],
      categoryIdsByName,
      existing,
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.creates).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
  });
});
