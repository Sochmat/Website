"use client";

import { ChevronRight, Drumstick, Leaf, UtensilsCrossed } from "lucide-react";
import type { SubscriptionDiet } from "@/lib/types";
import { rupees } from "./types";

/**
 * A diet choice on the plan-type screen. Each option owns a colour — green for
 * veg, the brand orange for veg+non-veg — with a soft sheen, a large watermark
 * glyph bleeding off the right edge, and a footer strip carrying the count of
 * meal options plus the plan size.
 */

const THEME = {
  veg: {
    band: "bg-gradient-to-br from-[#1a7f37] to-[#25a244]",
    sheen: "radial-gradient(120% 90% at 15% -10%, rgba(255,255,255,0.30), transparent 55%)",
  },
  "veg-nonveg": {
    band: "bg-gradient-to-br from-[#F56215] to-[#FF8A3D]",
    sheen: "radial-gradient(120% 90% at 15% -10%, rgba(255,255,255,0.28), transparent 55%)",
  },
} as const;

export default function DietCard({
  diet,
  pricePerMeal,
  totalPrice,
  optionCount,
  mealsPerPlan,
  onSelect,
}: {
  diet: SubscriptionDiet;
  pricePerMeal: number;
  totalPrice: number;
  optionCount: number | null;
  mealsPerPlan: number;
  onSelect: () => void;
}) {
  const isVegOnly = diet === "veg";
  const theme = isVegOnly ? THEME.veg : THEME["veg-nonveg"];
  const WatermarkIcon = isVegOnly ? Leaf : Drumstick;

  // Positioning line — the option count is shown in the pills below, so this
  // sells the choice rather than repeating a number.
  const tagline = isVegOnly
    ? "100% pure vegetarian menu"
    : "Full menu unlocked — veg & non-veg";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative w-full overflow-hidden text-left rounded-2xl shadow-sm ring-1 ring-black/5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${theme.band}`}
    >
      {/* Soft top-left sheen for depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: theme.sheen }}
      />
      {/* Watermark glyph bleeding off the right edge */}
      <WatermarkIcon
        aria-hidden
        className="pointer-events-none absolute -right-5 top-1/2 h-40 w-40 -translate-y-1/2 rotate-12 text-white/10 transition-transform duration-500 ease-out group-hover:rotate-6 group-hover:scale-105"
        strokeWidth={1.25}
      />
      {/* Glossy blob drifting on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -right-10 h-44 w-44 rounded-full bg-white/10 blur-2xl transition-transform duration-500 ease-out group-hover:translate-x-3 group-hover:-translate-y-2"
      />

      <div className="relative z-10 p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white leading-tight">
              {isVegOnly ? "Veg only" : "Veg + Non-veg"}
            </p>
            <p className="text-xs text-white/80 mt-0.5">{tagline}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-baseline gap-1">
              <span className="text-lg font-bold text-white">{rupees(pricePerMeal)}</span>
              <span className="text-[11px] text-white/75">/ meal</span>
            </span>
            <ChevronRight className="h-5 w-5 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white" />
          </div>
        </div>

        {/* Info strip: options + plan size on the left, all-in price on the right */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-white/85">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
              <UtensilsCrossed className="h-3 w-3" strokeWidth={2} />
              {optionCount == null ? "…" : `${optionCount} options`}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
              {mealsPerPlan} meals / plan
            </span>
          </div>
          <span className="text-right leading-tight">
            <span className="text-base font-bold text-white">{rupees(totalPrice)}</span>
            <span className="block text-[10px] text-white/70">total · incl. GST</span>
          </span>
        </div>
      </div>
    </button>
  );
}
