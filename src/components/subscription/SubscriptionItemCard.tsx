"use client";

import VegDot from "./VegDot";
import { rupees, type SubscriptionItem } from "./types";

/**
 * A meal in the bracket, rendered as a full-width row (image left, details
 * right) for one-column lists. When `subscriptionPrice` is given it shows the
 * plan's per-meal price against the meal's à la carte (Zomato) price.
 *
 * - `onTap` — the card's primary action (open details / select).
 */
export default function SubscriptionItemCard({
  item,
  selected = false,
  onTap,
  subscriptionPrice,
}: {
  item: SubscriptionItem;
  selected?: boolean;
  onTap?: () => void;
  subscriptionPrice?: number;
}) {
  const zomato = Math.round(item.referencePrice ?? 0);
  const showPrice = subscriptionPrice != null && subscriptionPrice > 0;
  const savings = showPrice && zomato > subscriptionPrice;

  const base = `flex w-full gap-3 text-left bg-white rounded-xl p-2.5 shadow-sm border-2 ${
    selected ? "border-[#f56215]" : "border-transparent"
  }`;

  const content = (
    <>
      {/* Meal image with a veg/non-veg dot pinned in the corner */}
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-[#f2f2f2]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image || "/food.png"}
          alt={item.name.trim()}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span className="absolute left-1 top-1 rounded bg-white/90 p-0.5 shadow-sm">
          <VegDot isVeg={item.isVeg} />
        </span>
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold text-sm text-[#111] leading-snug line-clamp-2">
          {item.name.trim()}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[11px] font-semibold px-2 py-0.5 rounded-full">
            {item.protein}g protein
          </span>
          {item.kcal > 0 && (
            <span className="text-[11px] text-[#737373]">{item.kcal} kcal</span>
          )}
        </div>

        {showPrice && (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-bold text-[#111]">
              {rupees(subscriptionPrice)}
            </span>
            <span className="text-[10px] font-medium text-gray-400">/ meal</span>
            {savings && (
              <span className="text-xs text-gray-400">
                <span className="line-through">{rupees(zomato)}</span> on Zomato
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );

  const Tag = onTap ? "button" : "div";
  return (
    <Tag
      {...(onTap ? { onClick: onTap, type: "button" as const } : {})}
      className={base}
    >
      {content}
    </Tag>
  );
}
