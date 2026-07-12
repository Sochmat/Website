"use client";

import { useEffect, useState } from "react";
import SubscriptionItemCard from "./SubscriptionItemCard";
import SheetCloseButton from "./SheetCloseButton";
import type { SubscriptionItem } from "./types";

/**
 * A read-only preview of every meal a bracket offers. A segmented toggle at the
 * top switches between Veg and Non-veg so both are one tap away — no scrolling
 * past one to reach the other. Opened from a bracket card's "View meal options".
 */
export default function MealOptionsSheet({
  open,
  onClose,
  title,
  subtitle,
  items,
  loading,
  vegPrice,
  nonVegPrice,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  items: SubscriptionItem[];
  loading: boolean;
  vegPrice: number;
  nonVegPrice: number;
}) {
  const [tab, setTab] = useState<"veg" | "nonveg">("veg");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const veg = items.filter((it) => it.isVeg);
  const nonVeg = items.filter((it) => !it.isVeg);
  const shown = tab === "veg" ? veg : nonVeg;

  return (
    <div className="fixed inset-0 z-100 flex flex-col items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <SheetCloseButton onClose={onClose} />

      <div className="relative w-full max-w-[430px] rounded-t-[16px] bg-white max-h-[85vh] flex flex-col animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#d9d9d9]" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-bold text-[#111]">{title}</h3>
            <span className="inline-flex items-baseline gap-0.5 rounded-full bg-[#fff1e8] px-2 py-0.5 text-xs font-bold text-[#c2410c]">
              {subtitle}
            </span>
          </div>
          {!loading && (
            <p className="text-xs text-gray-500 mt-1">
              {items.length} meals · choose any after checkout
            </p>
          )}
        </div>

        {/* Veg / Non-veg toggle */}
        <div className="px-5 pb-3 border-b border-gray-100">
          <div className="inline-flex w-full rounded-xl bg-gray-100 p-1">
            <Tab
              active={tab === "veg"}
              onClick={() => setTab("veg")}
              markColor="#1a7f37"
              label="Veg"
              count={veg.length}
            />
            <Tab
              active={tab === "nonveg"}
              onClick={() => setTab("nonveg")}
              markColor="#c0392b"
              label="Non-veg"
              count={nonVeg.length}
            />
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-gray-200/70 animate-pulse" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No {tab === "veg" ? "vegetarian" : "non-veg"} meals in this plan.
            </p>
          ) : (
            <div className="space-y-2">
              {shown.map((it) => (
                <SubscriptionItemCard
                  key={it.id}
                  item={it}
                  subscriptionPrice={it.isVeg ? vegPrice : nonVegPrice}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  markColor,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  markColor: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
        active ? "bg-white text-[#111] shadow-sm" : "text-gray-500"
      }`}
    >
      <span
        className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border-2"
        style={{ borderColor: markColor }}
        aria-hidden
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: markColor }} />
      </span>
      {label}
      <span className={active ? "text-gray-400" : "text-gray-400"}>{count}</span>
    </button>
  );
}
