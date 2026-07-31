// What selling a list of items takes off the shelves.
//
// Both counters feed this: an order delivered from the website, and a Petpooja
// item list uploaded as a sheet. Either way the input is the same — names and
// quantities sold — and each name resolves to an item recipe, matched by
// normalized name, the same link the Item Recipe screen shows. The recipe's
// components are drawn down by the quantity sold.
//
// Production items are NOT expanded into the raw material behind them. They
// are stocked in their own right, and their ingredients were already spent
// when the batch was recorded on the Add Stock screen; expanding here would
// deduct the same ingredient twice.
//
// Pure logic — see recipeDemand.test.ts.

import {
  componentKey,
  type ComponentType,
  type ItemRecipe,
} from "./itemRecipes";
import { isMapped } from "./menuRecipes";
import { normalizeMaterialName } from "./rawMaterials";

/** Something sold, named as the menu stands now. */
export interface SoldItem {
  /** Menu item name; blank when the product no longer exists. */
  name: string;
  quantity: number;
}

/** How much of one component a sale calls for. */
export interface ComponentDemand {
  refType: ComponentType;
  refId: string;
  /** In the component's own consumptionUnit. */
  qty: number;
}

export interface RecipeDemand {
  demand: ComponentDemand[];
  /**
   * Items sold with no usable recipe behind them, by name. Nothing is deducted
   * for these — an unwritten recipe is not the same as a free item, so they
   * are reported rather than silently costing nothing.
   */
  unmapped: string[];
}

/**
 * Everything a list of sales draws down, summed per component.
 *
 * Two items sharing an ingredient deduct once, and the same item sold twice
 * adds up — the caller sees one figure per component, which is what a single
 * write per row needs.
 *
 * Quantities that are missing, junk or non-positive contribute nothing: a line
 * that says nothing about how many were sold cannot say how much was consumed
 * either.
 */
export function componentDemand(
  items: SoldItem[],
  recipesByNameKey: ReadonlyMap<string, ItemRecipe>,
): RecipeDemand {
  const totals = new Map<string, ComponentDemand>();
  const unmapped: string[] = [];
  const unmappedSeen = new Set<string>();

  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const name = String(item?.name ?? "").trim();
    const recipe = name
      ? recipesByNameKey.get(normalizeMaterialName(name))
      : null;

    // An empty recipe counts as unmapped: it says someone opened the form,
    // not what the item is made of.
    if (!isMapped(recipe)) {
      const label = name || "Unknown product";
      if (!unmappedSeen.has(label)) {
        unmappedSeen.add(label);
        unmapped.push(label);
      }
      continue;
    }

    for (const line of recipe.lines) {
      const qtyUsed = Number(line?.qtyUsed);
      if (!line?.refId || !Number.isFinite(qtyUsed) || qtyUsed <= 0) continue;

      const key = componentKey(line.refType, line.refId);
      const existing = totals.get(key);
      if (existing) {
        existing.qty += qtyUsed * quantity;
      } else {
        totals.set(key, {
          refType: line.refType,
          refId: line.refId,
          qty: qtyUsed * quantity,
        });
      }
    }
  }

  return { demand: [...totals.values()], unmapped };
}

/** The demand for one kind of component, as an id -> quantity map. */
export function demandByRefType(
  demand: ComponentDemand[],
  refType: ComponentType,
): Map<string, number> {
  const owed = new Map<string, number>();
  for (const line of demand) {
    if (line.refType !== refType) continue;
    owed.set(line.refId, (owed.get(line.refId) ?? 0) + line.qty);
  }
  return owed;
}
