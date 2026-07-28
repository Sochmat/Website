import { describe, expect, it } from "vitest";
import {
  componentDemand,
  demandByRefType,
  type SoldItem,
} from "./recipeDemand";
import { recipesByNameKey } from "./menuRecipes";
import type { ItemRecipe, ItemRecipeLine } from "./itemRecipes";

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
