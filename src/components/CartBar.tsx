"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { ArrowRight } from "lucide-react";

export default function CartBar() {
  const { totalItems } = useCart();
  const { open: storeOpen } = useStoreStatus();

  if (totalItems === 0 || !storeOpen) return null;

  return (
    // Whole pill is the tap target now that it holds nothing but the label.
    <Link
      href="/order"
      className="fixed bottom-8 left-1/2 -translate-x-1/2 flex h-12 items-center justify-between gap-3 px-4 rounded-full w-[320px] max-w-[90%] z-50
        bg-[#1c1c1c]/95 supports-[backdrop-filter:blur(0px)]:bg-[#333333]/65
        backdrop-blur-xl backdrop-saturate-150
        border border-white/15
        shadow-[0_8px_32px_0_rgba(0,0,0,0.35)]"
    >
      <span className="text-sm text-white/90">
        {totalItems} item{totalItems > 1 ? "s" : ""} added
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold text-white">
        View Cart
        <ArrowRight className="w-4 h-4" />
      </span>
    </Link>
  );
}
