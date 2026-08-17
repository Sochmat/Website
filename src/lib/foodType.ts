/** The three-way veg marker shown on every item card, cart line and sheet. */
export type FoodType = "veg" | "nonveg" | "egg";

export const FOOD_TYPE_OPTIONS: { value: FoodType; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "nonveg", label: "Non-veg" },
  { value: "egg", label: "Egg" },
];

/** Tailwind classes for the indicator, keyed by marker. */
export const FOOD_TYPE_COLORS: Record<
  FoodType,
  { border: string; dot: string; text: string }
> = {
  veg: { border: "border-green-600", dot: "bg-green-600", text: "text-green-700" },
  nonveg: { border: "border-red-600", dot: "bg-red-600", text: "text-red-700" },
  egg: { border: "border-amber-500", dot: "bg-amber-500", text: "text-amber-600" },
};

/**
 * Reads the marker off an item. Documents written before `foodType` existed
 * only carry the legacy `isVeg` boolean, so fall back to it.
 */
export function resolveFoodType(item: {
  foodType?: FoodType | string | null;
  isVeg?: boolean;
}): FoodType {
  if (
    item.foodType === "veg" ||
    item.foodType === "nonveg" ||
    item.foodType === "egg"
  ) {
    return item.foodType;
  }
  return item.isVeg === false ? "nonveg" : "veg";
}

/**
 * The legacy boolean, kept in sync on every write so anything still reading
 * `isVeg` (subscription menu, Petpooja sync, print agent) keeps working.
 * Egg counts as non-veg for that older two-way world.
 */
export function isVegFoodType(foodType: FoodType): boolean {
  return foodType === "veg";
}
