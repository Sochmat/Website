// ExcelJS glue for the production-item and item-recipe import/export.
//
// Server-only: ExcelJS is a Node library, so these run inside route handlers.
// The reconciliation rules live in src/lib/recipeImport.ts (pure, tested) —
// this file only turns workbooks into rows and rows into workbooks.

import ExcelJS from "exceljs";
import {
  COMPONENT_TYPE_LABELS,
  ITEM_RECIPE_COLUMNS,
  ITEM_RECIPE_COMPONENT_COLUMNS,
  ITEM_RECIPE_COMPONENT_SHEET,
  ITEM_RECIPE_PACKAGING_COLUMNS,
  ITEM_RECIPE_PACKAGING_SHEET,
  ITEM_RECIPE_REQUIRED_COLUMNS,
  ITEM_RECIPE_SHEET,
  PRODUCTION_ITEM_COLUMNS,
  PRODUCTION_ITEM_REQUIRED_COLUMNS,
  PRODUCTION_ITEM_SHEET,
  PRODUCTION_RECIPE_COLUMNS,
  PRODUCTION_RECIPE_READ_COLUMNS,
  PRODUCTION_RECIPE_REQUIRED_COLUMNS,
  PRODUCTION_RECIPE_SHEET,
  type RecipeImportRowError,
} from "@/lib/recipeImport";
import { addHeader, applyWidths, readSheetRows } from "@/lib/sheetUtils";
import type { SheetRow } from "@/lib/rawMaterials";
import type { ProductionItem } from "@/lib/productionItems";
import { componentKey, type ItemRecipe } from "@/lib/itemRecipes";

const PRODUCTION_ITEM_WIDTHS = [28, 18, 16, 16, 18, 14, 20];
const PRODUCTION_RECIPE_WIDTHS = [28, 18, 30, 14];
const ITEM_RECIPE_WIDTHS = [32, 16, 20];
const ITEM_RECIPE_COMPONENT_WIDTHS = [30, 16, 18, 30, 14];
const ITEM_RECIPE_PACKAGING_WIDTHS = [30, 16, 30, 14];

/** Case-insensitive sheet lookup — Excel preserves case, users don't. */
function findSheet(
  wb: ExcelJS.Workbook,
  name: string,
): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find(
    (w) => w.name.trim().toLowerCase() === name.toLowerCase(),
  );
}

async function load(
  data: ArrayBuffer,
): Promise<{ wb?: ExcelJS.Workbook; error?: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return { error: "Could not read that file — is it a valid .xlsx?" };
  }
  return { wb };
}

function newSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: readonly string[],
  widths: readonly number[],
): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet(name);
  addHeader(sheet, columns);
  applyWidths(sheet, widths);
  return sheet;
}

/** Shared closing note on both templates. */
function addValidNames(
  notes: ExcelJS.Worksheet,
  heading: string,
  names: string[],
  emptyNote: string,
) {
  notes.addRow([""]);
  notes.addRow([heading]);
  if (names.length) notes.addRows(names.map((n) => [`  ${n}`]));
  else notes.addRow([`  ${emptyNote}`]);
}

// ---------------------------------------------------------------------------
// Production items
// ---------------------------------------------------------------------------

/**
 * Export production items to xlsx.
 *
 * Components are written as their *name*, not their id — the sheet has to be
 * editable by a human, and the importer resolves names back to ids. A recipe
 * line whose component has since been deleted is written with a blank name,
 * which fails that row on re-import rather than quietly dropping it.
 *
 * Type is written alongside, because a raw material and a production item may
 * share a name and are looked up in different lists.
 */
