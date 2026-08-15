// Category-wise rollup of item sales, for the admin sales report.
//
// Pure: takes the flat per-item sales `itemSalesInRange` already produces plus
// a category id -> name map, and returns the grouped shape the sheet renders.
// No Mongo, no ExcelJS — the arithmetic is the part worth testing.

import type { ItemSale } from "@/lib/adminItemSales";

/** Where items land when their category can't be resolved. */
export const UNCATEGORIZED = "Uncategorized";

export interface CategorySalesGroup {
  /** Category.id, or "" for the uncategorized bucket. */
  categoryId: string;
  name: string;
  /** The category's items, busiest-earning first. */
  items: ItemSale[];
  quantity: number;
  revenue: number;
}

export interface CategorySalesReport {
  categories: CategorySalesGroup[];
  totals: { quantity: number; revenue: number };
}

/**
 * Roll item sales up into categories, richest first, with the uncategorized
 * bucket pinned last however much it earned.
 *
 * Two ways an item ends up uncategorized, both of which have to survive rather
 * than drop a sale on the floor: the menu item carries no category, or it was
 * deleted from the menu after being sold (so `itemSalesInRange` never resolved
 * it and left the category ""). A report that silently omitted either would
 * stop reconciling against the orders it was built from.
 */
export function groupByCategory(
  items: ItemSale[],
  categoryNames: Map<string, string>,
): CategorySalesReport {
  const groups = new Map<string, CategorySalesGroup>();

  for (const item of items) {
    // An id we have no name for is as good as no id: the report can't label it.
    const name = categoryNames.get(item.category);
    const categoryId = name ? item.category : "";

    let group = groups.get(categoryId);
    if (!group) {
      group = {
        categoryId,
        name: name ?? UNCATEGORIZED,
        items: [],
        quantity: 0,
        revenue: 0,
      };
      groups.set(categoryId, group);
    }
    group.items.push(item);
    group.quantity += item.quantity;
    group.revenue += item.revenue;
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  }

  const categories = [...groups.values()].sort((a, b) => {
    // Uncategorized is a loose end, not a category — it reads last regardless.
    if (a.categoryId === "") return 1;
    if (b.categoryId === "") return -1;
    return b.revenue - a.revenue || a.name.localeCompare(b.name);
  });

  return {
    categories,
    totals: {
      quantity: categories.reduce((sum, c) => sum + c.quantity, 0),
      revenue: categories.reduce((sum, c) => sum + c.revenue, 0),
    },
  };
}
