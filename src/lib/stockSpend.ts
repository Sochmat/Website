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
import { pricePerConsumptionUnit } from "@/lib/rawMaterials";
import { roundQty, type AuditLine } from "@/lib/stockAudits";
import {
  expandOnSpot,
  roundCurrency,
  toRecipeLines,
  type OnSpotItem,
} from "@/lib/productionItems";

/** What a spend did, per kind of stock, with its headline figures. */
export interface SpentStock {
  productionLines: AuditLine[];
  rawLines: AuditLine[];
  /**
   * Made-to-order items this spend passed through. Empty on almost every
   * spend, and always empty before any item was flagged on spot.
   *
   * Not counted in rowCount or netCost: nothing was drawn down for these, and
   * their value is the raw material's value counted a second time. The report
   * shows them as their own rows — see the consumption route.
   */
  onSpotLines: OnSpotLine[];
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

/**
 * An on-spot item, with what the consumption report needs to name it.
 *
 * Wider than OnSpotItem, which is only what the expansion reads. The extra
 * fields are snapshotted onto the trail at spend time for the same reason an
 * AuditLine snapshots them: a rename or a re-price afterwards must not rewrite
 * what an old entry says was made.
 */
export interface OnSpotProductionItem extends OnSpotItem {
  name: string;
  unit: string;
  /** Price of one consumption unit now; null when it cannot be valued. */
  unitCost: number | null;
}

/**
 * The production items that are made to order, keyed by id.
 *
 * Only the on-spot ones are loaded: everything else is drawn down as itself,
 * and an empty map is the common case that skips the expansion entirely. See
 * expandOnSpot for what having one means.
 */
export async function loadOnSpotProductionItems(
  db: Db,
): Promise<Map<string, OnSpotProductionItem>> {
  const docs = await db
    .collection(PRODUCTION_ITEMS_COLLECTION)
    .find(
      { onSpot: true },
      {
        projection: {
          name: 1,
          consumptionUnit: 1,
          recipe: 1,
          batchYieldQty: 1,
          pricePerPurchaseUnit: 1,
          unitConversion: 1,
        },
      },
    )
    .toArray();

  return new Map(
    docs.map((d) => [
      String(d._id),
      {
        name: String(d.name ?? ""),
        unit: String(d.consumptionUnit ?? ""),
        recipe: toRecipeLines(d.recipe),
        batchYieldQty: Number(d.batchYieldQty ?? 0),
        unitCost:
          pricePerConsumptionUnit({
            pricePerPurchaseUnit: Number(d.pricePerPurchaseUnit ?? 0),
            unitConversion: Number(d.unitConversion ?? 0),
          }) || null,
      },
    ]),
  );
}

/**
 * An on-spot item a spend passed through: made to order, never drawn down.
 *
 * Deliberately not an AuditLine. There is no shelf, so there is no previous or
 * closing quantity to state and no shortfall possible — only how much was made
 * and what it was worth.
 */
export interface OnSpotLine {
  id: string;
  name: string;
  unit: string;
  /** How much was made, in the item's consumption unit. Positive. */
  qty: number;
  /** What that came to, priced when it was made. null = no price on record. */
  cost: number | null;
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
 *
 * On-spot items are resolved away before anything is written: they are cooked
 * as the order lands, so what leaves the shelf is the raw material behind them,
 * never the item itself. Both sale counters spend through here, so neither has
 * to know that.
 */
export async function spendComponentDemand(
  db: Db,
  demand: ComponentDemand[],
  at: Date,
): Promise<SpentStock> {
  const onSpot = await loadOnSpotProductionItems(db);
  const expanded = onSpot.size
    ? expandOnSpot(demand, onSpot)
    : { demand, onSpotQty: new Map<string, number>() };
  const spendable = expanded.demand;

  // Recorded from the expansion itself, so the figure is the one that was
  // actually resolved away — never a second calculation that could disagree.
  const onSpotLines: OnSpotLine[] = [...expanded.onSpotQty]
    .map(([id, qty]) => {
      const item = onSpot.get(id);
      if (!item) return null;
      const made = roundQty(qty);
      return {
        id,
        name: item.name,
        unit: item.unit,
        qty: made,
        cost:
          item.unitCost === null ? null : roundCurrency(made * item.unitCost),
      };
    })
    .filter((line): line is OnSpotLine => line !== null);

  const productionLines = await drawDownStock(
    db,
    PRODUCTION_ITEMS_COLLECTION,
    demandByRefType(spendable, "production"),
    at,
  );
  const rawLines = await drawDownStock(
    db,
    RAW_MATERIALS_COLLECTION,
    demandByRefType(spendable, "raw"),
    at,
  );

  const production = summarize(productionLines);
  const raw = summarize(rawLines);

  return {
    productionLines,
    rawLines,
    onSpotLines,
    rowCount: productionLines.length + rawLines.length,
    shortfallRows: production.shortfallRows + raw.shortfallRows,
    netCost:
      production.cost === null && raw.cost === null
        ? null
        : roundCurrency((production.cost ?? 0) + (raw.cost ?? 0)),
  };
}
