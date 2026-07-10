"use client";

import { useDraggable } from "@dnd-kit/core";
import VegDot from "./VegDot";
import type { SubscriptionItem } from "./types";

/**
 * A meal in the bracket. No price badge: every meal in a plan costs the same,
 * and showing a per-item rupee figure would imply otherwise.
 *
 * `draggable` is off during the purchase wizard (the grid is a preview there) and
 * on in the scheduler, where items get dragged onto day cards.
 */
export default function SubscriptionItemCard({
  item,
  draggable = false,
  selected = false,
  onTap,
}: {
  item: SubscriptionItem;
  draggable?: boolean;
  selected?: boolean;
  onTap?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
    disabled: !draggable,
  });

  const Tag = onTap ? "button" : "div";

  return (
    <Tag
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      {...(onTap ? { onClick: onTap, type: "button" as const } : {})}
      className={`text-left w-full bg-white rounded-xl p-3 shadow-sm border-2 ${
        selected ? "border-[#f56215]" : "border-transparent"
      } ${isDragging ? "opacity-40" : ""}`}
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
