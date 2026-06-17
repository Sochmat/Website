"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { MenuVariant, SelectedAddOn } from "@/lib/types";

export type { SelectedAddOn } from "@/lib/types";

export interface Product {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  price: number;
  originalPrice: number;
  discount: string;
  rating: number;
  reviews: string;
  badge: string | null;
  description?: string;
  fiber?: number;
  carbs?: number;
  ingredients?: string[];
  image: string;
  isVeg: boolean;
  isAvailableForSubscription?: boolean;
  addOns?: string[];
  variants?: MenuVariant[];
}

/** A user's choice when adding an item that has variants and/or add-ons. */
export interface CartSelection {
  variant?: MenuVariant;
  addOns?: SelectedAddOn[];
}

export interface CartItem extends Product {
  /** Composite identity: distinct variant/add-on combos are separate lines. */
  cartItemId: string;
  quantity: number;
  /** Chosen variant label, if any. */
  variantName?: string;
  /** Add-ons bundled into this line, with their quantities. */
  selectedAddOns?: SelectedAddOn[];
  /** Per-unit price of the item/variant alone (without add-ons), for display. */
  basePrice: number;
  // NOTE: `price`/`originalPrice` hold the per-unit BUNDLE price
  // (variant or base + add-ons), so totals keep summing `price * quantity`.
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, selection?: CartSelection) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalKcal: number;
  totalProtein: number;
  totalPrice: number;
  totalOriginalPrice: number;
  totalDiscount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/** Build a stable identity for a (product, variant, add-ons) combination so
 * the same item with different choices lands on separate cart lines, while
 * an identical re-add merges into the existing line. */
export function buildCartItemId(
  productId: string,
  variantName?: string,
  addOns?: SelectedAddOn[],
): string {
  const addOnSig = (addOns ?? [])
    .filter((a) => a.quantity > 0)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => `${a.id}:${a.quantity}`)
    .join(",");
  return `${productId}|${variantName ?? ""}|${addOnSig}`;
}

function addOnsTotal(addOns?: SelectedAddOn[]): number {
  return (addOns ?? []).reduce((sum, a) => sum + a.price * a.quantity, 0);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (product: Product, selection?: CartSelection) => {
    const variant = selection?.variant;
    const selectedAddOns = (selection?.addOns ?? []).filter(
      (a) => a.quantity > 0,
    );
    const variantName = variant?.name;
    const cartItemId = buildCartItemId(product.id, variantName, selectedAddOns);

    const basePrice = variant ? variant.price : product.price;
    const baseOriginalPrice = variant ? variant.price : product.originalPrice;
    const addOnsSum = addOnsTotal(selectedAddOns);
    const unitPrice = basePrice + addOnsSum;
    const unitOriginalPrice = baseOriginalPrice + addOnsSum;

    setItems((prev) => {
      const existing = prev.find((item) => item.cartItemId === cartItemId);
      if (existing) {
        return prev.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          ...product,
          cartItemId,
          quantity: 1,
          variantName,
          selectedAddOns: selectedAddOns.length ? selectedAddOns : undefined,
          basePrice,
          price: unitPrice,
          originalPrice: unitOriginalPrice,
        },
      ];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.cartItemId === cartItemId ? { ...item, quantity } : item,
      ),
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalKcal = items.reduce(
    (sum, item) => sum + item.kcal * item.quantity,
    0,
  );
  const totalProtein = items.reduce(
    (sum, item) => sum + item.protein * item.quantity,
    0,
  );
  const totalPrice = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const totalOriginalPrice = items.reduce(
    (sum, item) => sum + item.originalPrice * item.quantity,
    0,
  );
  const totalDiscount = totalOriginalPrice - totalPrice;

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalKcal,
        totalProtein,
        totalPrice,
        totalOriginalPrice,
        totalDiscount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
