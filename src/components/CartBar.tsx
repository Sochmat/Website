"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { ArrowRight } from "lucide-react";

export default function CartBar() {
  const { totalItems, totalKcal, totalProtein } = useCart();

  if (totalItems === 0) return null;

  return (
    <div className="fixed bottom-9 left-1/2 -translate-x-1/2 bg-[#02583f] flex items-center justify-between p-4 rounded-2xl shadow-[0px_6px_8px_0px_rgba(2,88,63,0.2)] w-[320px] max-w-[90%] z-50">
      <div className="flex gap-1.5">
        <div className="bg-white flex flex-col items-center justify-center px-2 py-1 rounded-lg text-[#02583f]">
          <span className="font-medium text-base tracking-tight">
            {totalKcal}
          </span>
          <span className="text-xs tracking-tight">kcal</span>
        </div>
        <div className="bg-white flex flex-col items-center justify-center px-2 py-1 rounded-lg text-[#02583f]">
          <span className="font-medium text-base tracking-tight">
            {totalProtein}g
          </span>
          <span className="text-xs tracking-tight">Protein</span>
        </div>
      </div>
      <Link href="/order">
        <div className="flex items-center gap-4">
          <div className="flex flex-col text-white">
            <span className="font-semibold text-sm">View Cart</span>
            <span className="text-xs">
              {totalItems} item{totalItems > 1 ? "s" : ""} added
            </span>
          </div>
          <ArrowRight className="w-5 h-5 text-white color-white" />
        </div>
      </Link>
    </div>
  );
}
