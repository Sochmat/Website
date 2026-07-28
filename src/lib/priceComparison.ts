// What each item costs to make, against what it sells for on every channel.
//
// One row per item recipe — the only items whose cost is known — carrying the
// four selling prices side by side and, for each, the share of that price the
// ingredients eat. Food cost as a percentage is the number this screen exists
// for: ₹40 of cost is a different business on a ₹100 plate than on a ₹160 one.
//
// Prices are per item name, keyed the same way recipes are matched, so they
// survive a recipe being deleted and rewritten.
//
// Pure logic — see priceComparison.test.ts.

import { normalizeMaterialName } from "./rawMaterials";
import { isMapped, UNCATEGORISED, type MenuItemSummary } from "./menuRecipes";
import type { ItemRecipe } from "./itemRecipes";

/** The channels an item sells through. Every price is optional — unset means
 *  nobody has entered one, which is different from a price of zero. */
export interface ItemPrices {
  dineIn?: number;
  zomato?: number;
  swiggy?: number;
  website?: number;
}

/** The four columns, in display order, with the label each carries. */
export const PRICE_CHANNELS = [
  { key: "dineIn", label: "Dine-in" },
  { key: "zomato", label: "Zomato" },
  { key: "swiggy", label: "Swiggy" },
  { key: "website", label: "Website" },
] as const;

export type PriceChannel = (typeof PRICE_CHANNELS)[number]["key"];

export function isPriceChannel(value: unknown): value is PriceChannel {
  return PRICE_CHANNELS.some((c) => c.key === value);
}

export interface PriceRow {
  /** normalizeMaterialName(name) — the key prices are stored under. */
  nameKey: string;
  name: string;
  /** What the recipe costs to make. */
  cost: number;
  prices: ItemPrices;
  /**
   * The item's price on the Menu tab, when it has one.
   *
   * Seeds the Website column so nobody retypes what the menu already says, and
   * stays visible afterwards so an entry here that has drifted from the live
   * menu price is obvious rather than silently wrong.
   */
  menuPrice?: number;
}

export interface PriceGroup {
  categoryId: string;
  categoryName: string;
  rows: PriceRow[];
}

/**
 * Cost as a percentage of a selling price.
 *
 * null when there is no price to measure against — an unpriced item has no
 * food-cost percentage, and printing 0% or ∞ would both be lies. A price of
 * zero is the same case: nothing to divide by.
 */
export function costPercent(
  cost: number,
  price: number | undefined,
): number | null {
  if (!Number.isFinite(cost)) return null;
  if (price === undefined || !Number.isFinite(price) || price <= 0) return null;
  return Math.round((cost / price) * 1000) / 10;
}

/** What a price row shows in the Website column before anyone edits it. */
export function websitePrice(row: PriceRow): number | undefined {
  return row.prices.website ?? row.menuPrice;
}

/** True when the stored website price no longer matches the menu's. */
export function websitePriceDrifted(row: PriceRow): boolean {
  return (
    row.prices.website !== undefined &&
    row.menuPrice !== undefined &&
    row.prices.website !== row.menuPrice
  );
}

/** What the caller has already read out of Mongo, joined by this module. */
export interface PriceComparisonInput {
  /** Menu items, for category and the menu price. */
  menuItems: (MenuItemSummary & { price?: number })[];
  /** Every item recipe; only mapped ones become rows. */
  recipes: ItemRecipe[];
  /** Stored prices, keyed by nameKey. */
  pricesByNameKey: ReadonlyMap<string, ItemPrices>;
}

/**
 * Rows for every costed item, grouped by the category its menu item sits in.
 *
 * Only mapped recipes appear: an item with no components has no cost, so it
 * has nothing to compare a price against — the Item Recipe screen is where
 * that gets fixed, and duplicating the "unmapped" list here would just be a
 * second place to read the same gap.
 *
 * A recipe matching no menu item still gets a row, under Uncategorised. It is
 * something the kitchen makes and costs money; leaving it out because the menu
 * has been renamed around it would hide a real margin.
 */
export function buildPriceGroups(input: PriceComparisonInput): PriceGroup[] {
  const { menuItems, recipes, pricesByNameKey } = input;

  const recipeByKey = new Map<string, ItemRecipe>();
  for (const recipe of recipes) {
    const key = recipe.nameKey || normalizeMaterialName(recipe.name);
    if (key && !recipeByKey.has(key)) recipeByKey.set(key, recipe);
  }

  const groups = new Map<string, PriceGroup>();
  const claimed = new Set<string>();

  const rowFor = (
    name: string,
    nameKey: string,
    recipe: ItemRecipe,
    menuPrice: number | undefined,
  ): PriceRow => ({
    nameKey,
    name,
    cost: Number.isFinite(recipe.totalCost) ? recipe.totalCost : 0,
    prices: pricesByNameKey.get(nameKey) ?? {},
    ...(menuPrice !== undefined ? { menuPrice } : {}),
  });

  const push = (categoryId: string, categoryName: string, row: PriceRow) => {
    const groupKey = categoryId || categoryName;
    let group = groups.get(groupKey);
    if (!group) {
      group = { categoryId, categoryName, rows: [] };
      groups.set(groupKey, group);
    }
    group.rows.push(row);
  };

  for (const item of menuItems) {
    const nameKey = normalizeMaterialName(item.name);
    const recipe = recipeByKey.get(nameKey);
    if (!isMapped(recipe)) continue;
    // Two menu items normalizing to one name share a recipe, a cost and a
    // price record — so they are one row, not a duplicate pair.
    if (claimed.has(nameKey)) continue;
    claimed.add(nameKey);

    push(
      item.categoryId,
      item.categoryName || UNCATEGORISED,
      rowFor(
        item.name,
        nameKey,
        recipe,
        typeof item.price === "number" ? item.price : undefined,
      ),
    );
  }

  for (const [nameKey, recipe] of recipeByKey) {
    if (claimed.has(nameKey) || !isMapped(recipe)) continue;
    claimed.add(nameKey);
    push("", UNCATEGORISED, rowFor(recipe.name, nameKey, recipe, undefined));
  }

  for (const group of groups.values()) {
    group.rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  return [...groups.values()].sort((a, b) => {
    if (a.categoryName === UNCATEGORISED) return 1;
    if (b.categoryName === UNCATEGORISED) return -1;
    return a.categoryName.localeCompare(b.categoryName);
  });
}
