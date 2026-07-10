"use client";

import type { SubscriptionDiet } from "@/lib/types";
import { rupees } from "./types";

export default function DietCard({
  diet,
  pricePerMeal,
  onSelect,
}: {
  diet: SubscriptionDiet;
  pricePerMeal: number;
  onSelect: () => void;
}) {
  const isVegOnly = diet === "veg";
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border-2 border-transparent hover:border-[#f56215] transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#111]">
          {isVegOnly ? "Veg only" : "Veg + Non-veg"}
        </span>
        <span className="font-semibold text-[#111]">
          {rupees(pricePerMeal)}
          <span className="text-xs font-normal text-[#737373]"> / meal</span>
        </span>
      </div>
      <p className="text-xs text-[#737373] mt-1">
        {isVegOnly
          ? "Vegetarian meals only"
          : "Unlocks every meal in this bracket, veg and non-veg"}
      </p>
    </button>
  );
}
