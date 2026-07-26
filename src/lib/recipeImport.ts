// Spreadsheet import planning for production items and item recipes.
//
// Both are "a header record plus a variable-length recipe", which does not fit
// in one row, so each workbook carries two sheets: the items themselves, and
// the recipe lines keyed back to them by name. This module reconciles those two
// sheets against what is stored.
//
// Pure logic only — no Mongo, no ExcelJS (see recipeSheet.ts for those), same
// contract as rawMaterials.ts. Tested in recipeImport.test.ts.

import {
  normalizeMaterialName,
  type ImportRowError,
  type SheetRow,
} from "./rawMaterials";
import {
  sanitizeProductionItem,
  type CostingMaterial,
  type ProductionRecipeLine,
  type SanitizedProductionItem,
} from "./productionItems";
import {
  componentKey,
  sanitizeItemRecipe,
  type ComponentType,
  type ItemRecipeLine,
  type SanitizedItemRecipe,
} from "./itemRecipes";
import { ROW_NUMBER_KEY } from "./sheetUtils";

// ---------------------------------------------------------------------------
// Sheet shapes
// ---------------------------------------------------------------------------

export const PRODUCTION_ITEM_SHEET = "Production Items";
export const PRODUCTION_RECIPE_SHEET = "Recipe";

/**
 * "Price (calculated)" is exported for review and ignored on import — the
 * price is always derived from the recipe, so a hand-edited value would be
 * silently discarded. The column name says so.
 */
export const PRODUCTION_ITEM_COLUMNS = [
  "Item Name",
  "Consumption Unit",
  "Purchase Unit",
  "Unit Conversion",
  "Batch Yield Qty",
  "Alert Qty",
  "Price (calculated)",
] as const;

/** Alert Qty is optional (blank means "no threshold"), the derived price is
 *  ignored — neither has to be present for a sheet to import. */
export const PRODUCTION_ITEM_REQUIRED_COLUMNS = [
  "Item Name",
  "Consumption Unit",
  "Purchase Unit",
  "Unit Conversion",
  "Batch Yield Qty",
] as const;

export const PRODUCTION_RECIPE_COLUMNS = [
  "Item Name",
  "Raw Material",
  "Qty Used",
] as const;

export const ITEM_RECIPE_SHEET = "Item Recipes";
export const ITEM_RECIPE_COMPONENT_SHEET = "Components";

export const ITEM_RECIPE_COLUMNS = ["Name", "Costing (calculated)"] as const;
export const ITEM_RECIPE_REQUIRED_COLUMNS = ["Name"] as const;

export const ITEM_RECIPE_COMPONENT_COLUMNS = [
  "Recipe Name",
  "Type",
  "Component",
  "Qty Used",
] as const;

/** What goes in the Type column of the Components sheet. */
export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  raw: "Raw Material",
  production: "Production Item",
};

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** An import error, tagged with which of the two sheets it came from. */
export interface RecipeImportRowError extends ImportRowError {
  sheet: string;
}

/** Accepts "1,000" and " 12.5 "; rejects "" and "abc". */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The worksheet row this came from, falling back to its array position. */
function rowNumberOf(row: SheetRow, index: number): number {
  const stamped = Number(row[ROW_NUMBER_KEY]);
  // +2: one for the header row, one to make it 1-indexed like Excel.
  return Number.isFinite(stamped) && stamped > 0 ? stamped : index + 2;
}

/** Tolerant of "raw", "Raw Material", "production", "Production Item". */
function parseComponentType(value: unknown): ComponentType | null {
  const t = text(value).toLowerCase();
  if (t === "raw" || t === "raw material") return "raw";
  if (t === "production" || t === "production item") return "production";
  return null;
}

/** Recipe lines collected for one header record, plus where they came from. */
interface LineGroup<T> {
  lines: T[];
  /** First sheet row mentioning this name — used to place an orphan error. */
  rowNumber: number;
  /** The name as the user typed it, for readable messages. */
  name: string;
}

// ---------------------------------------------------------------------------
// Production items
// ---------------------------------------------------------------------------

export interface ProductionImportPlan {
  creates: SanitizedProductionItem[];
  updates: (SanitizedProductionItem & { _id: string })[];
  errors: RecipeImportRowError[];
}

/**
 * Reconcile a production-item workbook against what's stored.
 *
 * Matching is by normalized name, as for raw materials: a renamed item imports
 * as a new record rather than silently rewriting an unrelated one.
 *
 * An item whose Recipe rows contain *any* bad row is rejected whole rather than
 * imported short. A partially-read recipe would cost out to a plausible-looking
 * number that is simply wrong, and nothing downstream would flag it.
 *
 * @param rawMaterialIdsByNameKey normalizeMaterialName(name) -> raw material id
 * @param existingIdsByNameKey    nameKey -> existing production item id
 * @param materialsById           costing inputs, also the set of valid ids
 */
