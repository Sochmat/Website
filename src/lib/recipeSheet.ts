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
const ITEM_RECIPE_WIDTHS = [32, 20];
const ITEM_RECIPE_COMPONENT_WIDTHS = [30, 18, 30, 14];

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

  for (const recipe of recipes) {
    recipeSheet.addRow([recipe.name, recipe.totalCost]);
    for (const line of recipe.lines) {
      componentSheet.addRow([
        recipe.name,
        COMPONENT_TYPE_LABELS[line.refType],
        componentNameByKey.get(componentKey(line.refType, line.refId)) ?? "",
        line.qtyUsed,
      ]);
    }
  }

  recipeSheet.getColumn(2).numFmt = "#,##0.00";

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

  recipeSheet.addRow(["Veg Thali", ""]);
  recipeSheet.getRow(2).font = { italic: true, color: { argb: "FF888888" } };

  componentSheet.addRow([
    "Veg Thali",
    COMPONENT_TYPE_LABELS.raw,
    materialNames[0] ?? "Onion",
    100,
  ]);
  componentSheet.addRow([
    "Veg Thali",
    COMPONENT_TYPE_LABELS.production,
    productionNames[0] ?? "Masala Base",
    250,
  ]);
  componentSheet.addRow([
    "Veg Thali",
    COMPONENT_TYPE_LABELS.item,
    itemRecipeNames[0] ?? "Plain Rice",
    1,
  ]);
  for (const n of [2, 3, 4]) {
    componentSheet.getRow(n).font = {
      italic: true,
      color: { argb: "FF888888" },
    };
  }

  const notes = wb.addWorksheet("Instructions");
  notes.getColumn(1).width = 100;
  notes.addRows([
    ["How to use this template"],
    [""],
    ["1. Delete the example rows on BOTH sheets before uploading."],
    [`2. '${ITEM_RECIPE_SHEET}' lists the recipes; '${ITEM_RECIPE_COMPONENT_SHEET}' lists what goes into them.`],
    ["   Recipe Name links the two — spell it identically on both sheets."],
    ["3. Name is matched against existing item recipes, ignoring case and"],
    ["   spacing. A match updates that recipe; no match creates a new one."],
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

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseItemRecipeWorkbook(data: ArrayBuffer): Promise<{
  recipeRows: SheetRow[];
  componentRows: SheetRow[];
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

  return { recipeRows: recipes.rows, componentRows: components.rows };
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
