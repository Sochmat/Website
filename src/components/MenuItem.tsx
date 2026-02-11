"use client";

import Image from "next/image";
import { Product, useCart } from "@/context/CartContext";

interface MenuItemProps {
  product: Product;
}

export default function MenuItem({ product }: MenuItemProps) {
  const { items, addToCart, updateQuantity } = useCart();
  const cartItem = items.find((item) => item.id === product.id);
  const quantity = cartItem?.quantity || 0;

  return (
    <div className="flex gap-3 w-full">
      <div className="relative w-[180px] h-[180px] shrink-0">
        <div className="w-full h-full rounded-xl overflow-hidden bg-white">
          <Image
            src={product.image ? product.image : "food.png"}
            alt={product.name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        {product.badge && (
          <div className="absolute bottom-0 left-0 right-0 h-[60px] bg-gradient-to-t from-black to-transparent rounded-b-xl flex items-end justify-center pb-2">
            <span className="text-white text-[13px] font-semibold">
              {product.badge}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between py-1">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div
              className={`w-3.5 h-3.5 border-2 ${
                product.isVeg ? "border-green-600" : "border-red-600"
              } flex items-center justify-center`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  product.isVeg ? "bg-green-600" : "bg-red-600"
                }`}
              />
            </div>
            <div className="flex items-center gap-0.5">
              <svg
                className="w-3 h-3 text-[#f5c518]"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-[#141414] text-xs font-medium">
                {product.rating}
              </span>
              <span className="text-[#666] text-[11px]">
                ({product.reviews})
              </span>
            </div>
          </div>
          <h3 className="text-black font-bold text-base">{product.name}</h3>
          <div className="flex gap-0.5">
            <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-xs font-semibold px-3 py-1 rounded-full tracking-tight">
              {product.kcal} kcal
            </span>
            <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-xs font-semibold px-3 py-1 rounded-full tracking-tight">
              {product.protein}g Protein
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-end gap-1">
              <span className="text-[#111] font-semibold">
                ₹{product.price}/-
              </span>
              <span className="text-[#666] text-xs line-through">
                ₹{product.originalPrice}/-
              </span>
            </div>
            <span className="border border-[#00a86e] text-[#00a86e] text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit">
              {product.discount}% Off
            </span>
          </div>

          {quantity > 0 ? (
            <div className="bg-[#f56215] text-white text-sm font-medium px-3 py-1.5 rounded-md flex items-center justify-between w-[84px]">
              <button onClick={() => updateQuantity(product.id, quantity - 1)}>
                -
              </button>
              <span>{quantity}</span>
              <button onClick={() => updateQuantity(product.id, quantity + 1)}>
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => addToCart(product)}
              className="bg-[rgba(245,98,21,0.06)] border border-[#f56215] text-[#f56215] text-sm font-medium px-3 py-1.5 rounded-md w-[84px]"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
