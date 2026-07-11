"use client";

import type { SubscriptionCredit } from "@/lib/types";

/**
 * One delivery day.
 *
 * `locked` comes from the server (noon IST on the day itself). A locked day
 * shows no clear button and greys out — the kitchen owns it now. When a meal is
 * armed, tapping an unlocked day assigns it.
 */
export default function DayCard({
  date,
  weekday,
  locked,
  credit,
  tapArmed,
  onTapPlace,
  onClear,
}: {
  date: string;
  weekday: string;
  locked: boolean;
  credit: SubscriptionCredit | null;
  tapArmed: boolean;
  onTapPlace: () => void;
  onClear: () => void;
}) {
  const dayNum = date.slice(8, 10);
  const delivered = credit?.status === "delivered";
  const armed = tapArmed && !locked;

  return (
    <div
      onClick={armed ? onTapPlace : undefined}
      title={locked ? "Locked — meals are fixed at 12:00 PM" : undefined}
      className={`rounded-xl p-2.5 min-h-[92px] border-2 transition-colors ${
        locked
          ? "border-gray-200 bg-gray-100"
          : armed && !credit
            ? "border-[#f56215] bg-[#fff5ef] cursor-pointer"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] font-semibold ${locked ? "text-gray-400" : "text-[#666]"}`}
        >
          {weekday.slice(0, 3)} {dayNum}
        </span>
        {locked ? (
          <span className="text-[10px]" aria-label="Locked">
            🔒
          </span>
        ) : (
          credit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-gray-400 text-xs"
              aria-label="Clear day"
            >
              ✕
            </button>
          )
        )}
      </div>

      {credit ? (
        <div className="mt-1.5">
          <p
            className={`text-xs font-medium leading-tight line-clamp-2 ${
              locked ? "text-gray-500" : "text-[#111]"
            }`}
          >
            {credit.itemName?.trim()}
          </p>
          <p className="text-[10px] font-semibold mt-1 text-[#009940]">
            {delivered ? "Delivered" : `${credit.protein ?? 0}g protein`}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-gray-400 text-center">
          {locked ? "—" : armed ? "Tap to add" : "Empty"}
        </p>
      )}
    </div>
  );
}
