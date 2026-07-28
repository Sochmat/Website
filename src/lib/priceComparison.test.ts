import { describe, expect, it } from "vitest";
import {
  buildPriceGroups,
  costPercent,
  isPriceChannel,
  websitePrice,
  websitePriceDrifted,
  type ItemPrices,
  type PriceRow,
} from "./priceComparison";
import { UNCATEGORISED, type MenuItemSummary } from "./menuRecipes";
import type { ItemRecipe } from "./itemRecipes";

const recipe = (name: string, totalCost: number, components = 1): ItemRecipe => ({
  _id: `r-${name}`,
  name,
  nameKey: name.toLowerCase(),
  lines: Array.from({ length: components }, (_, i) => ({
    refType: "raw" as const,
    refId: `m${i}`,
    qtyUsed: 10,
  })),
  totalCost,
});

const menuItem = (
  name: string,
  price: number | undefined,
  categoryId = "rice",
  categoryName = "Rice Bowls",
): MenuItemSummary & { price?: number } => ({
  _id: `m-${name}`,
  name,
  categoryId,
  categoryName,
  type: "food",
  hidden: false,
  ...(price !== undefined ? { price } : {}),
});

const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  nameKey: "dal rice",
  name: "Dal Rice",
  cost: 40,
  prices: {},
  ...over,
});

describe("costPercent", () => {
  it("gives the cost as a share of the price", () => {
    expect(costPercent(40, 100)).toBe(40);
    expect(costPercent(40, 160)).toBe(25);
  });

  it("rounds to one decimal", () => {
    expect(costPercent(40, 130)).toBe(30.8);
  });

  it("goes past 100 when the cost exceeds the price", () => {
    expect(costPercent(120, 100)).toBe(120);
  });

  it("is null when there is no price to measure against", () => {
    expect(costPercent(40, undefined)).toBeNull();
    expect(costPercent(40, 0)).toBeNull();
    expect(costPercent(40, -10)).toBeNull();
    expect(costPercent(40, Number.NaN)).toBeNull();
  });

  it("is null when the cost itself is not a number", () => {
    expect(costPercent(Number.NaN, 100)).toBeNull();
  });

  it("is 0 for a free-to-make item, not null", () => {
    expect(costPercent(0, 100)).toBe(0);
  });
});

describe("websitePrice", () => {
  it("falls back to the menu price when none is stored", () => {
    expect(websitePrice(row({ menuPrice: 150 }))).toBe(150);
  });

  it("prefers a stored price", () => {
    expect(websitePrice(row({ menuPrice: 150, prices: { website: 160 } }))).toBe(
      160,
    );
  });

  it("keeps a stored zero rather than falling through to the menu", () => {
    expect(websitePrice(row({ menuPrice: 150, prices: { website: 0 } }))).toBe(0);
  });

  it("is undefined when there is neither", () => {
    expect(websitePrice(row())).toBeUndefined();
  });
});

describe("websitePriceDrifted", () => {
  it("flags a stored price that no longer matches the menu", () => {
    expect(
      websitePriceDrifted(row({ menuPrice: 150, prices: { website: 160 } })),
    ).toBe(true);
  });

  it("does not flag a match, or a price that was never overridden", () => {
    expect(
      websitePriceDrifted(row({ menuPrice: 150, prices: { website: 150 } })),
    ).toBe(false);
    expect(websitePriceDrifted(row({ menuPrice: 150 }))).toBe(false);
    expect(websitePriceDrifted(row({ prices: { website: 160 } }))).toBe(false);
  });
});

describe("isPriceChannel", () => {
  it("accepts the four channels and nothing else", () => {
    expect(isPriceChannel("dineIn")).toBe(true);
    expect(isPriceChannel("website")).toBe(true);
    expect(isPriceChannel("uber")).toBe(false);
    expect(isPriceChannel(null)).toBe(false);
  });
});

