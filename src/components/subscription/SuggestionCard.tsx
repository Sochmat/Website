"use client";

import VegDot from "./VegDot";
import type { SubscriptionItem } from "./types";

/**
 * Tomorrow's suggestion, revealed at 20:00 IST the evening before.
 *
 * Nothing here books anything on its own — Accept is a tap, and a customer who
 * ignores this card simply doesn't get a meal that day. No credit is spent.
 */
export default function SuggestionCard({
  date,
  weekday,
  item,
  busy,
  onAccept,
  onChooseDifferent,
}: {
  date: string;
  weekday: string;
  item: SubscriptionItem;
  busy: boolean;
  onAccept: () => void;
  onChooseDifferent: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#ffd9c2]">
      <p className="text-[11px] font-semibold text-[#f56215] uppercase tracking-wide">
        Suggested for {weekday.slice(0, 3)} {date.slice(8, 10)}
      </p>

      <div className="flex items-center gap-2 mt-2">
        <VegDot isVeg={item.isVeg} />
        <span className="font-semibold text-[#111]">{item.name.trim()}</span>
      </div>
      <p className="text-xs text-[#009940] font-semibold mt-1">
        {item.protein}g protein{item.kcal > 0 ? ` · ${item.kcal} kcal` : ""}
      </p>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex-1 bg-[#f56215] text-white font-semibold py-2 rounded-xl text-sm disabled:opacity-60"
        >
          {busy ? "Booking…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={onChooseDifferent}
          disabled={busy}
          className="flex-1 border border-gray-200 text-[#111] font-semibold py-2 rounded-xl text-sm disabled:opacity-60"
        >
          Choose different
        </button>
      </div>
    </div>
  );
}
