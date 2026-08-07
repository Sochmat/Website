// Turning demand into stock that has actually left the shelf.
//
// The Mongo half of src/lib/recipeDemand.ts, shared by both counters: a
// delivered website order and an uploaded Petpooja item list spend stock the
// same way, and record the same shape of trail.

import type { Db } from "mongodb";
import {
  ITEM_RECIPES_COLLECTION,
  PRODUCTION_ITEMS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  drawDownStock,
} from "@/lib/inventoryDb";
import { demandByRefType, type ComponentDemand } from "@/lib/recipeDemand";
import { recipesByNameKey } from "@/lib/menuRecipes";
import { toItemRecipeLines, type ItemRecipe } from "@/lib/itemRecipes";
import type { AuditLine } from "@/lib/stockAudits";
import { roundCurrency } from "@/lib/productionItems";

/** What a spend did, per kind of stock, with its headline figures. */
export interface SpentStock {
  productionLines: AuditLine[];
  rawLines: AuditLine[];
  /** Stock rows written, across both kinds. */
  rowCount: number;
  /** Rows the shelf could not cover in full — see AuditLine.shortfall. */
  shortfallRows: number;
  /**
   * What left the shelf, in money. Signed like an audit's netCost — negative,
   * because stock went out. null = not one row could be priced, which is a
   * different statement from "this came to nothing".
   */
  netCost: number | null;
}

/**
 * Item recipes, keyed the way a menu-item name resolves to one.
 *
 * Everything the demand walk reads is loaded, and nothing is narrowed on the
 * way in: `variantKey` is what separates a Large's recipe from the base one it
 * would otherwise overwrite, an `item` line is expanded rather than mistaken
 * for a raw material, and packaging is deducted alongside the components.
 */
export async function loadItemRecipesByNameKey(
  db: Db,
): Promise<Map<string, ItemRecipe>> {
  const docs = await db
    .collection(ITEM_RECIPES_COLLECTION)
    .find(
      {},
      {
        projection: {
          name: 1,
          nameKey: 1,
          variantName: 1,
          variantKey: 1,
          lines: 1,
          packagingLines: 1,
        },
      },
    )
    .toArray();

  const recipes: ItemRecipe[] = docs.map((d) => ({
    _id: String(d._id),
    name: String(d.name ?? ""),
    nameKey: String(d.nameKey ?? ""),
    variantName: String(d.variantName ?? ""),
    variantKey: String(d.variantKey ?? ""),
    lines: toItemRecipeLines(d.lines),
    packagingLines: toItemRecipeLines(d.packagingLines),
    // Costing is irrelevant here; the draw-down prices each line itself, from
    // the item's own rate at the moment stock moves.
    totalCost: 0,
  }));

  return recipesByNameKey(recipes);
}

/** What one set of draw-down lines came to. */
function summarize(lines: AuditLine[]): {
  shortfallRows: number;
  cost: number | null;
} {
  const valued = lines.filter((l) => typeof l.changeCost === "number");
  return {
    shortfallRows: lines.filter((l) => (l.shortfall ?? 0) > 0).length,
    cost: valued.length
      ? roundCurrency(valued.reduce((sum, l) => sum + (l.changeCost as number), 0))
      : null,
  };
}

/**
 * Take the demand off the shelves.
 *
 * Production items first: they are the finished thing that left the kitchen.
 * Raw materials follow, so a failure between the two leaves the more visible
 * half done rather than neither.
 */
export async function spendComponentDemand(
  db: Db,
  demand: ComponentDemand[],
  at: Date,
): Promise<SpentStock> {
  const productionLines = await drawDownStock(
    db,
    PRODUCTION_ITEMS_COLLECTION,
    demandByRefType(demand, "production"),
    at,
  );
  const rawLines = await drawDownStock(
    db,
    RAW_MATERIALS_COLLECTION,
    demandByRefType(demand, "raw"),
    at,
  );

  const production = summarize(productionLines);
  const raw = summarize(rawLines);

  return {
    productionLines,
    rawLines,
    rowCount: productionLines.length + rawLines.length,
    shortfallRows: production.shortfallRows + raw.shortfallRows,
    netCost:
      production.cost === null && raw.cost === null
        ? null
        : roundCurrency((production.cost ?? 0) + (raw.cost ?? 0)),
  };
}
