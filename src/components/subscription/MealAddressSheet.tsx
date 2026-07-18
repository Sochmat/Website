"use client";

import SheetCloseButton from "./SheetCloseButton";
import type { UserAddress } from "@/lib/types";

/**
 * A bottom sheet to pick which saved address a single meal is delivered to.
 * Shared by the scheduler ("Your meals") and the batch planner.
 */
export default function MealAddressSheet({
  addresses,
  current,
  fallbackName,
  onClose,
  onPick,
}: {
  addresses: UserAddress[];
  /** The address string currently selected, for the radio highlight. */
  current: string;
  /** Receiver name used when an address has none of its own. */
  fallbackName: string;
  onClose: () => void;
  onPick: (addr: UserAddress) => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <SheetCloseButton onClose={onClose} />
      <div className="relative w-full max-w-[430px] rounded-t-[16px] bg-white max-h-[80vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#d9d9d9]" />
        </div>
        <div className="px-5 pb-3">
          <h3 className="font-bold text-[#111]">Deliver this meal to</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick which address gets this meal.
          </p>
        </div>
        <div className="overflow-y-auto px-4 pb-6 space-y-2">
          {addresses.map((addr) => {
            const isSel = addr.address === current;
            return (
              <button
                key={addr.id ?? addr.address}
                type="button"
                onClick={() => onPick(addr)}
                className={`w-full text-left rounded-xl border p-3 flex gap-3 ${
                  isSel ? "border-[#f56215] bg-[#fff4ec]" : "border-gray-200"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSel ? "border-[#f56215]" : "border-gray-300"
                  }`}
                >
                  {isSel && <span className="h-2 w-2 rounded-full bg-[#f56215]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[#111]">{addr.address}</span>
                  <span className="block text-xs text-[#737373] mt-0.5">
                    Deliver to: {addr.receiverName || fallbackName}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
