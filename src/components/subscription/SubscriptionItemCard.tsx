"use client";

import { Info } from "lucide-react";
import VegDot from "./VegDot";
import type { SubscriptionItem } from "./types";

/**
 * A meal in the bracket. No price badge: every meal in a plan costs the same,
 * and showing a per-item rupee figure would imply otherwise.
 *
 * - `onTap` — the card's primary action (open details in the wizard, select for
 *   scheduling in the plan view).
 * - `onInfo` — when set, a small info button opens the item's description sheet
 *   without triggering `onTap`. It's rendered as a sibling overlay button (not
 *   nested inside `onTap`'s button) to keep the markup valid.
 */
export default function SubscriptionItemCard({
  item,
  selected = false,
  onTap,
  onInfo,
}: {
  item: SubscriptionItem;
  selected?: boolean;
  onTap?: () => void;
  onInfo?: () => void;
}) {
  const base = `w-full text-left bg-white rounded-xl p-3 shadow-sm border-2 ${
    selected ? "border-[#f56215]" : "border-transparent"
  }`;

  const content = (
    <>
      <div className={`flex items-center gap-2 ${onInfo ? "pr-6" : ""}`}>
        <VegDot isVeg={item.isVeg} />
        <span className="font-medium text-sm text-[#111] truncate">{item.name.trim()}</span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[11px] font-semibold px-2 py-0.5 rounded-full">
          {item.protein}g protein
        </span>
        {item.kcal > 0 && (
          <span className="text-[11px] text-[#737373]">{item.kcal} kcal</span>
        )}
      </div>
    </>
  );

  const infoButton = onInfo && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onInfo();
      }}
      aria-label={`View ${item.name.trim()} details`}
      className="absolute top-2 right-2 z-10 text-[#b0b0b0] hover:text-[#f56215] p-0.5"
    >
      <Info className="w-4 h-4" />
    </button>
  );

  // With an info button, the whole card stays a select target via an overlay
  // button beneath the content, and the info button sits on top.
  if (onInfo) {
    return (
      <div className={`relative ${base}`}>
        {onTap && (
          <button
            type="button"
            onClick={onTap}
            aria-label={`Select ${item.name.trim()}`}
            className="absolute inset-0 rounded-xl"
          />
        )}
        <div className={`relative ${onTap ? "pointer-events-none" : ""}`}>{content}</div>
        {infoButton}
      </div>
    );
  }

  const Tag = onTap ? "button" : "div";
  return (
    <Tag {...(onTap ? { onClick: onTap, type: "button" as const } : {})} className={base}>
      {content}
    </Tag>
  );
}
