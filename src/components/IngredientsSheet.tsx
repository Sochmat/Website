"use client";

import { useEffect } from "react";
import { Product } from "@/context/CartContext";

interface IngredientsSheetProps {
  open: boolean;
  onClose: () => void;
  product: Product;
}

export default function IngredientsSheet({
  open,
  onClose,
  product,
}: IngredientsSheetProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-[12px] w-full max-w-[430px] max-h-[85vh] overflow-y-auto animate-slide-up shadow-[0px_-2px_10px_rgba(0,0,0,0.1)]">
        {/* Handle bar */}
        <div className="sticky top-0 bg-white pt-[10px] pb-[6px] flex justify-center rounded-t-[12px] z-10">
          <div className="w-[40px] h-[4px] bg-[#d9d9d9] rounded-full" />
        </div>

        {/* Image */}
        <div className="w-full h-[246px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image || "/food.png"}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {/* Badges */}
          {product.badge && (
            <div className="absolute left-[16px] top-[220px] flex gap-[6px]">
              {product.badge.split(",").map((b, i) => (
                <span
                  key={i}
                  className={`bg-white text-[13px] font-medium px-[13px] py-[4px] rounded-[20px] tracking-[-0.66px] ${
                    i === 0 ? "text-black" : "text-[#f56215]"
                  }`}
                >
                  {b.trim()}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-[16px] pt-[16px] pb-[32px] flex flex-col gap-[12px]">
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

          {/* Description */}
          {product.description && (
            <p className="text-[#999] text-[12px] leading-[1.5]">
              {product.description}
            </p>
          )}

          {/* Divider */}
          <div className="w-full h-[1px] bg-[#e6e6e6]" />

          {/* Nutrient Info */}
          <div className="flex flex-col gap-[8px]">
            <h4 className="text-black text-[14px] font-semibold leading-[16px]">
              Nutrient Info
            </h4>
            <div className="flex gap-[12px]">
              <div className="flex-1 bg-[rgba(0,153,64,0.1)] rounded-[8px] px-[12px] py-[8px] flex flex-col items-center justify-center">
                <span className="text-[#009940] text-[16px] font-medium tracking-[-0.8px] leading-[16px]">
                  {product.kcal}
                </span>
                <span className="text-[#009940] text-[12px] tracking-[-0.6px] leading-[16px]">
                  kcal
                </span>
              </div>
              <div className="flex-1 bg-[rgba(0,153,64,0.1)] rounded-[8px] px-[12px] py-[8px] flex flex-col items-center justify-center">
                <span className="text-[#009940] text-[16px] font-medium tracking-[-0.8px] leading-[16px]">
                  {product.protein}g
                </span>
                <span className="text-[#009940] text-[12px] tracking-[-0.6px] leading-[16px]">
                  Protein
                </span>
              </div>
              <div className="flex-1 bg-[rgba(0,153,64,0.1)] rounded-[8px] px-[12px] py-[8px] flex flex-col items-center justify-center">
                <span className="text-[#009940] text-[16px] font-medium tracking-[-0.8px] leading-[16px]">
                  {product.fiber ?? 0}g
                </span>
                <span className="text-[#009940] text-[12px] tracking-[-0.6px] leading-[16px]">
                  Fiber
                </span>
              </div>
              <div className="flex-1 bg-[rgba(0,153,64,0.1)] rounded-[8px] px-[12px] py-[8px] flex flex-col items-center justify-center">
                <span className="text-[#009940] text-[16px] font-medium tracking-[-0.8px] leading-[16px]">
                  {product.carbs ?? 0}g
                </span>
                <span className="text-[#009940] text-[12px] tracking-[-0.6px] leading-[16px]">
                  Carbs
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-[1px] bg-[#e6e6e6]" />

          {/* Ingredients */}
          {product.ingredients && product.ingredients.length > 0 && (
            <div className="flex flex-col gap-[8px]">
              <h4 className="text-black text-[14px] font-semibold leading-[16px]">
                Ingredients used
              </h4>
              <ul className="list-disc pl-[21px] text-black text-[14px] leading-[16px] flex flex-col gap-[4px]">
                {product.ingredients.map((ingredient, i) => (
                  <li key={i}>{ingredient}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
