import { describe, expect, it } from "vitest";
import {
  ADDON_RECIPE_PATH,
  ITEM_RECIPE_PATH,
  recipeListLabel,
  recipeListPath,
  recipeNoun,
} from "@/lib/recipeNav";

describe("recipeListPath", () => {
  it("returns to the add-on list when the form was opened from it", () => {
    expect(recipeListPath("addons")).toBe(ADDON_RECIPE_PATH);
  });

  it("defaults to the item list for anything else", () => {
    expect(recipeListPath(null)).toBe(ITEM_RECIPE_PATH);
    expect(recipeListPath(undefined)).toBe(ITEM_RECIPE_PATH);
    expect(recipeListPath("")).toBe(ITEM_RECIPE_PATH);
    expect(recipeListPath("nonsense")).toBe(ITEM_RECIPE_PATH);
  });
});

describe("labels", () => {
  it("names the screen the user came from", () => {
    expect(recipeListLabel("addons")).toBe("Addon recipes");
    expect(recipeListLabel(null)).toBe("Item recipes");
    expect(recipeNoun("addons")).toBe("addon recipe");
    expect(recipeNoun(null)).toBe("item recipe");
  });
});