export async function buildProductionWorkbook(
  items: ProductionItem[],
  componentNameByKey: ComponentNames,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const itemSheet = newSheet(
    wb,
    PRODUCTION_ITEM_SHEET,
    PRODUCTION_ITEM_COLUMNS,
    PRODUCTION_ITEM_WIDTHS,
  );
  const recipeSheet = newSheet(
    wb,
    PRODUCTION_RECIPE_SHEET,
    PRODUCTION_RECIPE_COLUMNS,
    PRODUCTION_RECIPE_WIDTHS,
  );

  for (const item of items) {
    itemSheet.addRow([
      item.name,
      item.consumptionUnit,
      item.purchaseUnit,
      item.unitConversion,
      item.batchYieldQty,
      item.alertQty ?? 0,
      item.pricePerPurchaseUnit,
    ]);
    for (const line of item.recipe) {
      recipeSheet.addRow([
        item.name,
        COMPONENT_TYPE_LABELS[line.refType],
        componentNameByKey.get(componentKey(line.refType, line.refId)) ?? "",
        line.qtyUsed,
      ]);
    }
  }

  itemSheet.getColumn(7).numFmt = "#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Blank upload template, with an example item and its two recipe lines. */
export async function buildProductionTemplateWorkbook(
  materialNames: string[],
  productionNames: string[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const itemSheet = newSheet(
    wb,
    PRODUCTION_ITEM_SHEET,
    PRODUCTION_ITEM_COLUMNS,
    PRODUCTION_ITEM_WIDTHS,
  );
  const recipeSheet = newSheet(
    wb,
    PRODUCTION_RECIPE_SHEET,
    PRODUCTION_RECIPE_COLUMNS,
    PRODUCTION_RECIPE_WIDTHS,
  );

  const exampleA = materialNames[0] ?? "Toor Dal";
  const exampleB = materialNames[1] ?? "Onion";
  const exampleProduction = productionNames[0] ?? "Masala Base";

  itemSheet.addRow(["Dal Tadka Base", "gm", "kg", 1000, 5000, 500, ""]);
  itemSheet.getRow(2).font = { italic: true, color: { argb: "FF888888" } };

  recipeSheet.addRow([
    "Dal Tadka Base",
    COMPONENT_TYPE_LABELS.raw,
    exampleA,
    250,
  ]);
  recipeSheet.addRow([
    "Dal Tadka Base",
    COMPONENT_TYPE_LABELS.raw,
    exampleB,
    400,
  ]);
  // A recipe may be built on something the kitchen already makes.
  recipeSheet.addRow([
    "Dal Tadka Base",
    COMPONENT_TYPE_LABELS.production,
    exampleProduction,
    120,
  ]);
  for (const n of [2, 3, 4]) {
    recipeSheet.getRow(n).font = { italic: true, color: { argb: "FF888888" } };
  }

  const notes = wb.addWorksheet("Instructions");
  notes.getColumn(1).width = 100;
  notes.addRows([
    ["How to use this template"],
    [""],
    ["1. Delete the example rows on BOTH sheets before uploading."],
    [`2. '${PRODUCTION_ITEM_SHEET}' lists the items; '${PRODUCTION_RECIPE_SHEET}' lists what goes into them.`],
    ["   Item Name links the two — spell it identically on both sheets."],
    ["3. Item Name is matched against existing production items, ignoring case"],
    ["   and spacing. A match updates that item; no match creates a new one."],
    ["4. An item's recipe is REPLACED by its rows on the Recipe sheet. Every"],
    ["   item on the items sheet needs at least one recipe row."],
    [`5. Type must be "${COMPONENT_TYPE_LABELS.raw}" or "${COMPONENT_TYPE_LABELS.production}", and Component must`],
    ["   match a name from the matching list below. Leave Type blank and it is"],
    [`   read as "${COMPONENT_TYPE_LABELS.raw}", so sheets exported before this column existed still upload.`],
    ["   A production item may be built on another production item, but not on"],
    ["   itself — directly or through a chain, which the importer rejects."],
    ["6. Unit Conversion is how many consumption units make one purchase unit."],
    ["   Example: purchase in kg, consume in gm, conversion 1000."],
    ["7. Batch Yield Qty is how much one batch of the recipe makes, in the"],
    ["   consumption unit."],
    ["8. Alert Qty is optional — leave it blank for no low-stock threshold."],
    ["9. 'Price (calculated)' is ignored on upload. The price is always derived"],
    ["   from the recipe, so editing it has no effect."],
    ["10. Stock on hand is never touched by an upload — use the Audit page."],
  ]);
  notes.getRow(1).font = { bold: true, size: 14 };
  addValidNames(
    notes,
    `Valid components — Type "${COMPONENT_TYPE_LABELS.raw}":`,
    materialNames,
    "(none yet — add raw materials before importing production items)",
  );
  addValidNames(
    notes,
    `Valid components — Type "${COMPONENT_TYPE_LABELS.production}":`,
    productionNames,
    "(none yet)",
  );

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseProductionWorkbook(data: ArrayBuffer): Promise<{
  itemRows: SheetRow[];
  recipeRows: SheetRow[];
  error?: string;
}> {
  const empty = { itemRows: [], recipeRows: [] };
  const { wb, error } = await load(data);
  if (!wb) return { ...empty, error };

  const itemSheet = findSheet(wb, PRODUCTION_ITEM_SHEET);
  if (!itemSheet) {
    return { ...empty, error: `The workbook has no "${PRODUCTION_ITEM_SHEET}" sheet` };
  }
  const recipeSheet = findSheet(wb, PRODUCTION_RECIPE_SHEET);
  if (!recipeSheet) {
    return { ...empty, error: `The workbook has no "${PRODUCTION_RECIPE_SHEET}" sheet` };
  }

  const items = readSheetRows(
    itemSheet,
    PRODUCTION_ITEM_COLUMNS,
    PRODUCTION_ITEM_REQUIRED_COLUMNS,
  );
  if (items.error) return { ...empty, error: items.error };

  const recipe = readSheetRows(
    recipeSheet,
    PRODUCTION_RECIPE_READ_COLUMNS,
    PRODUCTION_RECIPE_REQUIRED_COLUMNS,
  );
  if (recipe.error) return { ...empty, error: recipe.error };

  return { itemRows: items.rows, recipeRows: recipe.rows };
}

// ---------------------------------------------------------------------------
// Item recipes
// ---------------------------------------------------------------------------

/** Display name for every component an item recipe may reference, by `type:id`. */
export type ComponentNames = ReadonlyMap<string, string>;

/**
 * Export item recipes to xlsx — recipes, their components, their packaging.
 *
 * The Packaging sheet is always written, even with nothing on it: an upload
 * treats a present-but-empty sheet as "these recipes pack in nothing", so
 * leaving it out of an export with no packaging would make a round-trip of
 * that file mean something different from the file itself.
 */
export async function buildItemRecipeWorkbook(
  recipes: ItemRecipe[],
  componentNameByKey: ComponentNames,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const recipeSheet = newSheet(
    wb,
    ITEM_RECIPE_SHEET,
    ITEM_RECIPE_COLUMNS,
    ITEM_RECIPE_WIDTHS,
  );
  const componentSheet = newSheet(
    wb,
    ITEM_RECIPE_COMPONENT_SHEET,
    ITEM_RECIPE_COMPONENT_COLUMNS,
    ITEM_RECIPE_COMPONENT_WIDTHS,
  );
  const packagingSheet = newSheet(
    wb,
    ITEM_RECIPE_PACKAGING_SHEET,
    ITEM_RECIPE_PACKAGING_COLUMNS,
    ITEM_RECIPE_PACKAGING_WIDTHS,
  );

  for (const recipe of recipes) {
    // Blank Variant marks the item's base recipe; a size carries its label, so
    // the two come back as two recipes rather than merging into one.
    const variant = recipe.variantName ?? "";
    recipeSheet.addRow([recipe.name, variant, recipe.totalCost]);
    for (const line of recipe.lines) {
      componentSheet.addRow([
        recipe.name,
        variant,
        COMPONENT_TYPE_LABELS[line.refType],
        componentNameByKey.get(componentKey(line.refType, line.refId)) ?? "",
        line.qtyUsed,
      ]);
    }
    for (const line of recipe.packagingLines ?? []) {
      packagingSheet.addRow([
        recipe.name,
        variant,
        componentNameByKey.get(componentKey("raw", line.refId)) ?? "",
        line.qtyUsed,
      ]);
    }
  }

  recipeSheet.getColumn(3).numFmt = "#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildItemRecipeTemplateWorkbook(
  materialNames: string[],
  productionNames: string[],
  itemRecipeNames: string[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const recipeSheet = newSheet(
    wb,
    ITEM_RECIPE_SHEET,
    ITEM_RECIPE_COLUMNS,
    ITEM_RECIPE_WIDTHS,
  );
  const componentSheet = newSheet(
    wb,
    ITEM_RECIPE_COMPONENT_SHEET,
    ITEM_RECIPE_COMPONENT_COLUMNS,
    ITEM_RECIPE_COMPONENT_WIDTHS,
  );
  const packagingSheet = newSheet(
    wb,
    ITEM_RECIPE_PACKAGING_SHEET,
    ITEM_RECIPE_PACKAGING_COLUMNS,
    ITEM_RECIPE_PACKAGING_WIDTHS,
  );

  recipeSheet.addRow(["Veg Thali", "", ""]);
  recipeSheet.addRow(["Veg Thali", "Large", ""]);
  for (const n of [2, 3]) {
    recipeSheet.getRow(n).font = { italic: true, color: { argb: "FF888888" } };
  }

  componentSheet.addRow([
    "Veg Thali",
    "",
    COMPONENT_TYPE_LABELS.raw,
    materialNames[0] ?? "Onion",
    100,
  ]);
  componentSheet.addRow([
    "Veg Thali",
    "",
    COMPONENT_TYPE_LABELS.production,
    productionNames[0] ?? "Masala Base",
    250,
  ]);
  componentSheet.addRow([
    "Veg Thali",
    "",
    COMPONENT_TYPE_LABELS.item,
    itemRecipeNames[0] ?? "Plain Rice",
    1,
  ]);
  // The same dish at a bigger size: same components, more of them.
  componentSheet.addRow([
    "Veg Thali",
    "Large",
    COMPONENT_TYPE_LABELS.raw,
    materialNames[0] ?? "Onion",
    150,
  ]);
  for (const n of [2, 3, 4, 5]) {
    componentSheet.getRow(n).font = {
      italic: true,
      color: { argb: "FF888888" },
    };
  }

  // Both sizes go out in the same box, which is why each carries its own row
  // rather than the base recipe's standing in for the pair.
  packagingSheet.addRow(["Veg Thali", "", materialNames[0] ?? "Meal Tray", 1]);
  packagingSheet.addRow(["Veg Thali", "Large", materialNames[0] ?? "Meal Tray", 1]);
  for (const n of [2, 3]) {
    packagingSheet.getRow(n).font = {
      italic: true,
      color: { argb: "FF888888" },
    };
  }

  const notes = wb.addWorksheet("Instructions");
  notes.getColumn(1).width = 100;
  notes.addRows([
    ["How to use this template"],
    [""],
    ["1. Delete the example rows on ALL THREE sheets before uploading."],
    [`2. '${ITEM_RECIPE_SHEET}' lists the recipes; '${ITEM_RECIPE_COMPONENT_SHEET}' lists what goes into them;`],
    [`   '${ITEM_RECIPE_PACKAGING_SHEET}' lists what they go out in.`],
    ["   Recipe Name links them — spell it identically on every sheet."],
    ["3. Name is matched against existing item recipes, ignoring case and"],
    ["   spacing. A match updates that recipe; no match creates a new one."],
    ["3a. Variant is the size, for items that have them — leave it BLANK for the"],
    ["   item's own recipe. A size with its own row is deducted at that size;"],
    ["   one with no row follows the blank-Variant recipe. Name + Variant"],
    ["   together identify a recipe, so the same Name may appear once per size."],
    ["4. A recipe's components are REPLACED by its rows on the Components"],
    ["   sheet. Every recipe needs at least one component row."],
    [`5. Type must be "${COMPONENT_TYPE_LABELS.raw}", "${COMPONENT_TYPE_LABELS.production}" or "${COMPONENT_TYPE_LABELS.item}".`],
    ["   It decides which list the Component name is looked up in, so a raw"],
    ["   material and a production item may safely share a name."],
    [`6. A "${COMPONENT_TYPE_LABELS.item}" is another recipe from this sheet — use it for a combo`],
    ["   rather than re-typing everything that item is made of. Selling the combo"],
    ["   deducts what the named item is made of. It must ALREADY exist: upload it"],
    ["   first, then upload the recipe that uses it."],
    [`7. Qty Used is in the component's own consumption unit. For a "${COMPONENT_TYPE_LABELS.item}"`],
    ["   it is a count of whole portions — 1, 2, 3 — never a fraction."],
    ["8. 'Costing (calculated)' is ignored on upload. The cost is always derived"],
    ["   from the components, so editing it has no effect."],
    [`9. '${ITEM_RECIPE_PACKAGING_SHEET}' is the container, lid, bag or cutlery an item goes out in.`],
    [`   Material must match a "${COMPONENT_TYPE_LABELS.raw}" name from the list below —`],
    ["   packaging is bought and stocked, never cooked, so there is no Type column."],
    ["10. Packaging is deducted from stock per portion sold, exactly like a"],
    ["   component, but it is NOT part of 'Costing (calculated)'. That figure is"],
    ["   food cost; packaging is costed on its own."],
    [`11. A recipe's packaging is REPLACED by its rows on the '${ITEM_RECIPE_PACKAGING_SHEET}' sheet,`],
    ["   so a recipe with no rows there ends up with no packaging. Unlike the"],
    [`   ${ITEM_RECIPE_COMPONENT_SHEET} sheet, that is allowed — plenty of items are not packed.`],
    [`12. Leaving the '${ITEM_RECIPE_PACKAGING_SHEET}' sheet out of the file ENTIRELY is different: stored`],
    ["   packaging is then left exactly as it is. That is what lets a file"],
    [`   exported before the '${ITEM_RECIPE_PACKAGING_SHEET}' sheet existed still upload safely.`],
    ["13. An item with sizes packs each size separately — give every Variant its"],
    ["   own row, even when they all use the same box."],
  ]);
  notes.getRow(1).font = { bold: true, size: 14 };
  addValidNames(
    notes,
    `Valid components — Type "${COMPONENT_TYPE_LABELS.raw}":`,
    materialNames,
    "(none yet)",
  );
  addValidNames(
    notes,
    `Valid components — Type "${COMPONENT_TYPE_LABELS.production}":`,
    productionNames,
    "(none yet)",
  );
  addValidNames(
    notes,
    `Valid components — Type "${COMPONENT_TYPE_LABELS.item}":`,
    itemRecipeNames,
    "(none yet — add item recipes before building one on another)",
  );
  // The same list as the raw materials above, repeated under its own heading:
  // whoever is filling in the Packaging sheet should not have to work out that
  // "Material" there and Type "Raw Material" here draw on one list.
  addValidNames(
    notes,
    `Valid materials — '${ITEM_RECIPE_PACKAGING_SHEET}' sheet:`,
    materialNames,
    "(none yet — add raw materials before mapping packaging)",
  );

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an item-recipe workbook.
 *
 * `packagingRows` comes back undefined when the workbook has no Packaging
 * sheet at all, which the importer reads as "says nothing about packaging" and
 * leaves the stored rows alone. A sheet that is present but has no data rows
 * comes back as an empty array, which means something quite different — see
 * planItemRecipeImport.
 */
export async function parseItemRecipeWorkbook(data: ArrayBuffer): Promise<{
  recipeRows: SheetRow[];
  componentRows: SheetRow[];
  packagingRows?: SheetRow[];
  error?: string;
}> {
  const empty = { recipeRows: [], componentRows: [] };
  const { wb, error } = await load(data);
  if (!wb) return { ...empty, error };

  const recipeSheet = findSheet(wb, ITEM_RECIPE_SHEET);
  if (!recipeSheet) {
    return { ...empty, error: `The workbook has no "${ITEM_RECIPE_SHEET}" sheet` };
  }
  const componentSheet = findSheet(wb, ITEM_RECIPE_COMPONENT_SHEET);
  if (!componentSheet) {
    return {
      ...empty,
      error: `The workbook has no "${ITEM_RECIPE_COMPONENT_SHEET}" sheet`,
    };
  }

  const recipes = readSheetRows(
    recipeSheet,
    ITEM_RECIPE_COLUMNS,
    ITEM_RECIPE_REQUIRED_COLUMNS,
  );
  if (recipes.error) return { ...empty, error: recipes.error };

  const components = readSheetRows(
    componentSheet,
    ITEM_RECIPE_COMPONENT_COLUMNS,
    ITEM_RECIPE_COMPONENT_COLUMNS,
  );
  if (components.error) return { ...empty, error: components.error };

  // Optional, unlike the two above: a workbook exported before this sheet
  // existed is still a valid upload.
  const packagingSheet = findSheet(wb, ITEM_RECIPE_PACKAGING_SHEET);
  let packagingRows: SheetRow[] | undefined;
  if (packagingSheet) {
    const packaging = readSheetRows(
      packagingSheet,
      ITEM_RECIPE_PACKAGING_COLUMNS,
      ITEM_RECIPE_PACKAGING_COLUMNS,
    );
    if (packaging.error) return { ...empty, error: packaging.error };
    packagingRows = packaging.rows;
  }

  return {
    recipeRows: recipes.rows,
    componentRows: components.rows,
    packagingRows,
  };
}

// ---------------------------------------------------------------------------
// Error report
// ---------------------------------------------------------------------------

/**
 * Error report for the rows the importer refused. Unlike the raw-material
 * version this carries a Sheet column, since a problem can sit on either half
 * of the workbook.
 */
export async function buildRecipeErrorReportWorkbook(
  errors: RecipeImportRowError[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Errors");
  addHeader(sheet, ["Sheet", "Row", "Name", "Problem"]);
  applyWidths(sheet, [22, 10, 30, 56]);
  for (const e of errors) {
    sheet.addRow([e.sheet, e.rowNumber, e.name, e.message]);
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
