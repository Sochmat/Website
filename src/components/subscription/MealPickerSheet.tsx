"use client";

import VegDot from "./VegDot";
import SheetCloseButton from "./SheetCloseButton";
import type { SubscriptionItem } from "./types";

/**
 * A bottom sheet grid of meals for picking/swapping one meal. Shared by the
 * batch planner and the scheduler's per-meal edit.
 */
export default function MealPickerSheet({
  items,
  activeId,
  onPick,
  onClose,
  title,
}: {
  items: SubscriptionItem[];
  activeId?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <SheetCloseButton onClose={onClose} />
      <div className="relative w-full max-w-[430px] rounded-t-[16px] bg-white max-h-[80vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#d9d9d9]" />
        </div>
        <div className="px-4 pb-2">
          <h3 className="font-bold text-[#111]">{title}</h3>
        </div>
        <div className="overflow-y-auto px-4 pb-6 pt-1">
          <div className="grid grid-cols-2 gap-2">
            {items.map((it) => {
              const active = it.id === activeId;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onPick(it.id)}
                  className={`text-left bg-white rounded-xl overflow-hidden border-2 ${
                    active ? "border-[#f56215]" : "border-gray-100"
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full bg-[#f2f2f2]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.image || "/food.png"}
                      alt={it.name.trim()}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded bg-white/90 p-0.5 shadow-sm">
                      <VegDot isVeg={it.isVeg} />
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="font-medium text-xs text-[#111] leading-snug line-clamp-2">
                      {it.name.trim()}
                    </p>
                    <span className="mt-1 inline-block bg-[rgba(0,153,64,0.1)] text-[#009940] text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                      {it.protein}g protein
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
