"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product, CartSelection } from "@/context/CartContext";
import type { MenuVariant, SelectedAddOn } from "@/lib/types";
import {
  defaultAddOnQuantities,
  unmetRequiredGroups,
  type AddOnGroup,
} from "@/lib/addOnGroups";
import FoodTypeDot from "./FoodTypeDot";

interface AddToCartSheetProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  /** Resolved add-on groups offered for this product: the item's own picks
   *  first, then a group per mapped add-on category. See lib/addOnGroups.ts. */
  addOnGroups: AddOnGroup<Product>[];
  onConfirm: (selection: CartSelection) => void;
}

export default function AddToCartSheet({
  open,
  onClose,
  product,
  addOnGroups,
  onConfirm,
}: AddToCartSheetProps) {
  const variants = useMemo(() => product?.variants ?? [], [product]);
  const hasVariants = variants.length > 0;

  // Variant is required when present; default to the first one. The sheet is
  // mounted only while open (see MenuItem), so fresh state resets each time.
  const [variantIndex, setVariantIndex] = useState(0);
  // Option key -> chosen quantity (0 = not selected). Keyed by option, not by
  // add-on: the same add-on can appear in two groups at two prices, and those
  // are separate offers that must count separately. Starts on the admin's
  // default-selected add-ons, which the customer is free to remove.
  const [addOnQty, setAddOnQty] = useState<Record<string, number>>(() =>
    defaultAddOnQuantities(addOnGroups),
  );

  // Every option across every group, for pricing and for building the result.
  const addOnOptions = useMemo(
    () => addOnGroups.flatMap((group) => group.options),
    [addOnGroups],
  );

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
  const addOnsSum = addOnOptions.reduce(
    (sum, option) => sum + option.price * (addOnQty[option.key] ?? 0),
    0,
  );
  const total = basePrice + addOnsSum;

  // A compulsory group blocks the confirm button until one of its add-ons is
  // taken, so the customer is never told off after the fact.
  const unmetGroups = unmetRequiredGroups(addOnGroups, addOnQty);
  const unmetKeys = new Set(unmetGroups.map((group) => group.key));
  const blocked = unmetGroups.length > 0;

  const setQty = (key: string, qty: number) =>
    setAddOnQty((prev) => ({ ...prev, [key]: Math.max(0, qty) }));

  /** Radio and checkbox groups are both a toggle; they differ only in what
   *  happens to the siblings. Re-tapping a chosen radio clears it, so an
   *  optional group can be left empty after a mistaken tap. */
  const toggleOption = (group: AddOnGroup<Product>, key: string) =>
    setAddOnQty((prev) => {
      const chosen = (prev[key] ?? 0) > 0;
      if (group.selectionType !== "single") {
        return { ...prev, [key]: chosen ? 0 : 1 };
      }
      const next = { ...prev };
      for (const option of group.options) next[option.key] = 0;
      next[key] = chosen ? 0 : 1;
      return next;
    });

  const handleConfirm = () => {
    if (blocked) return;
    // The add-on id is what the kitchen and the order API key off, so that is
    // what travels — the price carries the group's override with it.
    const addOns: SelectedAddOn[] = addOnOptions
      .filter((option) => (addOnQty[option.key] ?? 0) > 0)
      .map((option) => ({
        id: option.product.id,
        name: option.product.name,
        price: option.price,
        quantity: addOnQty[option.key],
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
          <FoodTypeDot item={product} className="mt-0.5" />
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

          {/* Add-ons, one block per group: the item's own picks, then a block
              per mapped add-on category. */}
          {addOnGroups.map((group) => (
            <div key={group.key} className="mt-4">
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-sm font-semibold text-[#111]">
                  {group.title}
                </p>
                {group.required && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      unmetKeys.has(group.key)
                        ? "bg-[rgba(245,98,21,0.12)] text-[#f56215]"
                        : "bg-gray-100 text-[#666]"
                    }`}
                  >
                    Required
                  </span>
                )}
              </div>
              <div
                className="flex flex-col gap-2"
                role={group.selectionType === "single" ? "radiogroup" : undefined}
                aria-label={group.selectionType === "single" ? group.title : undefined}
              >
                {group.options.map(({ key, product: a, price }) => {
                  const qty = addOnQty[key] ?? 0;
                  const label = (
                    <span className="flex items-center gap-2 min-w-0">
                      <FoodTypeDot item={a} size={14} dotSize={6} />
                      <span className="text-sm text-[#111] truncate">
                        {a.name}
                      </span>
                      <span className="text-sm text-[#666] shrink-0">
                        {price > 0 ? `₹${price}` : "Free"}
                      </span>
                    </span>
                  );

                  // Radio and checkbox groups pick the whole row, so the row
                  // itself is the control; only an "add" group keeps the
                  // stepper, where the row has two separate hit targets.
                  if (group.selectionType !== "add") {
                    const chosen = qty > 0;
                    const single = group.selectionType === "single";
                    return (
                      <button
                        key={key}
                        type="button"
                        role={single ? "radio" : "checkbox"}
                        aria-checked={chosen}
                        onClick={() => toggleOption(group, key)}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                          chosen
                            ? "border-[#f56215] bg-[rgba(245,98,21,0.06)]"
                            : "border-gray-200"
                        }`}
                      >
                        {label}
                        <span
                          className={`w-4 h-4 shrink-0 border flex items-center justify-center ${
                            single ? "rounded-full" : "rounded-[5px]"
                          } ${
                            chosen
                              ? "border-[#f56215]"
                              : "border-gray-300"
                          } ${chosen && !single ? "bg-[#f56215]" : ""}`}
                        >
                          {chosen &&
                            (single ? (
                              <span className="w-2 h-2 rounded-full bg-[#f56215]" />
                            ) : (
                              <span className="text-white text-[10px] leading-none">
                                ✓
                              </span>
                            ))}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-gray-200"
                    >
                      {label}

                      {qty > 0 ? (
                        <div className="bg-[rgba(245,98,21,0.1)] border border-[#f56215] flex items-center justify-between px-2.5 py-1 rounded-md text-[#f56215] text-sm w-[80px] shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(key, qty - 1)}
                          >
                            -
                          </button>
                          <span>{qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(key, qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setQty(key, 1)}
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
          ))}
        </div>

        {/* Confirm */}
        <div className="px-4 pt-2 pb-6 shrink-0 border-t border-gray-100">
          {blocked && (
            <p className="text-xs text-[#f56215] mb-2 text-center">
              Pick at least one from {listGroupTitles(unmetGroups)}
            </p>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={blocked}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:text-gray-500"
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

/** "Sauces", "Sauces and Sides", "Sauces, Sides and Dips". */
function listGroupTitles(groups: { title: string }[]): string {
  const titles = groups.map((group) => group.title);
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}
