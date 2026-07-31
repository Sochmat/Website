import { describe, expect, it } from "vitest";
import {
  groupMenuItems,
  isMapped,
  orphanRecipes,
  recipeFor,
  recipesByNameKey,
  UNCATEGORISED,
  type MenuItemSummary,
} from "@/lib/menuRecipes";
import type { ItemRecipe } from "@/lib/itemRecipes";

const recipe = (name: string, components = 1): ItemRecipe => ({
  _id: `r-${name}`,
  name,
  nameKey: name.toLowerCase(),
  lines: Array.from({ length: components }, (_, i) => ({
    refType: "raw" as const,
    refId: `m${i}`,
    qtyUsed: 10,
  })),
  totalCost: 12,
});

const menuItem = (
  name: string,
  categoryId = "rice",
  categoryName = "Rice Bowls",
): MenuItemSummary => ({
  _id: `m-${name}`,
  name,
  categoryId,
  categoryName,
  type: "food",
  hidden: false,
});

describe("isMapped", () => {
  it("counts a recipe with components", () => {
    expect(isMapped(recipe("Dal Rice"))).toBe(true);
  });

  it("does not count an empty recipe", () => {
    expect(isMapped(recipe("Dal Rice", 0))).toBe(false);
  });

  it("does not count a missing recipe", () => {
    expect(isMapped(null)).toBe(false);
    expect(isMapped(undefined)).toBe(false);
  });
});

describe("recipesByNameKey / recipeFor", () => {
  it("matches a menu item to its recipe regardless of spacing or case", () => {
    const byKey = recipesByNameKey([recipe("dal rice")]);
    expect(recipeFor(menuItem("  Dal   Rice "), byKey)?.name).toBe("dal rice");
  });

  it("derives the key when a recipe has no stored nameKey", () => {
    const legacy = { ...recipe("Dal Rice"), nameKey: "" };
    const byKey = recipesByNameKey([legacy]);
    expect(recipeFor(menuItem("Dal Rice"), byKey)?.name).toBe("Dal Rice");
  });

  it("returns null when nothing matches", () => {
    expect(recipeFor(menuItem("Dal Rice"), recipesByNameKey([]))).toBeNull();
  });

  it("keeps the first of two recipes sharing a name", () => {
    const byKey = recipesByNameKey([recipe("dal rice"), recipe("Dal Rice")]);
    expect(byKey.size).toBe(1);
  });
});

describe("groupMenuItems", () => {
  it("groups by category and tallies both states", () => {
    const groups = groupMenuItems(
      [
        menuItem("Dal Rice"),
        menuItem("Curd Rice"),
        menuItem("Filter Coffee", "bev", "Beverages"),
      ],
      [recipe("dal rice")],
    );

    expect(groups.map((g) => g.categoryName)).toEqual([
      "Beverages",
      "Rice Bowls",
    ]);
    const rice = groups.find((g) => g.categoryName === "Rice Bowls")!;
    expect(rice.mapped).toBe(1);
    expect(rice.unmapped).toBe(1);
    // Sorted by name within the category.
    expect(rice.rows.map((r) => r.menuItem.name)).toEqual([
      "Curd Rice",
      "Dal Rice",
    ]);
    expect(rice.rows[1].mapped).toBe(true);
  });

  it("sorts uncategorised items last", () => {
    const groups = groupMenuItems(
      [menuItem("Loose Item", "", ""), menuItem("Dal Rice")],
      [],
    );
    expect(groups.map((g) => g.categoryName)).toEqual([
      "Rice Bowls",
      UNCATEGORISED,
    ]);
  });

  it("treats an empty recipe as unmapped", () => {
    const groups = groupMenuItems([menuItem("Dal Rice")], [recipe("dal rice", 0)]);
    expect(groups[0].mapped).toBe(0);
    expect(groups[0].unmapped).toBe(1);
    // The recipe is still attached, so the row can link to it.
    expect(groups[0].rows[0].recipe).not.toBeNull();
  });

  it("handles an empty menu", () => {
    expect(groupMenuItems([], [recipe("dal rice")])).toEqual([]);
  });
});

describe("orphanRecipes", () => {
  it("finds recipes with no menu item of that name", () => {
    const orphans = orphanRecipes(
      [menuItem("Dal Rice")],
      [recipe("dal rice"), recipe("Retired Thali")],
    );
    expect(orphans.map((r) => r.name)).toEqual(["Retired Thali"]);
  });

  it("returns nothing when every recipe is on the menu", () => {
    expect(orphanRecipes([menuItem("Dal Rice")], [recipe("dal rice")])).toEqual(
      [],
    );
  });
});
