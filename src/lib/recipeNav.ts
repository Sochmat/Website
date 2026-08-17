// Which Setup screen a recipe form belongs to.
//
// Item recipes and add-on recipes are one collection edited by one form; only
// the list they were opened from differs, carried as `?from=addons` so Save
// and Cancel land back where the user started.

export const ITEM_RECIPE_PATH = "/inventory-management/setup/item-recipe";
export const ADDON_RECIPE_PATH = "/inventory-management/setup/addon-recipe";

/** The list this form should return to. Anything unrecognised means items. */
export function recipeListPath(from: string | null | undefined): string {
  return from === "addons" ? ADDON_RECIPE_PATH : ITEM_RECIPE_PATH;
}

/** Label for the back link above the form. */
export function recipeListLabel(from: string | null | undefined): string {
  return from === "addons" ? "Addon recipes" : "Item recipes";
}

/** Heading noun for the form page. */
export function recipeNoun(from: string | null | undefined): string {
  return from === "addons" ? "addon recipe" : "item recipe";
}
