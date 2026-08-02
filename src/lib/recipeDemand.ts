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
// A recipe naming another recipe IS expanded, for the mirror of that reason: a
// food item holds no stock, it is only a definition, so the walk keeps going
// until it reaches something a shelf actually has. The rule underneath both is
// one and the same — stop at what is stocked, expand what is not.
//
// Packaging is deducted too, but only for the recipe actually SOLD — never for
// a recipe reached through an `item` line. A combo ships in the combo's box;
// the plates inside it were not packed separately, so pulling their packaging
// down as well would take boxes off the shelf that nobody used.
//
// Pure logic — see recipeDemand.test.ts.

import {
  componentKey,
  type ItemRecipe,
  type StockComponentType,
} from "./itemRecipes";
import { isMapped, recipeLookupKey } from "./menuRecipes";
import { normalizeMaterialName } from "./rawMaterials";

/** Something sold, named as the menu stands now. */
export interface SoldItem {
  /** Menu item name; blank when the product no longer exists. */
  name: string;
  /**
   * The variant ordered, when the item has variants. A Large plate is a
   * different quantity of the same things, so it resolves to its own recipe
   * where one has been written.
   */
  variantName?: string;
  quantity: number;
}

/** How much of one component a sale calls for. */
export interface ComponentDemand {
  /** Always something stocked: food items are expanded away before this. */
  refType: StockComponentType;
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
   *
   * A recipe built on a food item that is itself unwritten lands here too, by
   * the name that was sold. Deducting the rest of it would put a precise
   * figure on an item nobody has finished describing.
   */
  unmapped: string[];
}

/** Add to a running per-component total, keyed the way stock is written. */
function addTo(
  totals: Map<string, ComponentDemand>,
  refType: StockComponentType,
  refId: string,
  qty: number,
): void {
  const key = componentKey(refType, refId);
  const existing = totals.get(key);
  if (existing) existing.qty += qty;
  else totals.set(key, { refType, refId, qty });
}

/**
 * What one portion of a recipe draws down, with food items resolved away.
 *
 * Returns null when a food-item line leads nowhere usable — missing, empty, or
 * looping back on itself. That answer travels all the way up: a combo whose
 * plate is undefined is itself undefined, and its other components are left
 * alone rather than deducted on their own.
 *
 * The same material reached down two different branches sums into one figure,
 * which is what a single write per component needs.
 *
 * `ancestry` carries the recipes already open above this one. Nothing can
 * store a loop — see sanitizeItemRecipe — but data that already has one must
 * still terminate here.
 */
function explode(
  recipe: ItemRecipe,
  recipesById: ReadonlyMap<string, ItemRecipe>,
  ancestry: ReadonlySet<string>,
): Map<string, ComponentDemand> | null {
  const totals = new Map<string, ComponentDemand>();

  for (const line of recipe.lines) {
    const qtyUsed = Number(line?.qtyUsed);
    if (!line?.refId || !Number.isFinite(qtyUsed) || qtyUsed <= 0) continue;

    if (line.refType !== "item") {
      addTo(totals, line.refType, line.refId, qtyUsed);
      continue;
    }

    if (ancestry.has(line.refId)) return null;
    const child = recipesById.get(line.refId);
    if (!isMapped(child)) return null;

    const inner = explode(
      child,
      recipesById,
      new Set([...ancestry, line.refId]),
    );
    if (!inner) return null;

    for (const part of inner.values()) {
      addTo(totals, part.refType, part.refId, part.qty * qtyUsed);
    }
  }

  return totals;
}

/**
 * The recipe behind one sale: the variant's own where someone has written one,
 * the item's base recipe otherwise.
 *
 * The fallback is what makes variants safe to introduce. Every item mapped
 * before variants existed has only a base recipe, and goes on deducting it for
 * every size until each variant is mapped in its own right — rather than every
 * such item silently deducting nothing the day the column appeared.
 */
function resolveRecipe(
  item: SoldItem,
  name: string,
  recipesByNameKey: ReadonlyMap<string, ItemRecipe>,
): ItemRecipe | null {
  const nameKey = normalizeMaterialName(name);
  const variant = String(item?.variantName ?? "").trim();

  if (variant) {
    const forVariant = recipesByNameKey.get(
      recipeLookupKey(nameKey, normalizeMaterialName(variant)),
    );
    if (isMapped(forVariant)) return forVariant;
  }
  return recipesByNameKey.get(recipeLookupKey(nameKey)) ?? null;
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
  // The same recipes, reached the way an `item` line points at them. Derived
  // rather than asked for, so every caller gets nesting without knowing it
  // exists — the name-keyed map already holds them all.
  const recipesById = new Map<string, ItemRecipe>();
  for (const recipe of recipesByNameKey.values()) {
    if (recipe._id) recipesById.set(String(recipe._id), recipe);
  }

  const totals = new Map<string, ComponentDemand>();
  const unmapped: string[] = [];
  const unmappedSeen = new Set<string>();

  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const name = String(item?.name ?? "").trim();
    const recipe = name ? resolveRecipe(item, name, recipesByNameKey) : null;

    // An empty recipe counts as unmapped: it says someone opened the form,
    // not what the item is made of.
    const perPortion = isMapped(recipe)
      ? explode(
          recipe,
          recipesById,
          recipe._id ? new Set([String(recipe._id)]) : new Set(),
        )
      : null;

    if (!perPortion) {
      const label = name || "Unknown product";
      if (!unmappedSeen.has(label)) {
        unmappedSeen.add(label);
        unmapped.push(label);
      }
      continue;
    }

    for (const part of perPortion.values()) {
      addTo(totals, part.refType, part.refId, part.qty * quantity);
    }

    // Packaging rides on the same sale, but is not part of `perPortion` —
    // explode() walks components only, so nesting never reaches it.
    for (const line of recipe?.packagingLines ?? []) {
      const qtyUsed = Number(line?.qtyUsed);
      if (!line?.refId || !Number.isFinite(qtyUsed) || qtyUsed <= 0) continue;
      addTo(totals, "raw", line.refId, qtyUsed * quantity);
    }
  }

  return { demand: [...totals.values()], unmapped };
}

/** The demand for one kind of component, as an id -> quantity map. */
export function demandByRefType(
  demand: ComponentDemand[],
  refType: StockComponentType,
): Map<string, number> {
  const owed = new Map<string, number>();
  for (const line of demand) {
    if (line.refType !== refType) continue;
    owed.set(line.refId, (owed.get(line.refId) ?? 0) + line.qty);
  }
  return owed;
}
