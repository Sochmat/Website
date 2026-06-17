"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product, CartSelection } from "@/context/CartContext";
import type { MenuVariant, SelectedAddOn } from "@/lib/types";

interface AddToCartSheetProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  /** Resolved add-on items offered for this product. */
  addOnProducts: Product[];
  onConfirm: (selection: CartSelection) => void;
}

export default function AddToCartSheet({
  open,
  onClose,
  product,
  addOnProducts,
  onConfirm,
}: AddToCartSheetProps) {
  const variants = useMemo(() => product?.variants ?? [], [product]);
  const hasVariants = variants.length > 0;

  // Variant is required when present; default to the first one. The sheet is
  // mounted only while open (see MenuItem), so fresh state resets each time.
  const [variantIndex, setVariantIndex] = useState(0);
  // Add-on id -> chosen quantity (0 = not selected).
  const [addOnQty, setAddOnQty] = useState<Record<string, number>>({});

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

  if (!open || !product) return null;

  const selectedVariant: MenuVariant | undefined = hasVariants
    ? variants[variantIndex]
    : undefined;
  const basePrice = selectedVariant ? selectedVariant.price : product.price;
  const addOnsSum = addOnProducts.reduce(
    (sum, a) => sum + a.price * (addOnQty[a.id] ?? 0),
    0,
  );
  const total = basePrice + addOnsSum;

  const setQty = (id: string, qty: number) =>
    setAddOnQty((prev) => ({ ...prev, [id]: Math.max(0, qty) }));

  const handleConfirm = () => {
    const addOns: SelectedAddOn[] = addOnProducts
      .filter((a) => (addOnQty[a.id] ?? 0) > 0)
      .map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        quantity: addOnQty[a.id],
      }));
    onConfirm({ variant: selectedVariant, addOns });
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
        className="fixed left-0 right-0 bottom-0 z-[211] max-w-[430px] mx-auto bg-white rounded-t-[24px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Customize and add to cart"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 shrink-0" />

        <div className="px-4 pt-3 pb-2 flex items-start gap-2 shrink-0">
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
          <h3 className="text-[#111] font-semibold text-base leading-snug">
            {product.name}
          </h3>
        </div>

        <div className="px-4 overflow-y-auto scrollbar-hide flex-1 pb-2">
          {/* Variant selector */}
          {hasVariants && (
            <div className="mt-2">
              <p className="text-sm font-semibold text-[#111] mb-2">
                Choose an option
              </p>
              <div className="flex flex-col gap-2">
                {variants.map((v, i) => {
                  const selected = i === variantIndex;
                  return (
                    <button
                      key={`${v.name}-${i}`}
                      type="button"
                      onClick={() => setVariantIndex(i)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                        selected
                          ? "border-[#f56215] bg-[rgba(245,98,21,0.06)]"
                          : "border-gray-200"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            selected ? "border-[#f56215]" : "border-gray-300"
                          }`}
                        >
                          {selected && (
                            <span className="w-2 h-2 rounded-full bg-[#f56215]" />
                          )}
                        </span>
                        <span className="font-medium text-[#111]">
                          {v.name}
                        </span>
                      </span>
                      <span className="font-semibold text-[#111]">
                        ₹{v.price}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-ons */}
          {addOnProducts.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-[#111] mb-2">Add-ons</p>
              <div className="flex flex-col gap-2">
                {addOnProducts.map((a) => {
                  const qty = addOnQty[a.id] ?? 0;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-gray-200"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-3.5 h-3.5 border-2 shrink-0 ${
                            a.isVeg ? "border-green-600" : "border-red-600"
                          } flex items-center justify-center`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              a.isVeg ? "bg-green-600" : "bg-red-600"
                            }`}
                          />
                        </div>
                        <span className="text-sm text-[#111] truncate">
                          {a.name}
                        </span>
                        <span className="text-sm text-[#666] shrink-0">
                          ₹{a.price}
                        </span>
                      </div>

                      {qty > 0 ? (
                        <div className="bg-[rgba(245,98,21,0.1)] border border-[#f56215] flex items-center justify-between px-2.5 py-1 rounded-md text-[#f56215] text-sm w-[80px] shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(a.id, qty - 1)}
                          >
                            -
                          </button>
                          <span>{qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(a.id, qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setQty(a.id, 1)}
                          className="border border-[#f56215] text-[#f56215] text-sm font-semibold rounded-md px-4 py-1 shrink-0"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div className="px-4 pt-2 pb-6 shrink-0 border-t border-gray-100">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <span>Add item to cart</span>
            <span>·</span>
            <span>₹{total}</span>
          </button>
        </div>
      </div>
    </>
  );
}
