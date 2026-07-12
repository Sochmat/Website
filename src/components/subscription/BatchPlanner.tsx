"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin, Pencil, X } from "lucide-react";
import type { ScheduleDay } from "@/lib/subscriptionSchedule";
import { suggestItemForDate } from "@/lib/subscriptionSchedule";
import type { UserAddress } from "@/lib/types";
import VegDot from "./VegDot";
import MealPickerSheet from "./MealPickerSheet";
import MealAddressSheet from "./MealAddressSheet";
import type { SubscriptionItem } from "./types";

/**
 * The batch scheduler on a single screen: pick delivery dates on a month
 * calendar and, in real time, a pre-planned non-repeating meal appears below for
 * each selected date. Any meal can be swapped inline before booking the whole
 * set at once — no separate review step.
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateStr(y: number, m0: number, d: number) {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}
/** "2026-07-13" → "Sat, 13 Jul". */
function longDayLabel(ds: string, weekday: string) {
  const [, m, d] = ds.split("-").map(Number);
  return `${weekday.slice(0, 3)}, ${d} ${MONTHS_SHORT[m - 1]}`;
}

export default function BatchPlanner({
  open,
  onClose,
  planId,
  days,
  takenDates,
  availableCredits,
  items,
  history,
  busy,
  addresses,
  defaultReceiver,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  days: ScheduleDay[];
  takenDates: Set<string>;
  availableCredits: number;
  items: SubscriptionItem[];
  history: { date: string; productId: string }[];
  busy: boolean;
  addresses: UserAddress[];
  defaultReceiver: { name: string; phone: string; address: string; lat?: number; long?: number };
  onConfirm: (
    assignments: {
      date: string;
      productId: string;
      receiver?: { name: string; phone: string; address: string; lat?: number; long?: number };
    }[],
  ) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [proposal, setProposal] = useState<Record<string, string>>({});
  const [swapDate, setSwapDate] = useState<string | null>(null);
  const [monthIdx, setMonthIdx] = useState(0);
  // Per-date delivery address override (the chosen saved address).
  const [addrByDate, setAddrByDate] = useState<Record<string, UserAddress>>({});
  const [addrDate, setAddrDate] = useState<string | null>(null);

  // Per-date lock/booked lookups from the window.
  const lockedByDate = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of days) m.set(d.date, d.locked);
    return m;
  }, [days]);
  const weekdayByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of days) m.set(d.date, d.weekday);
    return m;
  }, [days]);
  const itemById = useMemo(() => {
    const m = new Map<string, SubscriptionItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  // The months the schedulable window spans, so the calendar can page through them.
  const months = useMemo(() => {
    if (days.length === 0) return [] as { year: number; month0: number }[];
    const [fy, fm] = days[0].date.split("-").map(Number);
    const [ly, lm] = days[days.length - 1].date.split("-").map(Number);
    const out: { year: number; month0: number }[] = [];
    let y = fy;
    let m = fm - 1;
    while (y < ly || (y === ly && m <= lm - 1)) {
      out.push({ year: y, month0: m });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }, [days]);

  const atCap = selected.length >= availableCredits;

  const reset = () => {
    setSelected([]);
    setProposal({});
    setSwapDate(null);
    setAddrByDate({});
    setAddrDate(null);
    setMonthIdx(0);
  };

  const close = () => {
    reset();
    onClose();
  };

  // Toggling a date also maintains the live proposal: a newly-picked date gets a
  // suggestion that avoids the meals already proposed for the other picks (and
  // the plan's real history); deselecting drops its meal. Manual swaps are left
  // untouched because we only auto-fill dates not already in the proposal.
  const toggleDate = (ds: string) => {
    if (selected.includes(ds)) {
      setSelected(selected.filter((d) => d !== ds));
      setProposal((p) => {
        const next = { ...p };
        delete next[ds];
        return next;
      });
      setAddrByDate((a) => {
        const next = { ...a };
        delete next[ds];
        return next;
      });
      return;
    }
    if (selected.length >= availableCredits) return;
    const localHistory = [
      ...history,
      ...Object.entries(proposal).map(([date, productId]) => ({ date, productId })),
    ];
    const item = suggestItemForDate({
      date: ds,
      candidates: items,
      history: localHistory,
      seed: planId,
    });
    setSelected([...selected, ds]);
    if (item) setProposal((p) => ({ ...p, [ds]: item.id }));
  };

  const confirm = async () => {
    const assignments = Object.entries(proposal).map(([date, productId]) => {
      const addr = addrByDate[date];
      return {
        date,
        productId,
        receiver: addr
          ? {
              name: addr.receiverName || defaultReceiver.name,
              phone: addr.receiverPhone || defaultReceiver.phone,
              address: addr.address,
              lat: addr.lat,
              long: addr.long,
            }
          : undefined,
      };
    });
    if (assignments.length === 0) return;
    await onConfirm(assignments);
    close();
  };

  if (!open) return null;

  const sortedSelected = [...selected].sort();
  const currentMonth = months[monthIdx];

  return (
    <div className="fixed inset-0 z-100 bg-[#f5f5f5] max-w-[430px] mx-auto flex flex-col">
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={close}
          className="p-2 -ml-2 text-[#111]"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#111] leading-tight">
            Plan your meals
          </h1>
          <p className="text-xs text-gray-500">
            {selected.length} of {availableCredits} days selected
          </p>
        </div>
        <button type="button" onClick={close} className="p-2 -mr-2 text-gray-400" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Calendar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
              className="p-1.5 rounded-lg text-[#111] disabled:opacity-30"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-semibold text-[#111]">
              {currentMonth ? `${MONTHS[currentMonth.month0]} ${currentMonth.year}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={monthIdx >= months.length - 1}
              className="p-1.5 rounded-lg text-[#111] disabled:opacity-30"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-center text-[11px] font-semibold text-gray-400 py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Day cells */}
          {currentMonth && (
            <MonthGrid
              year={currentMonth.year}
              month0={currentMonth.month0}
              lockedByDate={lockedByDate}
              takenDates={takenDates}
              selected={selected}
              atCap={atCap}
              onToggle={toggleDate}
            />
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
            <Legend swatch="bg-[#f56215]" label="Selected" />
            <Legend swatch="bg-[#f56215]/15" label="Already booked" />
            <Legend swatch="bg-gray-100" label="Unavailable" />
          </div>
          {atCap && (
            <p className="mt-3 text-xs text-[#c2410c]">
              You&rsquo;ve selected all {availableCredits} available credits.
            </p>
          )}
        </div>

        {/* Live meal proposal for the selected days */}
        {sortedSelected.length === 0 ? (
          <p className="text-center text-sm text-gray-500 px-4">
            Pick your delivery days above — we&rsquo;ll propose a meal for each,
            which you can change here.
          </p>
        ) : (
          <div>
            <h2 className="font-semibold text-[#111] mb-2 px-1">Your meals</h2>
            <div className="space-y-2">
              {sortedSelected.map((date) => {
                const item = proposal[date] ? itemById.get(proposal[date]) : undefined;
                const deliveryLabel = (
                  addrByDate[date]?.address ?? defaultReceiver.address
                ).split(",")[0];
                return (
                  <div key={date} className="bg-white rounded-2xl p-3 shadow-sm">
                    {/* Meal header */}
                    <div className="flex items-center gap-3">
                      {/* Date chip */}
                      <div className="w-14 shrink-0 rounded-xl bg-[#fff4ec] py-2 text-center">
                        <p className="text-[10px] font-bold uppercase text-[#c2410c] leading-none">
                          {(weekdayByDate.get(date) ?? "").slice(0, 3)}
                        </p>
                        <p className="text-lg font-black text-[#111] leading-tight">
                          {Number(date.split("-")[2])}
                        </p>
                      </div>

                      {/* Proposed meal */}
                      <div className="flex-1 min-w-0">
                        {item ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <VegDot isVeg={item.isVeg} />
                              <span className="font-medium text-sm text-[#111] truncate">
                                {item.name.trim()}
                              </span>
                            </div>
                            <p className="text-[11px] font-semibold text-[#009940] mt-0.5">
                              {item.protein}g protein
                            </p>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">No meal available</span>
                        )}
                      </div>
                    </div>

                    {/* Action row — address + change meal, one line */}
                    <div className="mt-3 flex items-center gap-2">
                      {addresses.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setAddrDate(date)}
                          className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-[#f56215]/40 px-2.5 py-1.5 text-xs font-semibold text-[#f56215]"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{deliveryLabel}</span>
                          <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" />
                        </button>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-[#737373]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{deliveryLabel}</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setSwapDate(date)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[#111] font-semibold text-xs hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Change meal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-gray-100 p-4">
        <button
          type="button"
          onClick={confirm}
          disabled={busy || sortedSelected.length === 0}
          className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy
            ? "Scheduling…"
            : sortedSelected.length === 0
              ? "Select at least one day"
              : `Confirm ${sortedSelected.length} ${sortedSelected.length === 1 ? "meal" : "meals"}`}
        </button>
      </div>

      {/* Meal-swap sheet */}
      {swapDate && (
        <MealPickerSheet
          items={items}
          activeId={proposal[swapDate]}
          onPick={(id) => {
            setProposal((p) => ({ ...p, [swapDate]: id }));
            setSwapDate(null);
          }}
          onClose={() => setSwapDate(null)}
          title={
            weekdayByDate.get(swapDate)
              ? longDayLabel(swapDate, weekdayByDate.get(swapDate)!)
              : "Choose a meal"
          }
        />
      )}

      {/* Per-meal delivery address sheet */}
      {addrDate && (
        <MealAddressSheet
          addresses={addresses}
          current={addrByDate[addrDate]?.address ?? defaultReceiver.address}
          fallbackName={defaultReceiver.name}
          onClose={() => setAddrDate(null)}
          onPick={(addr) => {
            setAddrByDate((a) => ({ ...a, [addrDate]: addr }));
            setAddrDate(null);
          }}
        />
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${swatch}`} />
      {label}
    </span>
  );
}

function MonthGrid({
  year,
  month0,
  lockedByDate,
  takenDates,
  selected,
  atCap,
  onToggle,
}: {
  year: number;
  month0: number;
  lockedByDate: Map<string, boolean>;
  takenDates: Set<string>;
  selected: string[];
  atCap: boolean;
  onToggle: (ds: string) => void;
}) {
  const cells: (string | null)[] = [];
  const startWeekday = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateStr(year, month0, d));

  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((ds, i) => {
        if (!ds) return <span key={`e${i}`} />;
        const day = Number(ds.split("-")[2]);
        const inWindow = lockedByDate.has(ds);
        const booked = takenDates.has(ds);
        const locked = lockedByDate.get(ds);
        const isSelected = selected.includes(ds);
        const selectable = inWindow && !booked && !locked && (!atCap || isSelected);

        let cls = "text-gray-300"; // outside window / unavailable
        if (isSelected) cls = "bg-[#f56215] text-white font-bold";
        else if (booked) cls = "bg-[#f56215]/15 text-[#c2410c] font-semibold";
        else if (inWindow && !locked) cls = "text-[#111] hover:bg-gray-100";
        else if (inWindow && locked) cls = "text-gray-300";

        return (
          <button
            key={ds}
            type="button"
            disabled={!selectable}
            onClick={() => onToggle(ds)}
            className={`aspect-square rounded-full text-sm flex items-center justify-center transition-colors disabled:cursor-not-allowed ${cls}`}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}