export function planProductionImport(
  itemRows: SheetRow[],
  recipeRows: SheetRow[],
  rawMaterialIdsByNameKey: ReadonlyMap<string, string>,
  existingIdsByNameKey: ReadonlyMap<string, string>,
  materialsById: ReadonlyMap<string, CostingMaterial>,
): ProductionImportPlan {
  const plan: ProductionImportPlan = { creates: [], updates: [], errors: [] };

  const groups = new Map<string, LineGroup<ProductionRecipeLine>>();
  const brokenItems = new Set<string>();
  // `${itemKey}|${rawMaterialId}` — one line per material per item, or the
  // quantity is ambiguous.
  const seenLine = new Set<string>();

  recipeRows.forEach((row, index) => {
    const rowNumber = rowNumberOf(row, index);
    const itemName = text(row["Item Name"]);
    const itemKey = itemName ? normalizeMaterialName(itemName) : "";

    const fail = (message: string) => {
      plan.errors.push({
        sheet: PRODUCTION_RECIPE_SHEET,
        rowNumber,
        name: itemName,
        message,
      });
      // Poison the whole item, not just this line — see the doc comment.
      if (itemKey) brokenItems.add(itemKey);
    };

    if (!itemName) return fail("Item Name is required");

    const materialName = text(row["Raw Material"]);
    if (!materialName) return fail("Raw Material is required");
    const rawMaterialId = rawMaterialIdsByNameKey.get(
      normalizeMaterialName(materialName),
    );
    if (!rawMaterialId) {
      return fail(`Unknown raw material "${materialName}"`);
    }

    const qtyUsed = toNumber(row["Qty Used"]);
    if (qtyUsed === null) return fail("Qty Used is required");
    if (qtyUsed <= 0) return fail("Qty Used must be greater than 0");

    const lineKey = `${itemKey}|${rawMaterialId}`;
    if (seenLine.has(lineKey)) {
      return fail(`"${materialName}" is listed twice for this item`);
    }
    seenLine.add(lineKey);

    const group = groups.get(itemKey) ?? {
      lines: [],
      rowNumber,
      name: itemName,
    };
    group.lines.push({ rawMaterialId, qtyUsed });
    groups.set(itemKey, group);
  });

  const claimed = new Set<string>();
  const seenItem = new Set<string>();

  itemRows.forEach((row, index) => {
    const rowNumber = rowNumberOf(row, index);
    const name = text(row["Item Name"]);
    const fail = (message: string) =>
      plan.errors.push({
        sheet: PRODUCTION_ITEM_SHEET,
        rowNumber,
        name,
        message,
      });

    if (!name) return fail("Item Name is required");

    const key = normalizeMaterialName(name);
    claimed.add(key);

    if (seenItem.has(key)) return fail("Duplicate item name in this file");
    seenItem.add(key);

    if (brokenItems.has(key)) {
      return fail(`Skipped — it has bad rows on the ${PRODUCTION_RECIPE_SHEET} sheet`);
    }

    const recipe = groups.get(key)?.lines ?? [];
    if (recipe.length === 0) {
      return fail(`No rows for "${name}" on the ${PRODUCTION_RECIPE_SHEET} sheet`);
    }

    const { doc, error } = sanitizeProductionItem(
      {
        name,
        consumptionUnit: row["Consumption Unit"],
        purchaseUnit: row["Purchase Unit"],
        unitConversion: row["Unit Conversion"],
        batchYieldQty: row["Batch Yield Qty"],
        // Blank means "no threshold" — sanitize treats a null as 0.
        alertQty: row["Alert Qty"],
        recipe,
      },
      materialsById,
      normalizeMaterialName,
    );
    if (error || !doc) return fail(error ?? "Invalid row");

    const existingId = existingIdsByNameKey.get(doc.nameKey);
    if (existingId) plan.updates.push({ ...doc, _id: existingId });
    else plan.creates.push(doc);
  });

  // Recipe rows for an item that never appears on the items sheet would
  // otherwise be dropped without a word.
  for (const [key, group] of groups) {
    if (claimed.has(key) || brokenItems.has(key)) continue;
    plan.errors.push({
      sheet: PRODUCTION_RECIPE_SHEET,
      rowNumber: group.rowNumber,
      name: group.name,
      message: `No matching row on the ${PRODUCTION_ITEM_SHEET} sheet`,
    });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Item recipes
// ---------------------------------------------------------------------------

export interface ItemRecipeImportPlan {
  creates: SanitizedItemRecipe[];
  updates: (SanitizedItemRecipe & { _id: string })[];
  errors: RecipeImportRowError[];
}

/**
 * Reconcile an item-recipe workbook against what's stored.
 *
 * Same rules as planProductionImport, with one addition: a component row names
 * a Type as well as a name, because a raw material and a production item may
 * legitimately share a name and the two are costed from different collections.
 *
 * @param rawMaterialIdsByNameKey     nameKey -> raw material id
 * @param productionItemIdsByNameKey  nameKey -> production item id
 * @param existingIdsByNameKey        nameKey -> existing item recipe id
 * @param componentsByKey             costing inputs keyed `type:id`
 */
export function planItemRecipeImport(
  recipeRows: SheetRow[],
  componentRows: SheetRow[],
  rawMaterialIdsByNameKey: ReadonlyMap<string, string>,
  productionItemIdsByNameKey: ReadonlyMap<string, string>,
  existingIdsByNameKey: ReadonlyMap<string, string>,
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
): ItemRecipeImportPlan {
  const plan: ItemRecipeImportPlan = { creates: [], updates: [], errors: [] };

  const groups = new Map<string, LineGroup<ItemRecipeLine>>();
  const brokenRecipes = new Set<string>();
  const seenLine = new Set<string>();

  componentRows.forEach((row, index) => {
    const rowNumber = rowNumberOf(row, index);
    const recipeName = text(row["Recipe Name"]);
    const recipeKey = recipeName ? normalizeMaterialName(recipeName) : "";

    const fail = (message: string) => {
      plan.errors.push({
        sheet: ITEM_RECIPE_COMPONENT_SHEET,
        rowNumber,
        name: recipeName,
        message,
      });
      if (recipeKey) brokenRecipes.add(recipeKey);
    };

    if (!recipeName) return fail("Recipe Name is required");

    const refType = parseComponentType(row["Type"]);
    if (!refType) {
      return fail(
        `Type must be "${COMPONENT_TYPE_LABELS.raw}" or "${COMPONENT_TYPE_LABELS.production}"`,
      );
    }

    const componentName = text(row["Component"]);
    if (!componentName) return fail("Component is required");
    const lookup =
      refType === "raw" ? rawMaterialIdsByNameKey : productionItemIdsByNameKey;
    const refId = lookup.get(normalizeMaterialName(componentName));
    if (!refId) {
      return fail(
        `Unknown ${COMPONENT_TYPE_LABELS[refType].toLowerCase()} "${componentName}"`,
      );
    }

    const qtyUsed = toNumber(row["Qty Used"]);
    if (qtyUsed === null) return fail("Qty Used is required");
    if (qtyUsed <= 0) return fail("Qty Used must be greater than 0");

    const lineKey = `${recipeKey}|${componentKey(refType, refId)}`;
    if (seenLine.has(lineKey)) {
      return fail(`"${componentName}" is listed twice for this recipe`);
    }
    seenLine.add(lineKey);

    const group = groups.get(recipeKey) ?? {
      lines: [],
      rowNumber,
      name: recipeName,
    };
    group.lines.push({ refType, refId, qtyUsed });
    groups.set(recipeKey, group);
  });

  const claimed = new Set<string>();
  const seenRecipe = new Set<string>();

  recipeRows.forEach((row, index) => {
    const rowNumber = rowNumberOf(row, index);
    const name = text(row["Name"]);
    const fail = (message: string) =>
      plan.errors.push({
        sheet: ITEM_RECIPE_SHEET,
        rowNumber,
        name,
        message,
      });

    if (!name) return fail("Name is required");

    const key = normalizeMaterialName(name);
    claimed.add(key);

    if (seenRecipe.has(key)) return fail("Duplicate name in this file");
    seenRecipe.add(key);

    if (brokenRecipes.has(key)) {
      return fail(
        `Skipped — it has bad rows on the ${ITEM_RECIPE_COMPONENT_SHEET} sheet`,
      );
    }

    const lines = groups.get(key)?.lines ?? [];
    if (lines.length === 0) {
      return fail(
        `No rows for "${name}" on the ${ITEM_RECIPE_COMPONENT_SHEET} sheet`,
      );
    }

    const { doc, error } = sanitizeItemRecipe(
      { name, lines },
      componentsByKey,
      normalizeMaterialName,
    );
    if (error || !doc) return fail(error ?? "Invalid row");

    const existingId = existingIdsByNameKey.get(doc.nameKey);
    if (existingId) plan.updates.push({ ...doc, _id: existingId });
    else plan.creates.push(doc);
  });

  for (const [key, group] of groups) {
    if (claimed.has(key) || brokenRecipes.has(key)) continue;
    plan.errors.push({
      sheet: ITEM_RECIPE_COMPONENT_SHEET,
      rowNumber: group.rowNumber,
      name: group.name,
      message: `No matching row on the ${ITEM_RECIPE_SHEET} sheet`,
    });
  }

  return plan;
}
