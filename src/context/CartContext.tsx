"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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
  image: string;
  isVeg: boolean;
  isAvailableForSubscription?: boolean;
  addOns?: string[];
}

export interface CartItem extends Product {
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalKcal: number;
  totalProtein: number;
  totalPrice: number;
  totalOriginalPrice: number;
  totalDiscount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, quantity } : item,
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
