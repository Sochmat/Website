// Menu items seen through the inventory console: which ones have an item
// recipe behind them, and which are still unaccounted for.
//
// The two sides live in different collections and were never linked by id —
// a menu item is matched to its recipe by normalized name, the same key the
// recipe importer already upserts on. That keeps this a read-only view: no
// migration, and renaming a menu item simply re-points the match.
//
// Pure logic — see menuRecipes.test.ts.

import { normalizeMaterialName } from "./rawMaterials";
import type { ItemRecipe } from "./itemRecipes";

/** What the inventory console needs of a menu item. */
export interface MenuItemSummary {
  _id: string;
  name: string;
  /** The category's own `id` string, as stored on the menu item. */
  categoryId: string;
  /** Resolved for display; blank when the category is gone or unset. */
  categoryName: string;
  type: string;
  /** Hidden on the storefront, but still worth costing. */
  hidden: boolean;
  /**
   * This item is itself an add-on, offered alongside a dish rather than
   * ordered on its own. It is a menu item like any other and carries its own
   * recipe — an order records it as a product in its own right.
   */
  isAddOn?: boolean;
  /**
   * Menu item ids of the add-ons offered with this item.
   *
   * Optional because only the Item Recipe screen asks for them; the costing
   * views build a MenuItemSummary without ever needing the link.
   */
  addOnIds?: string[];
  /**
   * Variant labels offered for this item, e.g. Small/Medium/Large. Each may
   * carry its own recipe; see recipeLookupKey.
   */
  variantNames?: string[];
}

/** Shown when a menu item names no category, or one that no longer exists. */
export const UNCATEGORISED = "Uncategorised";

/** One size an item is sold in — see SellableItem.variants. */
export interface SellableVariant {
  name: string;
  /** normalizeMaterialName(name) — the second half of recipeLookupKey. */
  variantKey: string;
  /**
   * False when NEITHER this variant's own recipe NOR the item's base recipe
   * backs it, which is exactly when recording it would deduct nothing. The
   * base counts because that is the fallback a deduction actually takes —
   * see resolveRecipe in recipeDemand.ts.
   */
  mapped: boolean;
}

/** Something that can be recorded as sold — see /api/admin/sellable-items. */
export interface SellableItem {
  name: string;
  /** normalizeMaterialName(name) — matches the recipe a deduction would use. */
  nameKey: string;
  /** False when no base recipe backs it: recording it deducts nothing. */
  mapped: boolean;
  /**
   * Sizes this item is sold in, e.g. Small/Medium/Large. Empty when it has
   * none, in which case a sale of it names no variant at all.
   */
  variants: SellableVariant[];
}

/** One size an item is offered in, paired with the recipe defining it. */
export interface MenuVariantRow {
  name: string;
  /** normalizeMaterialName(name). */
  variantKey: string;
  /** This variant's OWN recipe; null when nobody has written one for it. */
  recipe: ItemRecipe | null;
  mapped: boolean;
}

/** A menu item paired with the recipe that defines it, if there is one. */
export interface MenuRecipeRow {
  menuItem: MenuItemSummary;
  /** The item's BASE recipe — never a variant's. */
  recipe: ItemRecipe | null;
  /** One per size the item is offered in; empty when it has none. */
  variants: MenuVariantRow[];
  /**
   * Accounted for: every variant written for an item that has them, the base
   * recipe otherwise.
   *
   * An item with variants is never ordered as itself, so its base recipe does
   * not settle the question — it only stands in for a size nobody has written
   * yet, and a row standing on that stand-in is exactly what this screen
   * exists to surface.
   */
  mapped: boolean;
}

export interface MenuRecipeGroup {
  categoryId: string;
  categoryName: string;
  rows: MenuRecipeRow[];
  mapped: number;
  unmapped: number;
}

/**
 * Is this menu item accounted for?
 *
 * A recipe that exists but lists nothing is NOT mapped: an empty shell says
 * only that someone opened the form, not what the item is made of.
 */
export function isMapped(
  recipe: ItemRecipe | null | undefined,
): recipe is ItemRecipe {
  return !!recipe && recipe.lines.length > 0;
}

/**
 * The key a recipe is stored and found under.
 *
 * An item's base recipe keys on its name alone, exactly as before variants
 * existed — so every recipe already written keeps the key it always had, and
 * anything looking one up without a variant still finds it.
 */
export function recipeLookupKey(nameKey: string, variantKey?: string): string {
  return variantKey ? `${nameKey}|${variantKey}` : nameKey;
}

/**
 * The variant half of a recipe's key, "" on a base recipe.
 *
 * Derived from variantName when variantKey is absent, for the same reason
 * nameKey is: a recipe stored before the column existed still has the label.
 */
export function variantKeyOf(recipe: ItemRecipe): string {
  return (
    recipe.variantKey ||
    (recipe.variantName ? normalizeMaterialName(recipe.variantName) : "")
  );
}

/** Recipes keyed by the same normalized name a menu item resolves to. */
export function recipesByNameKey(
  recipes: ItemRecipe[],
): Map<string, ItemRecipe> {
  const byKey = new Map<string, ItemRecipe>();
  for (const recipe of recipes) {
    // Prefer the stored nameKey, but fall back to deriving it: a recipe
    // written before nameKey existed still has a name.
    const nameKey = recipe.nameKey || normalizeMaterialName(recipe.name);
    if (!nameKey) continue;
    const key = recipeLookupKey(nameKey, variantKeyOf(recipe));
    if (!byKey.has(key)) byKey.set(key, recipe);
  }
  return byKey;
}

/** The recipe defining a menu item, or null when nobody has written one. */
export function recipeFor(
  menuItem: MenuItemSummary,
  byKey: ReadonlyMap<string, ItemRecipe>,
): ItemRecipe | null {
  return byKey.get(normalizeMaterialName(menuItem.name)) ?? null;
}