describe("buildPriceGroups", () => {
  const DAL = recipe("Dal Rice", 40);
  const JEERA = recipe("Jeera Rice", 30);

  it("pairs a costed item with its category, menu price and stored prices", () => {
    const prices = new Map<string, ItemPrices>([
      ["dal rice", { dineIn: 120, zomato: 160 }],
    ]);

    const groups = buildPriceGroups({
      menuItems: [menuItem("Dal Rice", 150)],
      recipes: [DAL],
      pricesByNameKey: prices,
    });

    expect(groups).toEqual([
      {
        categoryId: "rice",
        categoryName: "Rice Bowls",
        rows: [
          {
            nameKey: "dal rice",
            name: "Dal Rice",
            cost: 40,
            prices: { dineIn: 120, zomato: 160 },
            menuPrice: 150,
          },
        ],
      },
    ]);
  });

  it("leaves out a menu item with no recipe", () => {
    const groups = buildPriceGroups({
      menuItems: [menuItem("Dal Rice", 150), menuItem("Gulab Jamun", 60)],
      recipes: [DAL],
      pricesByNameKey: new Map(),
    });

    expect(groups[0].rows.map((r) => r.name)).toEqual(["Dal Rice"]);
  });

  it("leaves out an empty recipe, which has no cost to compare", () => {
    const groups = buildPriceGroups({
      menuItems: [menuItem("Plain Rice", 80)],
      recipes: [recipe("Plain Rice", 0, 0)],
      pricesByNameKey: new Map(),
    });

    expect(groups).toEqual([]);
  });

  it("groups by category, sorting items by name and Uncategorised last", () => {
    const groups = buildPriceGroups({
      menuItems: [
        menuItem("Jeera Rice", 120),
        menuItem("Dal Rice", 150),
        menuItem("Cold Coffee", 90, "bev", "Beverages"),
      ],
      recipes: [DAL, JEERA, recipe("Cold Coffee", 25)],
      pricesByNameKey: new Map(),
    });

    expect(groups.map((g) => g.categoryName)).toEqual([
      "Beverages",
      "Rice Bowls",
    ]);
    expect(groups[1].rows.map((r) => r.name)).toEqual([
      "Dal Rice",
      "Jeera Rice",
    ]);
  });

  it("files a menu item with no category under Uncategorised, last", () => {
    const groups = buildPriceGroups({
      menuItems: [menuItem("Dal Rice", 150), menuItem("Loose End", 50, "", "")],
      recipes: [DAL, recipe("Loose End", 10)],
      pricesByNameKey: new Map(),
    });

    expect(groups.map((g) => g.categoryName)).toEqual([
      "Rice Bowls",
      UNCATEGORISED,
    ]);
  });

  it("still shows a recipe that matches no menu item", () => {
    const groups = buildPriceGroups({
      menuItems: [],
      recipes: [recipe("Staff Meal", 35)],
      pricesByNameKey: new Map(),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].categoryName).toBe(UNCATEGORISED);
    expect(groups[0].rows[0]).toMatchObject({ name: "Staff Meal", cost: 35 });
    expect(groups[0].rows[0].menuPrice).toBeUndefined();
  });

  it("matches a recipe to its menu item however either is spaced or cased", () => {
    const groups = buildPriceGroups({
      menuItems: [menuItem("  DAL   rice ", 150)],
      recipes: [DAL],
      pricesByNameKey: new Map(),
    });

    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0].cost).toBe(40);
  });

  it("makes one row of two menu items that normalize to the same name", () => {
    const groups = buildPriceGroups({
      menuItems: [menuItem("Dal Rice", 150), menuItem("dal rice.", 155)],
      recipes: [DAL],
      pricesByNameKey: new Map(),
    });

    expect(groups.flatMap((g) => g.rows)).toHaveLength(1);
  });

  it("has nothing to show without recipes", () => {
    expect(
      buildPriceGroups({
        menuItems: [menuItem("Dal Rice", 150)],
        recipes: [],
        pricesByNameKey: new Map(),
      }),
    ).toEqual([]);
  });
});
