import { describe, expect, it } from "vitest";
import { componentBreakdown } from "@/lib/recipeBreakdown";
import type { SoldItem } from "@/lib/recipeDemand";
import { recipesByNameKey } from "@/lib/menuRecipes";
import type { ItemRecipe, ItemRecipeLine } from "@/lib/itemRecipes";

const recipe = (
  name: string,
  lines: ItemRecipeLine[],
  variantName?: string,
): ItemRecipe => ({
  _id: `r-${name}-${variantName ?? ""}`,
  name,
  nameKey: name.toLowerCase(),
  ...(variantName
    ? { variantName, variantKey: variantName.toLowerCase() }
    : {}),
  lines,
  totalCost: 0,
});

const raw = (refId: string, qtyUsed: number): ItemRecipeLine => ({
  refType: "raw",
  refId,
  qtyUsed,
});

const production = (refId: string, qtyUsed: number): ItemRecipeLine => ({
  refType: "production",
  refId,
  qtyUsed,
});

const VEG_BURGER = recipe("Veg Burger", [raw("buns", 1), production("patty", 1)]);
const CHEESE_BURGER = recipe("Cheese Burger", [raw("buns", 1), raw("cheese", 20)]);
const VEG_BURGER_LARGE = recipe("Veg Burger", [raw("buns", 2)], "Large");

const RECIPES = recipesByNameKey([VEG_BURGER, CHEESE_BURGER, VEG_BURGER_LARGE]);

const item = (name: string, quantity: number, variantName?: string): SoldItem =>
  variantName ? { name, quantity, variantName } : { name, quantity };

/** The shares recorded against one component, for readability in the asserts. */
function sharesFor(breakdown: ReturnType<typeof componentBreakdown>, refId: string) {
  return breakdown.find((entry) => entry.refId === refId)?.sold ?? [];
}

describe("componentBreakdown", () => {
  it("names the item a component was consumed for", () => {
    const breakdown = componentBreakdown([item("Veg Burger", 1)], RECIPES);

    expect(sharesFor(breakdown, "buns")).toEqual([
      { name: "Veg Burger", qty: 1 },
    ]);
    expect(sharesFor(breakdown, "patty")).toEqual([
      { name: "Veg Burger", qty: 1 },
    ]);
  });

  it("splits a shared ingredient across the items that used it", () => {
    const breakdown = componentBreakdown(
      [item("Veg Burger", 1), item("Cheese Burger", 3)],
      RECIPES,
    );

    // Biggest share first — the item most responsible leads.
    expect(sharesFor(breakdown, "buns")).toEqual([
      { name: "Cheese Burger", qty: 3 },
      { name: "Veg Burger", qty: 1 },
    ]);
    expect(sharesFor(breakdown, "cheese")).toEqual([
      { name: "Cheese Burger", qty: 60 },
    ]);
  });

  it("adds up to what the deduction took off the shelf", () => {
    const breakdown = componentBreakdown(
      [item("Veg Burger", 2), item("Cheese Burger", 5)],
      RECIPES,
    );
    const total = sharesFor(breakdown, "buns").reduce(
      (sum, share) => sum + (share.qty ?? 0),
      0,
    );

    expect(total).toBe(7);
  });

  it("keeps the size sold, and counts it as its own share", () => {
    const breakdown = componentBreakdown(
      [item("Veg Burger", 1), item("Veg Burger", 1, "Large")],
      RECIPES,
    );

    expect(sharesFor(breakdown, "buns")).toEqual([
      { name: "Veg Burger", variantName: "Large", qty: 2 },
      { name: "Veg Burger", qty: 1 },
    ]);
  });

  it("pools the same item listed twice on one order", () => {
    const breakdown = componentBreakdown(
      [item("Veg Burger", 1), item("Veg Burger", 2)],
      RECIPES,
    );

    expect(sharesFor(breakdown, "buns")).toEqual([
      { name: "Veg Burger", qty: 3 },
    ]);
  });

  it("attributes nothing to an item with no recipe behind it", () => {
    const breakdown = componentBreakdown(
      [item("Veg Burger", 1), item("Mystery Special", 4)],
      RECIPES,
    );

    expect(sharesFor(breakdown, "buns")).toEqual([
      { name: "Veg Burger", qty: 1 },
    ]);
    expect(breakdown.every((entry) => entry.sold.length === 1)).toBe(true);
  });

  it("comes to nothing when nothing sold has a recipe", () => {
    expect(componentBreakdown([item("Mystery Special", 4)], RECIPES)).toEqual(
      [],
    );
  });
});
