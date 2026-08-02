import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildItemRecipeWorkbook,
  parseItemRecipeWorkbook,
} from "@/lib/recipeSheet";
import { planItemRecipeImport } from "@/lib/recipeImport";
import type { ItemRecipe } from "@/lib/itemRecipes";
import type { CostingMaterial } from "@/lib/productionItems";

// The export writes component NAMES and the import resolves them back to ids,
// so a round trip only holds if both halves agree on the same two maps.
const NAMES = new Map([
  ["raw:dal-id", "Toor Dal"],
  ["raw:tray-id", "Meal Tray"],
  ["raw:lid-id", "Tray Lid"],
]);

const RAW_IDS = new Map([
  ["toor dal", "dal-id"],
  ["meal tray", "tray-id"],
  ["tray lid", "lid-id"],
]);

const COMPONENTS = new Map<string, CostingMaterial>([
  ["raw:dal-id", { pricePerPurchaseUnit: 120, unitConversion: 1000 }],
  ["raw:tray-id", { pricePerPurchaseUnit: 8, unitConversion: 1 }],
  ["raw:lid-id", { pricePerPurchaseUnit: 3, unitConversion: 1 }],
]);

const recipe = (
  name: string,
  variantName: string | undefined,
  packagingLines: ItemRecipe["packagingLines"],
): ItemRecipe => ({
  _id: `r-${name}-${variantName ?? ""}`,
  name,
  nameKey: name.toLowerCase(),
  variantName,
  lines: [{ refType: "raw", refId: "dal-id", qtyUsed: 100 }],
  totalCost: 12,
  packagingLines,
});

/** Export, read back, and reconcile — what an edit-and-reupload really does. */
const roundTrip = async (recipes: ItemRecipe[]) => {
  const buffer = await buildItemRecipeWorkbook(recipes, NAMES);
  const parsed = await parseItemRecipeWorkbook(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer,
  );
  expect(parsed.error).toBeUndefined();

  return {
    parsed,
    plan: planItemRecipeImport(
      parsed.recipeRows,
      parsed.componentRows,
      RAW_IDS,
      new Map(),
      new Map(),
      COMPONENTS,
      undefined,
      new Map(),
      parsed.packagingRows,
    ),
  };
};

describe("item recipe workbook round trip", () => {
  it("brings packaging back unchanged", async () => {
    const { plan } = await roundTrip([
      recipe("Thali", undefined, [
        { refType: "raw", refId: "tray-id", qtyUsed: 1 },
        { refType: "raw", refId: "lid-id", qtyUsed: 1 },
      ]),
    ]);

    expect(plan.errors).toEqual([]);
    expect(plan.creates[0].packagingLines).toEqual([
      { refType: "raw", refId: "tray-id", qtyUsed: 1 },
      { refType: "raw", refId: "lid-id", qtyUsed: 1 },
    ]);
    // ₹8 tray + ₹3 lid, kept out of the ₹12 food cost.
    expect(plan.creates[0].packagingCost).toBe(11);
    expect(plan.creates[0].totalCost).toBe(12);
  });

  it("keeps each variant's packaging with its own size", async () => {
    const { plan } = await roundTrip([
      recipe("Thali", undefined, [
        { refType: "raw", refId: "tray-id", qtyUsed: 1 },
      ]),
      recipe("Thali", "Large", [{ refType: "raw", refId: "lid-id", qtyUsed: 2 }]),
    ]);

    expect(plan.errors).toEqual([]);
    expect(plan.creates[0].variantName).toBeUndefined();
    expect(plan.creates[0].packagingLines).toEqual([
      { refType: "raw", refId: "tray-id", qtyUsed: 1 },
    ]);
    expect(plan.creates[1].variantName).toBe("Large");
    expect(plan.creates[1].packagingLines).toEqual([
      { refType: "raw", refId: "lid-id", qtyUsed: 2 },
    ]);
  });

  // The sheet is written even when empty, so re-uploading an export of
  // packaging-free recipes states that fact rather than staying silent on it.
  it("writes the Packaging sheet even with nothing to put on it", async () => {
    const { parsed, plan } = await roundTrip([
      recipe("Thali", undefined, []),
    ]);

    expect(parsed.packagingRows).toEqual([]);
    expect(plan.creates[0].packagingLines).toEqual([]);
  });

  it("survives a recipe that has no packaging field at all", async () => {
    const { plan } = await roundTrip([recipe("Thali", undefined, undefined)]);

    expect(plan.errors).toEqual([]);
    expect(plan.creates[0].packagingLines).toEqual([]);
  });
});

describe("an item recipe workbook from before the Packaging sheet", () => {
  /** The two-sheet workbook every export produced until packaging existed. */
  const legacyWorkbook = async (): Promise<ArrayBuffer> => {
    const wb = new ExcelJS.Workbook();
    const recipes = wb.addWorksheet("Item Recipes");
    recipes.addRow(["Name", "Variant", "Costing (calculated)"]);
    recipes.addRow(["Thali", "", 12]);

    const components = wb.addWorksheet("Components");
    components.addRow([
      "Recipe Name",
      "Variant",
      "Type",
      "Component",
      "Qty Used",
    ]);
    components.addRow(["Thali", "", "Raw Material", "Toor Dal", 100]);

    return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  };

  it("still uploads", async () => {
    const parsed = await parseItemRecipeWorkbook(await legacyWorkbook());

    expect(parsed.error).toBeUndefined();
    expect(parsed.recipeRows).toHaveLength(1);
  });

  // The one that matters: an old sheet must not strip packaging off recipes
  // that have it, so the key never reaches the update at all.
  it("leaves stored packaging alone rather than clearing it", async () => {
    const parsed = await parseItemRecipeWorkbook(await legacyWorkbook());
    expect(parsed.packagingRows).toBeUndefined();

    const plan = planItemRecipeImport(
      parsed.recipeRows,
      parsed.componentRows,
      RAW_IDS,
      new Map(),
      new Map([["thali", "stored-id"]]),
      COMPONENTS,
      undefined,
      new Map(),
      parsed.packagingRows,
    );

    expect(plan.errors).toEqual([]);
    expect(plan.updates[0]).not.toHaveProperty("packagingLines");
    expect(plan.updates[0]).not.toHaveProperty("packagingCost");
  });
});
