"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Product, useCart } from "@/context/CartContext";
import SubscriptionChoiceSheet from "./SubscriptionChoiceSheet";
import IngredientsSheet from "./IngredientsSheet";

interface MenuItemProps {
  product: Product;
}

export default function MenuItem({ product }: MenuItemProps) {
  const router = useRouter();
  const { items, addToCart, updateQuantity } = useCart();
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [ingredientsSheetOpen, setIngredientsSheetOpen] = useState(false);
  const cartItem = items.find((item) => item.id === product.id);
  const quantity = cartItem?.quantity || 0;

  console.log({ product });

  const handleAddClick = () => {
    if (product.isAvailableForSubscription) {
      setSubscriptionSheetOpen(true);
    } else {
      addToCart(product);
    }
  };

  const handleSubscribe = () => {
    setSubscriptionSheetOpen(false);
    router.push(`/subscribe?productId=${product.id}`);
  };

  return (
    <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.12)] overflow-hidden relative">
      {/* Image area */}
      <div className="relative w-full h-[192px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image || "/food.png"}
          alt={product.name}
          className="w-full h-full object-cover"
        />

        {/* Badges on image */}
        {product.badge && (
          <div className="absolute bottom-[9px] left-[8px] flex gap-[6px]">
            {product.badge.split(",").map((b, i) => (
              <span
                key={i}
                className={`bg-white text-[12px] font-medium px-[12px] py-[4px] rounded-[18px] tracking-[-0.6px] ${
                  i === 0 ? "text-black" : "text-[#f56215]"
                }`}
              >
                {b.trim()}
              </span>
            ))}
          </div>
        )}

        {/* ADD button with slanted notch */}
        <div className="absolute bottom-0 right-[10px]">
          <svg
            className="absolute bottom-[-10px] right-[-10px]"
            style={{ width: "150px", height: "60px" }}
            viewBox="0 0 160 40"
            preserveAspectRatio="none"
            fill="white"
          >
            <path d="M58,0 L10,34 Q6,38 10,40 L160,40 L160,0 Z" />
          </svg>
          {quantity > 0 ? (
            <div className="relative z-[1] bg-[#f56215] text-white text-[16px] font-semibold uppercase rounded-[6px] flex items-center justify-between w-[84px] px-[12px] py-[6px] mb-[9px] mr-0 ml-auto mt-[11px]">
              <button onClick={() => updateQuantity(product.id, quantity - 1)}>
                -
              </button>
              <span className="text-[14px]">{quantity}</span>
              <button onClick={() => updateQuantity(product.id, quantity + 1)}>
                +
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddClick}
              className="relative z-[1] bg-[#f56215] text-white text-[16px] font-semibold uppercase rounded-[6px] w-[84px] px-[12px] py-[6px] text-center leading-[18px] mb-[9px] mt-[11px] block ml-auto"
            >
              Add<span className="text-[14px] font-medium">+</span>
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="px-[12px] pt-[12px] pb-[14px] flex flex-col gap-[12px]">
        {/* Veg indicator + Title */}
        <div className="flex gap-[16px] items-center">
          <div
            className={`w-[16px] h-[16px] shrink-0 border-2 ${
              product.isVeg ? "border-green-600" : "border-red-600"
            } flex items-center justify-center rounded-[2px]`}
          >
            <div
              className={`w-[8px] h-[8px] rounded-full ${
                product.isVeg ? "bg-green-600" : "bg-red-600"
              }`}
            />
          </div>
          <h3 className="text-black text-[16px] font-semibold leading-[24px]">
            {product.name}
          </h3>
        </div>

        {/* Nutrition pills */}
        <div className="flex gap-[4px] items-center flex-wrap">
          <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[12px] font-semibold px-[12px] py-[4px] rounded-[18px] tracking-[-0.6px] leading-[16px]">
            {product.kcal} kcal
          </span>
          <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[12px] font-semibold px-[12px] py-[4px] rounded-[18px] tracking-[-0.6px] leading-[16px]">
            {product.protein}g Protein
          </span>
          <button
            type="button"
            onClick={() => setIngredientsSheetOpen(true)}
            className="bg-[#e6e6e6] text-[#333] text-[12px] font-medium pl-[12px] pr-[8px] py-[4px] rounded-[50px] leading-[16px] flex items-center gap-[8px]"
          >
            View Ingredients
            <svg className="w-[16px] h-[16px] -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-[#999] text-[12px] leading-[1.5]">
            {product.description}
          </p>
        )}

        {/* Divider */}
        <div className="w-full h-[1px] bg-[#e6e6e6]" />

        {/* Price row */}
        <div className="flex gap-[4px] items-end">
          <span className="text-[#111] text-[16px] font-semibold leading-[18px]">
            ₹{product.price}/-
          </span>
          <span className="text-[#666] text-[12px] line-through leading-[16px]">
            ₹{product.originalPrice}/-
          </span>
          {product.discount && (
            <span className="border border-[#00a86e] text-[#00a86e] text-[11px] font-semibold px-[8px] py-[2px] rounded-[24px] leading-[14px]">
              {product.discount}% off
            </span>
          )}
        </div>
      </div>

      <SubscriptionChoiceSheet
        open={subscriptionSheetOpen}
        onClose={() => setSubscriptionSheetOpen(false)}
        product={product}
        onSubscribe={handleSubscribe}
        onOrderOnce={() => addToCart(product)}
      />

      <IngredientsSheet
        open={ingredientsSheetOpen}
        onClose={() => setIngredientsSheetOpen(false)}
        product={product}
      />
    </div>
  );
}
