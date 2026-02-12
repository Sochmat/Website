"use client";

import { useRef, useEffect } from "react";
import type { Product } from "@/context/CartContext";

interface SubscriptionChoiceSheetProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onSubscribe: () => void;
  onOrderOnce: () => void;
}

export default function SubscriptionChoiceSheet({
  open,
  onClose,
  product,
  onSubscribe,
  onOrderOnce,
}: SubscriptionChoiceSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleOrderOnce = () => {
    onOrderOnce();
    onClose();
  };

  const handleSubscribe = () => {
    onSubscribe();
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[210] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-[211] max-w-[430px] mx-auto bg-white rounded-t-[24px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Add to order"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-4 pb-6 pt-2 flex flex-col">
          {product && (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-2 min-w-0">
                  <div
                    className={`w-4 h-4 border-2 shrink-0 mt-0.5 ${
                      product.isVeg ? "border-green-600" : "border-red-600"
                    } flex items-center justify-center`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        product.isVeg ? "bg-green-600" : "bg-red-600"
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[#111] font-semibold text-base">
                      {product.name}
                    </h3>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-xs font-semibold px-2.5 py-1 rounded-full">
                        {product.kcal} kcal
                      </span>
                      <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-xs font-semibold px-2.5 py-1 rounded-full">
                        {product.protein}g Protein
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-[#111] font-semibold shrink-0">
                  ₹{product.price}/-
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSubscribe}
                  className="flex-1 py-3 rounded-xl bg-[#ffedd5] text-[#ea580c] font-semibold text-sm"
                >
                  Subscribe
                </button>
                <button
                  type="button"
                  onClick={handleOrderOnce}
                  className="flex-1 py-3 rounded-xl bg-[#f56215] text-white font-semibold text-sm"
                >
                  Order Once
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
