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
