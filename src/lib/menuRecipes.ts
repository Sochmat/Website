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
}

/** Shown when a menu item names no category, or one that no longer exists. */
export const UNCATEGORISED = "Uncategorised";

/** Something that can be recorded as sold — see /api/admin/sellable-items. */
export interface SellableItem {
  name: string;
  /** normalizeMaterialName(name) — matches the recipe a deduction would use. */
  nameKey: string;
  /** False when no recipe backs it: recording it deducts nothing. */
  mapped: boolean;
}

/** A menu item paired with the recipe that defines it, if there is one. */
export interface MenuRecipeRow {
  menuItem: MenuItemSummary;
  recipe: ItemRecipe | null;
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

/** Recipes keyed by the same normalized name a menu item resolves to. */
export function recipesByNameKey(
  recipes: ItemRecipe[],
): Map<string, ItemRecipe> {
  const byKey = new Map<string, ItemRecipe>();
  for (const recipe of recipes) {
    // Prefer the stored nameKey, but fall back to deriving it: a recipe
    // written before nameKey existed still has a name.
    const key = recipe.nameKey || normalizeMaterialName(recipe.name);
    if (key && !byKey.has(key)) byKey.set(key, recipe);
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
 * Menu items grouped by category, each paired with its recipe.
 *
 * Categories are ordered by name with Uncategorised last, and items by name
 * within a category — the menu's own display order is not recorded anywhere
 * this side of the console.
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
    const mapped = isMapped(recipe);
    group.rows.push({ menuItem, recipe, mapped });
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