/**
 * One row per size the item is offered in, each with its own recipe.
 *
 * Only the variant's OWN recipe counts as written here. The base recipe does
 * stand in for it at deduction time — see resolveRecipe in recipeDemand.ts —
 * but calling a size mapped because something else covers it would hide the
 * one thing this screen is for: which sizes still need writing.
 */
export function variantRowsFor(
  menuItem: MenuItemSummary,
  byKey: ReadonlyMap<string, ItemRecipe>,
): MenuVariantRow[] {
  const nameKey = normalizeMaterialName(menuItem.name);
  const rows: MenuVariantRow[] = [];
  const seen = new Set<string>();

  for (const label of menuItem.variantNames ?? []) {
    const name = String(label ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    // Two labels normalizing to one key resolve to one recipe, so they are one
    // size — listing both would ask for the same recipe twice.
    const variantKey = normalizeMaterialName(name);
    if (seen.has(variantKey)) continue;
    seen.add(variantKey);

    const recipe = byKey.get(recipeLookupKey(nameKey, variantKey)) ?? null;
    rows.push({ name, variantKey, recipe, mapped: isMapped(recipe) });
  }

  return rows;
}

/**
 * Every recipe stored for this item — its base and each of its sizes.
 *
 * Empty ones are included: a recipe nobody finished writing is still a stored
 * record, and leaving it out would make it undeletable from this screen.
 */
export function writtenRecipes(row: MenuRecipeRow): ItemRecipe[] {
  const written: ItemRecipe[] = [];
  const seen = new Set<string>();

  for (const recipe of [row.recipe, ...row.variants.map((v) => v.recipe)]) {
    const id = recipe?._id;
    if (!recipe || !id || seen.has(id)) continue;
    seen.add(id);
    written.push(recipe);
  }

  return written;
}

/** One priced way an item can be sold, and the recipe a sale would deduct. */
export interface SoldRecipe {
  /** The size's label; "" when the item is sold without one. */
  label: string;
  /** Never unmapped — a way of selling it that deducts nothing is left out. */
  recipe: ItemRecipe;
  /**
   * True when this size has no recipe of its own and is deducting the item's
   * base recipe instead. Worth saying out loud: the figures are real, but they
   * are not this size's, and writing one for it would change them.
   */
  fallback: boolean;
}

/**
 * Every way this item can actually be sold, priced.
 *
 * One entry per size, each resolved the way a deduction resolves it: the
 * size's own recipe where there is one, the base standing in where there is
 * not. An item with no variants has the single entry of its base recipe.
 *
 * This is what the Components and Costing columns read. An item whose sizes
 * each carry their own recipe has no single component count or cost — it has
 * one per size — and reading the base recipe there would print a figure that
 * nothing on the menu is ever sold at.
 */
export function soldRecipes(row: MenuRecipeRow): SoldRecipe[] {
  if (row.variants.length === 0) {
    return isMapped(row.recipe)
      ? [{ label: "", recipe: row.recipe, fallback: false }]
      : [];
  }

  const sold: SoldRecipe[] = [];
  for (const variant of row.variants) {
    const own = isMapped(variant.recipe);
    const recipe = own ? variant.recipe : row.recipe;
    if (isMapped(recipe)) {
      sold.push({ label: variant.name, recipe, fallback: !own });
    }
  }
  return sold;
}

/**
 * Menu items grouped by category, each paired with its recipe.
 *
 * Categories are ordered by name with Uncategorised last, and items by name
 * within a category — the menu's own display order is not recorded anywhere
 * this side of the console.
 *
 * The tallies count a row the way its own status reads: an item offered in
 * sizes is mapped once every size is written, not once its base recipe is.
 */
export function groupMenuItems(
  items: MenuItemSummary[],
  recipes: ItemRecipe[],
): MenuRecipeGroup[] {
  const byKey = recipesByNameKey(recipes);
  const groups = new Map<string, MenuRecipeGroup>();

  for (const menuItem of items) {
    const categoryName = menuItem.categoryName || UNCATEGORISED;
    const groupKey = menuItem.categoryId || UNCATEGORISED;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        categoryId: menuItem.categoryId,
        categoryName,
        rows: [],
        mapped: 0,
        unmapped: 0,
      };
      groups.set(groupKey, group);
    }

    const recipe = recipeFor(menuItem, byKey);
    const variants = variantRowsFor(menuItem, byKey);
    const mapped = variants.length
      ? variants.every((v) => v.mapped)
      : isMapped(recipe);
    group.rows.push({ menuItem, recipe, variants, mapped });
    if (mapped) group.mapped++;
    else group.unmapped++;
  }

  for (const group of groups.values()) {
    group.rows.sort((a, b) => a.menuItem.name.localeCompare(b.menuItem.name));
  }

  return [...groups.values()].sort((a, b) => {
    if (a.categoryName === UNCATEGORISED) return 1;
    if (b.categoryName === UNCATEGORISED) return -1;
    return a.categoryName.localeCompare(b.categoryName);
  });
}

/**
 * Recipes that match no menu item.
 *
 * Left over from a renamed or deleted item, or written ahead of one. They are
 * still listed so a recipe can never become unreachable just because this view
 * is organised by menu.
 */
export function orphanRecipes(
  items: MenuItemSummary[],
  recipes: ItemRecipe[],
): ItemRecipe[] {
  const menuKeys = new Set(
    items.map((item) => normalizeMaterialName(item.name)),
  );
  return recipes.filter(
    (recipe) =>
      !menuKeys.has(recipe.nameKey || normalizeMaterialName(recipe.name)),
  );
}
