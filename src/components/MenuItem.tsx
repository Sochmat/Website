"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Product, useCart, buildCartItemId } from "@/context/CartContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import SubscriptionChoiceSheet from "./SubscriptionChoiceSheet";
import AddToCartSheet from "./AddToCartSheet";
import IngredientsSheet from "./IngredientsSheet";
import Shimmer from "@/components/ui/Shimmer";
import { ShimmerImg } from "@/components/ui/ShimmerImage";

interface MenuItemProps {
  product: Product;
  addOnProducts?: Product[];
}

export default function MenuItem({
  product,
  addOnProducts = [],
}: MenuItemProps) {
  const router = useRouter();
  const { items, addToCart, updateQuantity } = useCart();
  const { open: storeOpen } = useStoreStatus();
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [ingredientsSheetOpen, setIngredientsSheetOpen] = useState(false);

  // Items with variants and/or add-ons are configured in a sheet and can land
  // on multiple cart lines, so the card just totals the quantity across them.
  const hasOptions =
    (product.variants?.length ?? 0) > 0 || addOnProducts.length > 0;
  const plainCartItemId = buildCartItemId(product.id);
  const plainLine = items.find((item) => item.cartItemId === plainCartItemId);
  const quantity = hasOptions
    ? items
        .filter((item) => item.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0)
    : plainLine?.quantity || 0;

  const handleAddClick = () => {
    if (product.isAvailableForSubscription) {
      setSubscriptionSheetOpen(true);
    } else if (hasOptions) {
      setAddSheetOpen(true);
    } else {
      addToCart(product);
    }
  };

  const handleSubscribe = () => {
    setSubscriptionSheetOpen(false);
    router.push(`/subscribe?productId=${product.id}`);
  };

  // `discount` is free-text on the menu item, so "0" / "" / undefined all mean
  // "no offer" — in that case neither the struck-out price nor the tag belongs.
  const discountPercent = Number(product.discount) || 0;
  const showOriginalPrice = product.originalPrice > product.price;

  // Shared by the card and the pinned footer of the ingredients sheet, so the
  // two can't drift apart.
  const priceRow = (
    <div className="flex gap-[8px] px-[8px] items-center justify-between">
      <div className="flex gap-[4px] items-end flex-wrap">
        <span className="text-[#111] text-[16px] font-semibold leading-[18px]">
          ₹{product.price}/-
        </span>
        {showOriginalPrice && (
          <span className="text-[#666] text-[12px] line-through leading-[16px]">
            ₹{product.originalPrice}/-
          </span>
        )}
        {discountPercent > 0 && (
          <span className="border border-[#00a86e] text-[#00a86e] text-[11px] font-semibold px-[8px] py-[2px] rounded-[24px] leading-[14px]">
            {discountPercent}% off
          </span>
        )}
      </div>

      {storeOpen &&
        (!hasOptions && quantity > 0 ? (
          <div className="shrink-0 bg-[#f56215] text-white text-[16px] font-semibold uppercase rounded-[6px] flex items-center justify-between w-[84px] px-[12px] py-[6px]">
            <button
              onClick={() => updateQuantity(plainCartItemId, quantity - 1)}
            >
              -
            </button>
            <span className="text-[14px]">{quantity}</span>
            <button
              onClick={() => updateQuantity(plainCartItemId, quantity + 1)}
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddClick}
            className="relative shrink-0 flex items-center justify-center bg-[#f56215] text-white text-[16px] font-semibold uppercase rounded-[6px] w-[84px] px-[12px] py-[6px] text-center leading-[18px]"
          >
            Add<span className="text-[14px] font-medium ml-1">+</span>
            {hasOptions && quantity > 0 && (
              <span className="absolute -top-2 -right-2 bg-white text-[#f56215] border border-[#f56215] text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {quantity}
              </span>
            )}
          </button>
        ))}
    </div>
  );

  return (
    <div className="bg-white overflow-hidden relative">
      <div className="flex gap-[12px]">
        {/* Thumbnail */}
        <div className="relative w-[112px] h-[112px] shrink-0 rounded-[12px] overflow-hidden">
          <ShimmerImg
            src={product.image || "/food.png"}
            alt={product.name}
            className="w-full h-full object-cover"
          />

          {/* Veg / non-veg marker — sits on the photo, so it needs an opaque
              backing to stay legible. */}
          <div
            className={`absolute top-[6px] left-[6px] w-[16px] h-[16px] bg-white border-2 ${
              product.isVeg ? "border-green-600" : "border-red-600"
            } flex items-center justify-center rounded-[2px]`}
          >
            <div
              className={`w-[8px] h-[8px] rounded-full ${
                product.isVeg ? "bg-green-600" : "bg-red-600"
              }`}
            />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0 flex flex-col gap-[8px]">
          {/* Title */}
          <h3 className="text-black text-[16px] font-semibold leading-[24px]">
            {product.name}
          </h3>

          {/* Badges, then the button that opens the sheet holding the
              description, nutrients and ingredients. */}
          <div className="flex items-center gap-[4px] flex-wrap">
            {product.badge &&
              product.badge
                .split(",")
                .map((b) => b.trim())
                .filter(Boolean)
                .map((b, i) => (
                  <span
                    key={i}
                    className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[12px] font-semibold px-[12px] py-[4px] rounded-[18px] tracking-[-0.6px] leading-[16px]"
                  >
                    {b}
                  </span>
                ))}
            <button
              type="button"
              onClick={() => setIngredientsSheetOpen(true)}
              className="bg-[#e6e6e6] text-[#333] text-[12px] font-medium pl-[12px] pr-[8px] py-[4px] rounded-[50px] leading-[16px] flex items-center gap-[2px]"
            >
              view details
              <svg
                className="w-[12px] h-[12px]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {priceRow}
        </div>
      </div>

      <SubscriptionChoiceSheet
        open={subscriptionSheetOpen}
        onClose={() => setSubscriptionSheetOpen(false)}
        product={product}
        onSubscribe={handleSubscribe}
        onOrderOnce={() => addToCart(product)}
      />

      {addSheetOpen && (
        <AddToCartSheet
          open
          onClose={() => setAddSheetOpen(false)}
          product={product}
          addOnProducts={addOnProducts}
          onConfirm={(selection) => addToCart(product, selection)}
        />
      )}

      <IngredientsSheet
        open={ingredientsSheetOpen}
        onClose={() => setIngredientsSheetOpen(false)}
        product={product}
        footer={priceRow}
      />
    </div>
  );
}

/**
 * A MenuItem-shaped placeholder: same 112px thumbnail, same content column.
 *
 * Kept next to the real card on purpose — the two layouts have to stay in step,
 * and they will drift if the skeleton lives somewhere else.
 */
export function MenuItemSkeleton() {
  return (
    <div className="bg-white overflow-hidden relative">
      <div className="flex gap-[12px]">
        <Shimmer
          rounded="rounded-[12px]"
          className="w-[112px] h-[112px] shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-[8px]">
          <Shimmer rounded="rounded" className="h-5 w-2/3" />
          <div className="flex items-center gap-[4px]">
            <Shimmer rounded="rounded-[18px]" className="h-6 w-20" />
            <Shimmer rounded="rounded-[18px]" className="h-6 w-16" />
          </div>
          <div className="flex items-center justify-between gap-2 mt-auto">
            <Shimmer rounded="rounded" className="h-5 w-16" />
            <Shimmer rounded="rounded-[8px]" className="h-9 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
