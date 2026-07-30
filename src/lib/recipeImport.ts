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

/**
 * Written by the export and the template.
 *
 * A recipe line names a Type as well as a Component, exactly as the item-recipe
 * sheet does, because a recipe may now be built on another production item and
 * the two lists are looked up separately.
 */
export const PRODUCTION_RECIPE_COLUMNS = [
  "Item Name",
  "Type",
  "Component",
  "Qty Used",
] as const;

/**
 * Accepted when reading. "Raw Material" is what the Component column used to
 * be called, back when that was the only thing a recipe could name — sheets
 * exported before this still upload, reading as raw material throughout.
 */
export const PRODUCTION_RECIPE_READ_COLUMNS = [
  ...PRODUCTION_RECIPE_COLUMNS,
  "Raw Material",
] as const;

/** Type defaults to Raw Material, and the component may sit in either column. */
export const PRODUCTION_RECIPE_REQUIRED_COLUMNS = [
  "Item Name",
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
 * Every name caught in a loop of production items, in the graph an import
 * would leave behind.
 *
 * Keyed by nameKey rather than id because a sheet's new items have no id yet,
 * and nameKey is what the importer matches on anyway. `sheetDeps` wins over
 * `storedDeps` for the items the sheet touches: an upload REPLACES a recipe,
 * so the stored one says nothing about where the item will point afterwards.
 *
 * Standard three-colour walk. Anything on the stack when an edge points back
 * into it is part of a cycle, and so is everything else on that stack above
 * it — all of them are rejected, since no one of them is more at fault.
 */
export function loopedNameKeys(
  storedDeps: ReadonlyMap<string, readonly string[]>,
  sheetDeps: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const deps = (key: string): readonly string[] =>
    sheetDeps.get(key) ?? storedDeps.get(key) ?? [];

  const looped = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const walk = (key: string) => {
    if (done.has(key)) return;
    if (onStack.has(key)) {
      // Everything from where this name sits on the stack, upward, is in it.
      for (let i = stack.lastIndexOf(key); i < stack.length; i++) {
        looped.add(stack[i]);
      }
      return;
    }
    stack.push(key);
    onStack.add(key);
    for (const next of deps(key)) walk(next);
    stack.pop();
    onStack.delete(key);
    done.add(key);
  };

  for (const key of new Set([...storedDeps.keys(), ...sheetDeps.keys()])) {
    walk(key);
  }
  return looped;
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
 * A recipe may name another production item, so the same loop rule the form
 * enforces applies here: an item that ends up made from itself, directly or
 * through a chain, is rejected along with everything else in that loop.
 *
 * @param rawMaterialIdsByNameKey     nameKey -> raw material id
 * @param productionItemIdsByNameKey  nameKey -> production item id
 * @param existingIdsByNameKey        nameKey -> existing production item id
 * @param componentsByKey             costing inputs keyed `type:id`
 * @param storedDepsByNameKey         nameKey -> production nameKeys it is
 *                                    already made from, for items the sheet
 *                                    does not touch
 */
export function planProductionImport(
  itemRows: SheetRow[],
  recipeRows: SheetRow[],
  rawMaterialIdsByNameKey: ReadonlyMap<string, string>,
  productionItemIdsByNameKey: ReadonlyMap<string, string>,
  existingIdsByNameKey: ReadonlyMap<string, string>,
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
  storedDepsByNameKey: ReadonlyMap<string, readonly string[]> = new Map(),
): ProductionImportPlan {
  const plan: ProductionImportPlan = { creates: [], updates: [], errors: [] };

  const groups = new Map<string, LineGroup<ProductionRecipeLine>>();
  const brokenItems = new Set<string>();
  // `${itemKey}|${type}:${refId}` — one line per component per item, or the
  // quantity is ambiguous.
  const seenLine = new Set<string>();
  // itemKey -> the production nameKeys its sheet rows name, for the loop check.
  const sheetDeps = new Map<string, string[]>();

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

    // Blank Type means Raw Material: that is all a recipe line could name
    // before, so a sheet that omits the column means what it always meant.
    const typeCell = text(row["Type"]);
    const refType = typeCell ? parseComponentType(typeCell) : "raw";
    if (!refType) {
      return fail(
        `Type must be "${COMPONENT_TYPE_LABELS.raw}" or "${COMPONENT_TYPE_LABELS.production}"`,
      );
    }

    // "Raw Material" is the column's old name — see PRODUCTION_RECIPE_READ_COLUMNS.
    const componentName = text(row["Component"]) || text(row["Raw Material"]);
    if (!componentName) return fail("Component is required");
    const componentNameKey = normalizeMaterialName(componentName);
    const lookup =
      refType === "raw" ? rawMaterialIdsByNameKey : productionItemIdsByNameKey;
    const refId = lookup.get(componentNameKey);
    if (!refId) {
      return fail(
        `Unknown ${COMPONENT_TYPE_LABELS[refType].toLowerCase()} "${componentName}"`,
      );
    }

    const qtyUsed = toNumber(row["Qty Used"]);
    if (qtyUsed === null) return fail("Qty Used is required");
    if (qtyUsed <= 0) return fail("Qty Used must be greater than 0");

    const lineKey = `${itemKey}|${componentKey(refType, refId)}`;
    if (seenLine.has(lineKey)) {
      return fail(`"${componentName}" is listed twice for this item`);
    }
    seenLine.add(lineKey);

    const group = groups.get(itemKey) ?? {
      lines: [],
      rowNumber,
      name: itemName,
    };
    group.lines.push({ refType, refId, qtyUsed });
    groups.set(itemKey, group);

    if (refType === "production") {
      sheetDeps.set(itemKey, [
        ...(sheetDeps.get(itemKey) ?? []),
        componentNameKey,
      ]);
    }
  });

  // The graph the finished import would leave behind: what the sheet says for
  // the items it touches, what is already stored for everything else.
  const looped = loopedNameKeys(storedDepsByNameKey, sheetDeps);

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

    if (looped.has(key)) {
      return fail(
        "Skipped — this item would end up made from itself, through the production items in its recipe",
      );
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
      componentsByKey,
      normalizeMaterialName,
      // Loops are checked above, across the whole batch — a per-row graph
      // could not see the one the sheet is about to create.
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
