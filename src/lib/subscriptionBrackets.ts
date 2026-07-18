import { GST_RATE } from "./subscription";
import {
  BRACKET_KEYS,
  type ProteinBracketKey,
  type SubscriptionBracket,
  type SubscriptionDiet,
  type SubscriptionMenuItem,
} from "./types";

/** Meals granted by one purchase. */
export const MEALS_PER_PLAN = 7;
/** Days after payment that unspent credits lapse. */
export const CREDIT_VALIDITY_DAYS = 30;

const DIETS: readonly SubscriptionDiet[] = ["veg", "veg-nonveg"];

export function isBracketKey(v: unknown): v is ProteinBracketKey {
  return typeof v === "string" && (BRACKET_KEYS as readonly string[]).includes(v);
}

export function isDiet(v: unknown): v is SubscriptionDiet {
  return typeof v === "string" && (DIETS as readonly string[]).includes(v);
}

type PriceFields = Pick<
  SubscriptionBracket,
  "vegPrice" | "nonVegPrice" | "vegDiscount" | "nonVegDiscount"
>;

/**
 * Pre-GST *list* price of one meal (before discount). A "veg-nonveg" plan always
 * pays `nonVegPrice`, even on the days the customer schedules a veg item — that
 * is what unlocks the non-veg list for the whole plan.
 */
export function pricePerMeal(bracket: PriceFields, diet: SubscriptionDiet): number {
  return diet === "veg-nonveg" ? bracket.nonVegPrice : bracket.vegPrice;
}

/** The discount percent (0–100) that applies to the given diet's list price. */
export function discountPercent(bracket: PriceFields, diet: SubscriptionDiet): number {
  const raw = diet === "veg-nonveg" ? bracket.nonVegDiscount : bracket.vegDiscount;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, raw));
}

/** Apply a percentage discount to a whole-rupee price, rounded to whole rupees. */
export function applyDiscount(price: number, percent: number): number {
  const pct = Math.min(100, Math.max(0, percent));
  return Math.round(price * (1 - pct / 100));
}

/**
 * The price we actually charge for one meal — list price with the bracket's
 * discount applied. This is authoritative; the customer UI mirrors it.
 */
export function effectivePricePerMeal(bracket: PriceFields, diet: SubscriptionDiet): number {
  return applyDiscount(pricePerMeal(bracket, diet), discountPercent(bracket, diet));
}

export interface BracketPlanTotals {
  pricePerMeal: number;
  mealCount: number;
  subtotal: number;
  tax: number;
  totalAmount: number;
}

/**
 * The authoritative money for a plan. The server calls this with a bracket read
 * straight from Mongo; no price ever comes off a request body.
 */
export function computeBracketPlanTotals(
  bracket: PriceFields & Pick<SubscriptionBracket, "active">,
  diet: SubscriptionDiet,
  mealCount: number = MEALS_PER_PLAN,
): BracketPlanTotals {
  if (bracket.active === false) {
    throw new Error("Bracket is not active");
  }
  if (!Number.isInteger(mealCount) || mealCount <= 0) {
    throw new Error(`Invalid mealCount: ${mealCount}`);
  }

  const price = effectivePricePerMeal(bracket, diet);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price for diet "${diet}": ${price}`);
  }

  const subtotal = price * mealCount;
  const tax = Math.round(subtotal * GST_RATE);

  return {
    pricePerMeal: price,
    mealCount,
    subtotal,
    tax,
    totalAmount: subtotal + tax,
  };
}

type AllowanceFields = Pick<SubscriptionMenuItem, "bracket" | "isVeg" | "hidden">;

/**
 * The single choke point for "may this plan schedule this item?". Both the
 * customer menu endpoint and the schedule endpoint route through it, so the
 * diet rule can never drift between what we show and what we accept.
 */
export function isItemAllowed(
  item: AllowanceFields,
  bracket: ProteinBracketKey,
  diet: SubscriptionDiet,
): boolean {
  if (item.hidden) return false;
  if (item.bracket !== bracket) return false;
  return diet === "veg-nonveg" || item.isVeg === true;
}

export function filterItemsForPlan<T extends AllowanceFields>(
  items: T[],
  bracket: ProteinBracketKey,
  diet: SubscriptionDiet,
): T[] {
  return items.filter((i) => isItemAllowed(i, bracket, diet));
}

export interface PublicSubscriptionItem {
  id: string;
  bracket: ProteinBracketKey;
  name: string;
  description?: string;
  protein: number;
  kcal: number;
  fiber?: number;
  carbs?: number;
  image: string;
  isVeg: boolean;
  ingredients?: string[];
  sortOrder?: number;
  /** The meal's à la carte (Zomato) price, shown for savings comparison. */
  referencePrice: number;
}

/**
 * Strip internal fields before any customer-facing response.
 *
 * Built by explicit assignment, never by spreading the Mongo doc, so no internal
 * field is ever shipped by accident. `referencePrice` is deliberately included —
 * it's the à la carte (Zomato) price we show for the savings comparison. The
 * key-set assertion in subscriptionBrackets.test.ts is what keeps this honest.
 */
export function toPublicSubscriptionItem(item: SubscriptionMenuItem): PublicSubscriptionItem {
  return {
    id: String(item._id),
    bracket: item.bracket,
    name: item.name,
    description: item.description,
    protein: item.protein,
    kcal: item.kcal,
    fiber: item.fiber,
    carbs: item.carbs,
    image: item.image,
    isVeg: item.isVeg,
    ingredients: item.ingredients,
    sortOrder: item.sortOrder,
    referencePrice: item.referencePrice,
  };
}
