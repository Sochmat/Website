import { describe, expect, it } from "vitest";
import {
  groupMenuItems,
  isMapped,
  orphanRecipes,
  recipeFor,
  recipesByNameKey,
  soldRecipes,
  UNCATEGORISED,
  variantRowsFor,
  writtenRecipes,
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

/** The same, for one size of an item. */
const sizedRecipe = (
  name: string,
  variantName: string,
  components = 1,
  totalCost = 12,
): ItemRecipe => ({
  ...recipe(name, components),
  _id: `r-${name}-${variantName}`,
  variantName,
  variantKey: variantName.toLowerCase(),
  totalCost,
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

/** A menu item offered in sizes. */
const sizedItem = (name: string, ...variantNames: string[]): MenuItemSummary => ({
  ...menuItem(name),
  variantNames,
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

  it("counts an item with every size written as mapped, base or no base", () => {
    const groups = groupMenuItems(
      [sizedItem("Ghar Ki Thali", "Small", "Large")],
      [
        sizedRecipe("Ghar Ki Thali", "Small"),
        sizedRecipe("Ghar Ki Thali", "Large"),
      ],
    );

    expect(groups[0].mapped).toBe(1);
    expect(groups[0].unmapped).toBe(0);
    // No base recipe was written, and the row does not need one.
    expect(groups[0].rows[0].recipe).toBeNull();
    expect(groups[0].rows[0].mapped).toBe(true);
  });

  it("counts an item with a size still unwritten as unmapped", () => {
    const groups = groupMenuItems(
      [sizedItem("Ghar Ki Thali", "Small", "Large")],
      [sizedRecipe("Ghar Ki Thali", "Small")],
    );

    expect(groups[0].mapped).toBe(0);
    expect(groups[0].unmapped).toBe(1);
  });

  it("does not let a base recipe alone account for an item with sizes", () => {
    // The base DOES stand in at deduction time, but this screen exists to say
    // which sizes still need writing — so it counts as unmapped.
    const groups = groupMenuItems(
      [sizedItem("Ghar Ki Thali", "Small", "Large")],
      [recipe("Ghar Ki Thali")],
    );

    expect(groups[0].mapped).toBe(0);
    expect(groups[0].rows[0].recipe).not.toBeNull();
  });
});

describe("variantRowsFor", () => {
  it("pairs each size with its own recipe", () => {
    const byKey = recipesByNameKey([
      recipe("Ghar Ki Thali"),
      sizedRecipe("Ghar Ki Thali", "Large", 3),
    ]);
    const rows = variantRowsFor(sizedItem("Ghar Ki Thali", "Small", "Large"), byKey);

    expect(rows.map((r) => [r.name, r.mapped])).toEqual([
      // The base recipe stands in for Small at deduction time, but it is not
      // Small's own — so Small still reads as unwritten here.
      ["Small", false],
      ["Large", true],
    ]);
    expect(rows[1].recipe?.lines).toHaveLength(3);
  });

  it("has nothing to pair for an item with no sizes", () => {
    expect(variantRowsFor(menuItem("Dal Rice"), recipesByNameKey([]))).toEqual([]);
  });

  it("keeps two labels normalizing to one size as one row", () => {
    const rows = variantRowsFor(
      sizedItem("Ghar Ki Thali", "Large", " large "),
      recipesByNameKey([]),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("soldRecipes", () => {
  const rowFor = (item: MenuItemSummary, recipes: ItemRecipe[]) =>
    groupMenuItems([item], recipes)[0].rows[0];

  it("prices each size from its own recipe", () => {
    const sold = soldRecipes(
      rowFor(sizedItem("Ghar Ki Thali", "Small", "Large"), [
        sizedRecipe("Ghar Ki Thali", "Small", 2, 18.2),
        sizedRecipe("Ghar Ki Thali", "Large", 4, 24.6),
      ]),
    );

    expect(sold.map((s) => [s.label, s.recipe.totalCost])).toEqual([
      ["Small", 18.2],
      ["Large", 24.6],
    ]);
  });

  it("falls back to the base for a size nobody has written", () => {
    const sold = soldRecipes(
      rowFor(sizedItem("Ghar Ki Thali", "Small", "Large"), [
        recipe("Ghar Ki Thali"),
        sizedRecipe("Ghar Ki Thali", "Large", 4, 24.6),
      ]),
    );

    // Same resolution a deduction makes: Small has none, so it spends the base.
    expect(sold.map((s) => [s.label, s.recipe.totalCost])).toEqual([
      ["Small", 12],
      ["Large", 24.6],
    ]);
    // And says so, rather than passing the base off as Small's own.
    expect(sold.map((s) => s.fallback)).toEqual([true, false]);
  });

  it("leaves out a size that would deduct nothing", () => {
    const sold = soldRecipes(
      rowFor(sizedItem("Ghar Ki Thali", "Small", "Large"), [
        sizedRecipe("Ghar Ki Thali", "Large"),
      ]),
    );

    expect(sold.map((s) => s.label)).toEqual(["Large"]);
  });

  it("is the single base recipe for an item with no sizes", () => {
    const sold = soldRecipes(rowFor(menuItem("Dal Rice"), [recipe("dal rice", 3)]));

    expect(sold).toHaveLength(1);
    expect(sold[0].label).toBe("");
    expect(sold[0].recipe.lines).toHaveLength(3);
  });

  it("has nothing to price when no recipe is written at all", () => {
    expect(soldRecipes(rowFor(menuItem("Dal Rice"), []))).toEqual([]);
    expect(
      soldRecipes(rowFor(sizedItem("Ghar Ki Thali", "Small"), [])),
    ).toEqual([]);
  });
});

describe("writtenRecipes", () => {
  const rowFor = (item: MenuItemSummary, recipes: ItemRecipe[]) =>
    groupMenuItems([item], recipes)[0].rows[0];

  it("collects the base and every size", () => {
    const written = writtenRecipes(
      rowFor(sizedItem("Ghar Ki Thali", "Small", "Large"), [
        recipe("Ghar Ki Thali"),
        sizedRecipe("Ghar Ki Thali", "Small"),
        sizedRecipe("Ghar Ki Thali", "Large"),
      ]),
    );

    expect(written.map((r) => r.variantName ?? "")).toEqual([
      "",
      "Small",
      "Large",
    ]);
  });

  it("collects the sizes of an item with no base recipe", () => {
    const written = writtenRecipes(
      rowFor(sizedItem("Ghar Ki Thali", "Small", "Large"), [
        sizedRecipe("Ghar Ki Thali", "Small"),
        sizedRecipe("Ghar Ki Thali", "Large"),
      ]),
    );

    expect(written).toHaveLength(2);
  });

  it("counts a recipe once however many sizes reach it", () => {
    // Neither size has its own, so both resolve to the one base record.
    const written = writtenRecipes(
      rowFor(sizedItem("Ghar Ki Thali", "Small", "Large"), [
        recipe("Ghar Ki Thali"),
      ]),
    );

    expect(written).toHaveLength(1);
  });

  it("includes a recipe nobody finished writing, so it stays deletable", () => {
    const written = writtenRecipes(
      rowFor(menuItem("Dal Rice"), [recipe("dal rice", 0)]),
    );

    expect(written).toHaveLength(1);
  });

  it("is empty for an item nobody has written anything for", () => {
    expect(writtenRecipes(rowFor(menuItem("Dal Rice"), []))).toEqual([]);
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
