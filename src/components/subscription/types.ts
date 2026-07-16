import type { Product } from "@/context/CartContext";
import type { ProteinBracketKey, SubscriptionDiet } from "@/lib/types";

/** The customer-safe shape returned by GET /api/subscriptions/menu. */
export interface SubscriptionItem {
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
  /** À la carte (Zomato) price, for the savings comparison. */
  referencePrice?: number;
}

export interface BracketOption {
  key: ProteinBracketKey;
  label: string;
  proteinMin: number;
  proteinMax: number;
  vegPrice: number;
  nonVegPrice: number;
  sortOrder: number;
}

export const DIET_LABELS: Record<SubscriptionDiet, string> = {
  veg: "Veg only",
  "veg-nonveg": "Veg + Non-veg",
};

/**
 * Plan names by position in the protein ladder (index 0..2 = ascending protein).
 * The name is the bracket's rung, not a DB value — kept here so the bracket
 * cards, the diet screen, and anywhere else stay in sync from one source.
 */
export const TIER_LABELS = ["Everyday", "Performance", "Peak"] as const;

/** Most imported items have no image yet — an admin content pass is pending. */
export const PLACEHOLDER_IMAGE = "";

export function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Adapt a subscription item to the shape IngredientsSheet expects. That sheet is
 * read-only and only reads image/name/badge/isVeg/description/nutrition/ingredients,
 * so the cart/pricing fields are inert placeholders just to satisfy the type.
 */
export function toProduct(it: SubscriptionItem): Product {
  return {
    id: it.id,
    name: it.name,
    kcal: it.kcal,
    protein: it.protein,
    price: 0,
    originalPrice: 0,
    discount: "",
    rating: 0,
    reviews: "",
    badge: null,
    description: it.description,
    fiber: it.fiber,
    carbs: it.carbs,
    ingredients: it.ingredients,
    image: it.image,
    isVeg: it.isVeg,
  };
}
