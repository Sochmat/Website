"use client";

import { useState } from "react";
import ShimmerImage from "@/components/ui/ShimmerImage";
import { useRouter } from "next/navigation";
import { Product, useCart } from "@/context/CartContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import SubscriptionChoiceSheet from "./SubscriptionChoiceSheet";
import { PlusIcon } from "lucide-react";
import FoodTypeDot from "./FoodTypeDot";

interface RecommendedItemProps {
  product: Product;
}

export default function RecommendedItem({ product }: RecommendedItemProps) {
  const router = useRouter();
  const { addToCart } = useCart();
  const { open: storeOpen } = useStoreStatus();
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
        <ShimmerImage
          src={product.image}
          alt={product.name}
          fill
          className="object-cover"
          unoptimized
        />
        {storeOpen && (
          <button
            onClick={handleAddClick}
            className="absolute right-2 bottom-2 bg-white p-1.5 rounded-lg shadow-md border border-[#f56215]"
          >
            <PlusIcon className="w-5 h-5 text-[#f56215]" />
          </button>
        )}
        <div className="absolute left-2 top-2">
          <FoodTypeDot item={product} className="bg-white" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semibold text-sm text-black leading-tight">
          {product.name}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[#b2b2b2] font-semibold text-sm">
              ₹{product.price}/-
            </span>
            {product.originalPrice > product.price && (
              <span className="text-[#666] text-xs line-through">
                ₹{product.originalPrice}/-
              </span>
            )}
          </div>
          {Number(product.discount) ? (
            <span className="border border-[#8bc11a] text-[#8bc11a] text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {product.discount} %
            </span>
          ) : null}
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
