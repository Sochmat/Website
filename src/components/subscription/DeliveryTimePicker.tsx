"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import SheetCloseButton from "./SheetCloseButton";

/**
 * Delivery-time chooser. Tapping the field opens a bottom sheet (same style as
 * the meal detail sheet) with curated slots grouped by meal window (lunch /
 * snacks / dinner) — faster than a native spinner and keeps deliveries inside
 * windows the kitchen serves. Values are 24h "HH:MM" strings to match the plan
 * payload.
 */

const SLOT_GROUPS: { group: string; times: string[] }[] = [
  { group: "Lunch", times: ["12:00", "12:30", "13:00", "13:30", "14:00"] },
  { group: "Snacks", times: ["16:00", "16:30", "17:00", "17:30", "18:00"] },
  { group: "Dinner", times: ["19:00", "19:30", "20:00", "20:30", "21:00"] },
];

export function formatSlot(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** A 30-minute delivery window as a range label, e.g. "12:00 – 12:30 PM". */
export function slotLabel(start: string): string {
  const end = addMinutes(start, 30);
  const startMeridiem = Number(start.split(":")[0]) >= 12 ? "PM" : "AM";
  const endMeridiem = Number(end.split(":")[0]) >= 12 ? "PM" : "AM";
  const startText =
    startMeridiem === endMeridiem
      ? formatSlot(start).replace(/ (AM|PM)$/, "")
      : formatSlot(start);
  return `${startText} – ${formatSlot(end)}`;
}

export default function DeliveryTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 250);
  }, []);

  const pick = (t: string) => {
    onChange(t);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#f56215] focus:ring-1 focus:ring-[#f56215]"
      >
        <span className={value ? "text-[#111]" : "text-gray-400"}>
          {value ? slotLabel(value) : "Select delivery time"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {(open || closing) && (
        <div className="fixed inset-0 z-100 flex flex-col items-center justify-end">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/40 ${
              closing ? "animate-fade-out" : ""
            }`}
            onClick={close}
          />

          {/* Floating close button, centered above the sheet */}
          <SheetCloseButton onClose={close} closing={closing} />

          {/* Sheet */}
          <div
            className={`relative w-full max-w-[430px] rounded-t-[12px] bg-white shadow-[0px_-2px_10px_rgba(0,0,0,0.1)] ${
              closing ? "animate-slide-down" : "animate-slide-up"
            }`}
            style={{ maxHeight: "85vh" }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-[10px] pb-[6px]">
              <div className="h-[4px] w-[40px] rounded-full bg-[#d9d9d9]" />
            </div>

            {/* Header */}
            <div className="px-5 pb-2">
              <h3 className="text-base font-bold text-[#111]">
                Select delivery time
              </h3>
            </div>

            {/* Slot groups */}
            <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 pb-6 pt-2">
              {SLOT_GROUPS.map((s) => (
                <div key={s.group}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {s.group}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {s.times.map((t) => {
                      const active = value === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => pick(t)}
                          className={`rounded-xl border px-2 py-2 text-center text-xs font-medium leading-tight transition-colors ${
                            active
                              ? "border-[#f56215] bg-[#f56215] text-white"
                              : "border-gray-200 text-[#333] hover:border-[#f56215] hover:text-[#f56215]"
                          }`}
                        >
                          {slotLabel(t)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
