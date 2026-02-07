"use client";

import { CartItem as CartItemType, useCart } from "@/context/CartContext";

interface CartItemProps {
  item: CartItemType;
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity } = useCart();

  return (
    <div className="flex gap-2 items-start py-0.5 w-full">
      <div className="flex items-center py-1">
        <div
          className={`w-3 h-3 border-2 ${
            item.isVeg ? "border-green-600" : "border-red-600"
          } flex items-center justify-center`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              item.isVeg ? "bg-green-600" : "bg-red-600"
            }`}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-[15px] text-black">{item.name}</p>
          <div className="flex gap-0.5">
            <span className="bg-[rgba(2,88,63,0.1)] text-[#02583f] text-xs font-medium px-2 py-0.5 rounded-full tracking-tight">
              {item.kcal} kcal
            </span>
            <span className="bg-[rgba(2,88,63,0.1)] text-[#02583f] text-xs font-medium px-2 py-0.5 rounded-full tracking-tight">
              {item.protein}g Protein
            </span>
          </div>
        </div>
        <button className="flex items-center gap-0.5 text-[#111] text-xs">
          Edit
          <svg
            className="w-4 h-4 text-[#666]"
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

      <div className="flex flex-col gap-2 items-end">
        <div className="bg-[rgba(245,98,21,0.1)] border border-[#f56215] flex items-center justify-between px-3 py-1.5 rounded-md text-[#f56215] text-sm w-[84px]">
          <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>
            -
          </button>
          <span>{item.quantity}</span>
          <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>
            +
          </button>
        </div>
        <span className="text-[#111] font-medium text-sm">
          ₹{item.price * item.quantity}/-
        </span>
      </div>
    </div>
  );
}
