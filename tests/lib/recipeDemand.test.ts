import { describe, expect, it } from "vitest";
import {
  componentDemand,
  demandByRefType,
  type SoldItem,
} from "@/lib/recipeDemand";
import { recipesByNameKey } from "@/lib/menuRecipes";
import type { ItemRecipe, ItemRecipeLine } from "@/lib/itemRecipes";

const recipe = (name: string, lines: ItemRecipeLine[]): ItemRecipe => ({
  _id: `r-${name}`,
  name,
  nameKey: name.toLowerCase(),
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

const DAL_RICE = recipe("Dal Rice", [raw("rice", 150), production("dal", 200)]);
const JEERA_RICE = recipe("Jeera Rice", [raw("rice", 180), raw("jeera", 2)]);

const RECIPES = recipesByNameKey([DAL_RICE, JEERA_RICE]);

const item = (name: string, quantity: number): SoldItem => ({ name, quantity });

describe("componentDemand", () => {
  it("scales every component by the quantity sold", () => {
    const { demand, unmapped } = componentDemand([item("Dal Rice", 2)], RECIPES);

    expect(unmapped).toEqual([]);
    expect(demand).toEqual([
      { refType: "raw", refId: "rice", qty: 300 },
      { refType: "production", refId: "dal", qty: 400 },
    ]);
  });

  it("scales the same way for a large uploaded quantity", () => {
    const { demand } = componentDemand([item("Dal Rice", 120)], RECIPES);

    expect(demand).toEqual([
      { refType: "raw", refId: "rice", qty: 18000 },
      { refType: "production", refId: "dal", qty: 24000 },
    ]);
  });

  it("sums a component shared by two items", () => {
    const { demand } = componentDemand(
      [item("Dal Rice", 1), item("Jeera Rice", 1)],
      RECIPES,
    );

    expect(demand).toContainEqual({ refType: "raw", refId: "rice", qty: 330 });
    expect(demand.filter((l) => l.refId === "rice")).toHaveLength(1);
  });

  it("keeps a production component apart from a raw one of the same id", () => {
    const clash = recipesByNameKey([
      recipe("Curd Rice", [raw("curd", 50), production("curd", 30)]),
    ]);

    const { demand } = componentDemand([item("Curd Rice", 1)], clash);

    expect(demand).toEqual([
      { refType: "raw", refId: "curd", qty: 50 },
      { refType: "production", refId: "curd", qty: 30 },
    ]);
  });

  it("matches the recipe however the item is cased or spaced", () => {
    const { demand, unmapped } = componentDemand(
      [item("  dal   RICE ", 1)],
      RECIPES,
    );

    expect(unmapped).toEqual([]);
    expect(demand).toHaveLength(2);
  });

  it("reports an item with no recipe instead of deducting for it", () => {
    const { demand, unmapped } = componentDemand(
      [item("Dal Rice", 1), item("Gulab Jamun", 3)],
      RECIPES,
    );

    expect(unmapped).toEqual(["Gulab Jamun"]);
    expect(demand).toHaveLength(2);
  });

  it("reports an empty recipe as unmapped", () => {
    const empty = recipesByNameKey([recipe("Plain Rice", [])]);

    expect(componentDemand([item("Plain Rice", 1)], empty)).toEqual({
      demand: [],
      unmapped: ["Plain Rice"],
    });
  });

  it("names an unmatched item once, however many lines it has", () => {
    const { unmapped } = componentDemand([item("", 1), item("", 2)], RECIPES);

    expect(unmapped).toEqual(["Unknown product"]);
  });

  it("deducts nothing for a missing or non-positive quantity", () => {
    expect(
      componentDemand(
        [
          item("Dal Rice", 0),
          item("Dal Rice", -2),
          { name: "Dal Rice", quantity: Number.NaN },
        ],
        RECIPES,
      ),
    ).toEqual({ demand: [], unmapped: [] });
  });

  it("skips a recipe line with no quantity or no component", () => {
    const junk = recipesByNameKey([
      recipe("Odd Bowl", [
        raw("rice", 100),
        raw("", 50),
        raw("ghee", 0),
        raw("salt", Number.NaN),
      ]),
    ]);

    expect(componentDemand([item("Odd Bowl", 2)], junk).demand).toEqual([
      { refType: "raw", refId: "rice", qty: 200 },
    ]);
  });

  it("has nothing to spend on an empty list", () => {
    expect(componentDemand([], RECIPES)).toEqual({ demand: [], unmapped: [] });
  });
});

describe("demandByRefType", () => {
  it("splits the demand by where the stock lives", () => {
    const { demand } = componentDemand([item("Dal Rice", 2)], RECIPES);

    expect(demandByRefType(demand, "raw")).toEqual(new Map([["rice", 300]]));
    expect(demandByRefType(demand, "production")).toEqual(
      new Map([["dal", 400]]),
    );
  });

  it("is empty when nothing of that kind was used", () => {
    const { demand } = componentDemand([item("Jeera Rice", 1)], RECIPES);

    expect(demandByRefType(demand, "production").size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Food items as components
// ---------------------------------------------------------------------------

const foodItem = (refId: string, qtyUsed: number): ItemRecipeLine => ({
  refType: "item",
  refId,
  qtyUsed,
});

// Dal Rice, plus a papad on the side. r-Dal Rice is DAL_RICE's id.
const COMBO = recipe("Dal Rice Combo", [
  foodItem("r-Dal Rice", 1),
  raw("papad", 2),
]);

const EMPTY = recipe("Empty Plate", []);
const COMBO_ON_EMPTY = recipe("Broken Combo", [
  foodItem("r-Empty Plate", 1),
  raw("papad", 2),
]);

describe("componentDemand with a food item as a component", () => {
  const RECIPES_WITH_COMBO = recipesByNameKey([DAL_RICE, JEERA_RICE, COMBO]);

  it("deducts what the named item is made of, not the item itself", () => {
    const { demand, unmapped } = componentDemand(
      [item("Dal Rice Combo", 1)],
      RECIPES_WITH_COMBO,
    );

    expect(unmapped).toEqual([]);
    // No row for the food item — it holds no stock of its own.
    expect(demand.every((d) => d.refType !== ("item" as never))).toBe(true);
    expect(demand).toEqual([
      { refType: "raw", refId: "rice", qty: 150 },
      { refType: "production", refId: "dal", qty: 200 },
      { refType: "raw", refId: "papad", qty: 2 },
    ]);
  });

  it("multiplies the nested components through both quantities", () => {
    // 3 combos, each holding 1 Dal Rice -> 3 × 150 gm rice, 3 × 2 papad.
    const { demand } = componentDemand(
      [item("Dal Rice Combo", 3)],
      RECIPES_WITH_COMBO,
    );

    expect(demandByRefType(demand, "raw").get("rice")).toBe(450);
    expect(demandByRefType(demand, "production").get("dal")).toBe(600);
    expect(demandByRefType(demand, "raw").get("papad")).toBe(6);
  });

  it("sums a material reached both directly and through a food item", () => {
    const RICE_TWICE = recipe("Extra Rice Combo", [
      foodItem("r-Dal Rice", 1), // 150 gm rice inside
      raw("rice", 50), // and 50 gm on top
    ]);
    const { demand } = componentDemand(
      [item("Extra Rice Combo", 1)],
      recipesByNameKey([DAL_RICE, RICE_TWICE]),
    );

    expect(demandByRefType(demand, "raw").get("rice")).toBe(200);
  });

  it("expands a food item nested two levels down", () => {
    const OUTER = recipe("Feast", [foodItem("r-Dal Rice Combo", 2)]);
    const { demand, unmapped } = componentDemand(
      [item("Feast", 1)],
      recipesByNameKey([DAL_RICE, COMBO, OUTER]),
    );

    expect(unmapped).toEqual([]);
    expect(demandByRefType(demand, "raw").get("rice")).toBe(300);
    expect(demandByRefType(demand, "raw").get("papad")).toBe(4);
  });

  it("deducts nothing at all when the food item inside is empty", () => {
    const { demand, unmapped } = componentDemand(
      [item("Broken Combo", 5)],
      recipesByNameKey([EMPTY, COMBO_ON_EMPTY]),
    );

    // Not even the papad it lists directly — an item built on something
    // nobody has described yet is itself undescribed.
    expect(demand).toEqual([]);
    expect(unmapped).toEqual(["Broken Combo"]);
  });

  it("reports the name that was sold, not the empty item inside it", () => {
    const { unmapped } = componentDemand(
      [item("Broken Combo", 1)],
      recipesByNameKey([EMPTY, COMBO_ON_EMPTY]),
    );

    expect(unmapped).toEqual(["Broken Combo"]);
    expect(unmapped).not.toContain("Empty Plate");
  });

  it("deducts nothing when the food item inside has been deleted", () => {
    const { demand, unmapped } = componentDemand(
      [item("Dal Rice Combo", 1)],
      recipesByNameKey([COMBO]), // Dal Rice is gone
    );

    expect(demand).toEqual([]);
    expect(unmapped).toEqual(["Dal Rice Combo"]);
  });

  it("leaves other items on the same order alone", () => {
    const { demand, unmapped } = componentDemand(
      [item("Broken Combo", 1), item("Jeera Rice", 2)],
      recipesByNameKey([EMPTY, COMBO_ON_EMPTY, JEERA_RICE]),
    );

    expect(unmapped).toEqual(["Broken Combo"]);
    expect(demandByRefType(demand, "raw").get("rice")).toBe(360);
  });

  it("terminates and deducts nothing on data that already loops", () => {
    // Nothing can save this, but a walk over it must still come back.
    const a = recipe("A", [foodItem("r-B", 1)]);
    const b = recipe("B", [foodItem("r-A", 1)]);
    const { demand, unmapped } = componentDemand(
      [item("A", 1)],
      recipesByNameKey([a, b]),
    );

    expect(demand).toEqual([]);
    expect(unmapped).toEqual(["A"]);
  });
});

// ---------------------------------------------------------------------------
// An add-on that is a portion of a dish already costed
// ---------------------------------------------------------------------------

describe("an add-on built on an existing dish", () => {
  // The dish, mapped as normal.
  const JEERA_RICE_DISH = recipe("Jeera Rice", [
    raw("rice", 180),
    raw("jeera", 2),
    raw("ghee", 5),
  ]);
  // The add-on: its own menu item, its own recipe, one line pointing at the
  // dish rather than repeating the dish's ingredients.
  const EXTRA_JEERA_RICE = recipe("Extra Jeera Rice", [
    foodItem("r-Jeera Rice", 1),
  ]);

  const RECIPES_WITH_ADDON = recipesByNameKey([
    DAL_RICE,
    JEERA_RICE_DISH,
    EXTRA_JEERA_RICE,
  ]);

  it("deducts the dish's components when the add-on is sold", () => {
    const { demand, unmapped } = componentDemand(
      [item("Extra Jeera Rice", 1)],
      RECIPES_WITH_ADDON,
    );

    expect(unmapped).toEqual([]);
    expect(demandByRefType(demand, "raw").get("rice")).toBe(180);
    expect(demandByRefType(demand, "raw").get("jeera")).toBe(2);
    expect(demandByRefType(demand, "raw").get("ghee")).toBe(5);
  });

  it("does not deduct the dish itself as a product", () => {
    // Expanding a food-item line pulls its components; it does not sell it.
    // Only the add-on was ordered, so only its 180 gm of rice moves.
    const { demand } = componentDemand(
      [item("Extra Jeera Rice", 1)],
      RECIPES_WITH_ADDON,
    );

    expect(demandByRefType(demand, "raw").get("rice")).toBe(180);
  });

  it("sums the plate and its add-on into one row per material", () => {
    // 2 × Dal Rice, each with 1 × Extra Jeera Rice — the flattened order.
    const { demand, unmapped } = componentDemand(
      [item("Dal Rice", 2), item("Extra Jeera Rice", 2)],
      RECIPES_WITH_ADDON,
    );

    expect(unmapped).toEqual([]);
    // 300 gm from the plates + 360 gm through the add-on.
    expect(demandByRefType(demand, "raw").get("rice")).toBe(660);
    expect(demandByRefType(demand, "production").get("dal")).toBe(400);
    expect(demandByRefType(demand, "raw").get("jeera")).toBe(4);
    expect(demandByRefType(demand, "raw").get("ghee")).toBe(10);
  });

  it("follows the dish when the dish's recipe changes", () => {
    const LEANER = recipe("Jeera Rice", [raw("rice", 150), raw("jeera", 2)]);
    const { demand } = componentDemand(
      [item("Extra Jeera Rice", 1)],
      recipesByNameKey([LEANER, EXTRA_JEERA_RICE]),
    );

    expect(demandByRefType(demand, "raw").get("rice")).toBe(150);
    expect(demandByRefType(demand, "raw").get("ghee")).toBeUndefined();
  });

  it("carries components of its own alongside the dish it names", () => {
    const WITH_PAPAD = recipe("Rice And Papad", [
      foodItem("r-Jeera Rice", 1),
      raw("papad", 1),
    ]);
    const { demand } = componentDemand(
      [item("Rice And Papad", 2)],
      recipesByNameKey([JEERA_RICE_DISH, WITH_PAPAD]),
    );

    expect(demandByRefType(demand, "raw").get("rice")).toBe(360);
    expect(demandByRefType(demand, "raw").get("papad")).toBe(2);
  });

  it("deducts nothing when the dish it names has been deleted", () => {
    const { demand, unmapped } = componentDemand(
      [item("Extra Jeera Rice", 1)],
      recipesByNameKey([EXTRA_JEERA_RICE]),
    );

    expect(demand).toEqual([]);
    expect(unmapped).toEqual(["Extra Jeera Rice"]);
  });
});

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/** Same dish, one size bigger. */
const variantRecipe = (
  name: string,
  variantName: string,
  lines: ItemRecipeLine[],
): ItemRecipe => ({
  _id: `r-${name}-${variantName}`,
  name,
  nameKey: name.toLowerCase(),
  variantName,
  variantKey: variantName.toLowerCase(),
  lines,
  totalCost: 0,
});

describe("componentDemand with variants", () => {
  const LARGE = variantRecipe("Dal Rice", "Large", [
    raw("rice", 250),
    production("dal", 300),
  ]);
  const SIZED = recipesByNameKey([DAL_RICE, LARGE]);

  it("deducts the variant's own recipe when one is written", () => {
    const { demand, unmapped } = componentDemand(
      [{ name: "Dal Rice", variantName: "Large", quantity: 1 }],
      SIZED,
    );

    expect(unmapped).toEqual([]);
    expect(demandByRefType(demand, "raw").get("rice")).toBe(250);
    expect(demandByRefType(demand, "production").get("dal")).toBe(300);
  });

  it("falls back to the item's recipe for a size nobody has mapped", () => {
    // "Small" has no recipe — it deducts the base, exactly as every variant
    // did before sizes could be mapped at all.
    const { demand, unmapped } = componentDemand(
      [{ name: "Dal Rice", variantName: "Small", quantity: 1 }],
      SIZED,
    );

    expect(unmapped).toEqual([]);
    expect(demandByRefType(demand, "raw").get("rice")).toBe(150);
  });

  it("keeps deducting the base recipe when no variant is named at all", () => {
    const { demand } = componentDemand([item("Dal Rice", 1)], SIZED);
    expect(demandByRefType(demand, "raw").get("rice")).toBe(150);
  });

  it("matches a variant however it was capitalised or spaced", () => {
    const { demand } = componentDemand(
      [{ name: "Dal Rice", variantName: "  large ", quantity: 1 }],
      SIZED,
    );
    expect(demandByRefType(demand, "raw").get("rice")).toBe(250);
  });

  it("keeps two sizes of one dish apart on the same order", () => {
    const { demand } = componentDemand(
      [
        { name: "Dal Rice", variantName: "Large", quantity: 2 },
        { name: "Dal Rice", variantName: "Small", quantity: 3 },
      ],
      SIZED,
    );

    // 2 × 250 large + 3 × 150 falling back to the base.
    expect(demandByRefType(demand, "raw").get("rice")).toBe(950);
    expect(demandByRefType(demand, "production").get("dal")).toBe(1200);
  });

  it("reports an unwritten item as unmapped even when a size is named", () => {
    const { demand, unmapped } = componentDemand(
      [{ name: "Ghost Dish", variantName: "Large", quantity: 1 }],
      SIZED,
    );

    expect(demand).toEqual([]);
    expect(unmapped).toEqual(["Ghost Dish"]);
  });

  it("falls back when the variant's recipe exists but lists nothing", () => {
    const EMPTY_LARGE = variantRecipe("Dal Rice", "Large", []);
    const { demand } = componentDemand(
      [{ name: "Dal Rice", variantName: "Large", quantity: 1 }],
      recipesByNameKey([DAL_RICE, EMPTY_LARGE]),
    );

    // An empty recipe says nothing about the size, so the item's own stands.
    expect(demandByRefType(demand, "raw").get("rice")).toBe(150);
  });
});
