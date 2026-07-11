"use client";

import VegDot from "./VegDot";
import type { SubscriptionItem } from "./types";

/**
 * A meal in the bracket. No price badge: every meal in a plan costs the same,
 * and showing a per-item rupee figure would imply otherwise.
 *
 * A read-only preview tile in the purchase wizard; in the scheduler it takes an
 * `onTap` so the customer can pick it for the armed day.
 */
export default function SubscriptionItemCard({
  item,
  selected = false,
  onTap,
}: {
  item: SubscriptionItem;
  selected?: boolean;
  onTap?: () => void;
}) {
  const Tag = onTap ? "button" : "div";

  return (
    <Tag
      {...(onTap ? { onClick: onTap, type: "button" as const } : {})}
      className={`text-left w-full bg-white rounded-xl p-3 shadow-sm border-2 ${
        selected ? "border-[#f56215]" : "border-transparent"
      }`}
    >
      <div className="flex items-center gap-2">
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
    </Tag>
  );
}
