"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Product, useCart } from "@/context/CartContext";
import SubscriptionChoiceSheet from "./SubscriptionChoiceSheet";

interface RecommendedItemProps {
  product: Product;
}

export default function RecommendedItem({ product }: RecommendedItemProps) {
  const router = useRouter();
  const { addToCart } = useCart();
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);

  const handleAddClick = () => {
    if (product.isAvailableForSubscription) {
      setSubscriptionSheetOpen(true);
    } else {
      addToCart(product);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-[120px] shrink-0 relative">
      <div className="aspect-square relative rounded-lg overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover"
          unoptimized
        />
        <button
          onClick={handleAddClick}
          className="absolute right-2 bottom-2 bg-[#2d5cf2] p-1.5 rounded-lg shadow-md"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
        <div className="absolute left-2 bottom-2">
          <div
            className={`w-4 h-4 bg-white border-2 ${
              product.isVeg ? "border-green-600" : "border-red-600"
            } flex items-center justify-center`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                product.isVeg ? "bg-green-600" : "bg-red-600"
              }`}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-sm text-black leading-tight">
            {product.name}
          </p>
          <p className="text-[#f56215] text-xs font-medium tracking-tight">
            {product.kcal} kcal | {product.protein}g Protein
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[#111] font-semibold text-sm">
              ₹{product.price}/-
            </span>
            <span className="text-[#666] text-xs line-through">
              ₹{product.originalPrice}/-
            </span>
          </div>
          <span className="border border-[#8bc11a] text-[#8bc11a] text-[11px] font-semibold px-2 py-0.5 rounded-full">
            {product.discount}
          </span>
        </div>
      </div>

      <SubscriptionChoiceSheet
        open={subscriptionSheetOpen}
        onClose={() => setSubscriptionSheetOpen(false)}
        product={product}
        onSubscribe={() => {
          setSubscriptionSheetOpen(false);
          router.push(`/subscribe?productId=${product.id}`);
        }}
        onOrderOnce={() => addToCart(product)}
      />
    </div>
  );
}
