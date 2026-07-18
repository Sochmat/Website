"use client";

import { ArrowRight, UtensilsCrossed } from "lucide-react";
import {
  discountPercent,
  effectivePricePerMeal,
} from "@/lib/subscriptionBrackets";
import { rupees, TIER_LABELS, type BracketOption } from "./types";

/**
 * A protein tier as a full-height band. The three tiers form an ascending
 * sequence (more protein → hotter band), so they read as a level-select. The
 * graphic behind each button is the tier's own max-grams numeral, bleeding off
 * the right edge — derived from the data, not decoration.
 */

interface Tier {
  band: string; // gradient
  ink: string;
  sub: string;
  ghost: string; // the oversized numeral colour
  pill: string;
  ring: string;
  arrow: string;
  optBtn: string; // outlined "view options" button colours
}

// Index 0..2 = ascending protein. Kept in the component so a bracket's theme is
// its position in the ladder, not a value stored in the DB. Names come from the
// shared TIER_LABELS so the diet screen and this card never drift.
const TIERS: Tier[] = [
  {
    band: "bg-gradient-to-br from-[#FFF4EA] to-[#FFE0C7]",
    ink: "text-[#1c1c1c]",
    sub: "text-[#9a7458]",
    ghost: "text-[#F56215]/10",
    pill: "bg-white/70 text-[#c2410c]",
    ring: "focus-visible:outline-[#F56215]",
    arrow: "text-[#F56215]",
    optBtn: "border-[#F56215]/50 text-[#c2410c] hover:bg-[#F56215]/10",
  },
  {
    band: "bg-gradient-to-br from-[#F56215] to-[#FF8A3D]",
    ink: "text-white",
    sub: "text-white/85",
    ghost: "text-white/20",
    pill: "bg-white/20 text-white",
    ring: "focus-visible:outline-white",
    arrow: "text-white",
    optBtn: "border-white/70 text-white hover:bg-white/15",
  },
  {
    band: "bg-gradient-to-br from-[#1c1c1c] to-[#332c26]",
    ink: "text-white",
    sub: "text-white/55",
    ghost: "text-[#F56215]/20",
    pill: "bg-[#F56215]/20 text-[#FF8A3D]",
    ring: "focus-visible:outline-[#F56215]",
    arrow: "text-[#FF8A3D]",
    optBtn: "border-[#FF8A3D]/60 text-[#FF8A3D] hover:bg-[#FF8A3D]/10",
  },
];

export default function BracketCard({
  bracket,
  index,
  onSelect,
  onViewOptions,
}: {
  bracket: BracketOption;
  index: number;
  onSelect: () => void;
  onViewOptions: () => void;
}) {
  const t = TIERS[index] ?? TIERS[0];
  const isMostSelected = index === 1;
  const tierName = TIER_LABELS[index] ?? TIER_LABELS[0];

  // The cheapest per-meal price across both diets drives the "Starting @" pill;
  // the discount shown is the one that produced it.
  const effVeg = effectivePricePerMeal(bracket, "veg");
  const effNonVeg = effectivePricePerMeal(bracket, "veg-nonveg");
  const startIsVeg = effVeg <= effNonVeg;
  const startEff = startIsVeg ? effVeg : effNonVeg;
  const startList = startIsVeg ? bracket.vegPrice : bracket.nonVegPrice;
  const startDiscount = Math.round(
    discountPercent(bracket, startIsVeg ? "veg" : "veg-nonveg")
  );

  return (
    <div className={`group relative flex-1 w-full overflow-hidden ${t.band}`}>
      {/* Full-card select target, beneath the content so taps fall through
          except on the explicit "View options" button. */}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Choose ${tierName} plan`}
        className={`absolute inset-0 z-[1] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 ${t.ring}`}
      />

      {/* Soft top-left sheen for depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 12% -10%, rgba(255,255,255,0.28), transparent 55%)",
        }}
      />

      {/* Signature: the tier's max-grams numeral, bleeding off the right edge */}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1/2 right-[-0.12em] -translate-y-1/2 font-black tabular-nums leading-none tracking-tighter transition-transform duration-500 ease-out ${t.ghost} group-hover:-translate-y-[52%] motion-reduce:transition-none`}
        style={{ fontSize: "clamp(150px, 46vw, 260px)" }}
      >
        {bracket.proteinMax}
      </span>

      {/* "Most Selected" tag — Performance tier only */}
      {isMostSelected && (
        <span className="pointer-events-none absolute left-4 top-4 z-20 inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#c2410c] shadow-sm">
          Most Selected
        </span>
      )}

      {/* Select cue — top-right arrow */}
      <ArrowRight
        aria-hidden
        className={`pointer-events-none absolute right-5 top-5 z-10 h-6 w-6 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none ${t.arrow}`}
      />

      {/* Foreground — taps pass through to the select overlay (pointer-events-none)
          except the explicit "View options" button below. */}
      <span
        className={`pointer-events-none relative z-10 flex h-full flex-col justify-center gap-1 px-6 py-5 ${
          isMostSelected ? "pt-16" : ""
        }`}
      >
        <span
          className={`text-[11px] font-bold uppercase tracking-[0.22em] ${t.sub}`}
        >
          {tierName}
        </span>

        <span className="flex items-end gap-1">
          <span
            className={`font-black leading-[0.9] tracking-tight tabular-nums ${t.ink}`}
            style={{ fontSize: "clamp(44px, 13vw, 66px)" }}
          >
            {bracket.proteinMin}–{bracket.proteinMax}
          </span>
          <span className={`mb-1.5 text-xl font-bold ${t.ink}`}>g</span>
          <span className={`mb-2 text-sm ${t.sub}`}>protein / meal</span>
        </span>
        <span className={`flex flex-wrap items-center gap-2 text-sm ${t.sub}`}>
          {startDiscount > 0 && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm ${t.pill}`}
            >
              {startDiscount}% OFF
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm ${t.pill}`}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M19.44 9.03 15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.79-2.2-4.97-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.63 0-3-1.37-3-3s1.37-3 3-3 3 1.37 3 3-1.37 3-3 3z" />
            </svg>
            Free delivery
          </span>
        </span>

        <span className="mt-3 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-baseline gap-1 rounded-full px-3 py-1 text-sm font-semibold backdrop-blur-sm ${t.pill}`}
          >
            <span className="text-[11px] font-medium opacity-80">
              Starting @
            </span>
            {startEff < startList && (
              <span className="text-[11px] font-medium line-through opacity-60">
                {rupees(startList)}
              </span>
            )}
            {rupees(startEff)}
            <span className="text-[11px] font-medium opacity-80">/ meal</span>
          </span>

          {/* View meal options — outlined button; intercepts taps so it
              doesn't select the plan */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewOptions();
            }}
            className={`pointer-events-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${t.optBtn}`}
          >
            <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={2} />
            View Meal options
          </button>
        </span>
      </span>
    </div>
  );
}
