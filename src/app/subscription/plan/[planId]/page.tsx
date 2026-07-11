"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, X } from "lucide-react";
import { message } from "antd";
import {
  accountCredits,
  firstOpenDay,
  suggestItemForDate,
  type ScheduleDay,
} from "@/lib/subscriptionSchedule";
import type { SubscriptionCredit, SubscriptionMealPlan } from "@/lib/types";
import SubscriptionItemCard from "@/components/subscription/SubscriptionItemCard";
import SuggestionCard from "@/components/subscription/SuggestionCard";
import CreditsSummary from "@/components/subscription/CreditsSummary";
import VegDot from "@/components/subscription/VegDot";
import IngredientsSheet from "@/components/IngredientsSheet";
import {
  toProduct,
  type SubscriptionItem,
} from "@/components/subscription/types";

interface PlanResponse {
  plan: SubscriptionMealPlan;
  days: ScheduleDay[];
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "12 Jul" from a yyyy-mm-dd string. */
function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export default function SchedulerPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = use(params);

  const [plan, setPlan] = useState<SubscriptionMealPlan | null>(null);
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // The add-a-meal draft: a chosen meal + a chosen delivery date.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState("");
  // The item whose description sheet is open.
  const [detailItem, setDetailItem] = useState<SubscriptionItem | null>(null);

  const loadPlan = useCallback(async () => {
    const res = await fetch(`/api/subscriptions/plans/${planId}`, {
      cache: "no-store",
    });
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    const d = (await res.json()) as { success: boolean } & PlanResponse;
    if (d?.success) {
      setPlan(d.plan);
      setDays(d.days);
      return d.plan;
    }
    return null;
  }, [planId]);

  useEffect(() => {
    loadPlan().finally(() => setLoading(false));
  }, [loadPlan]);

  // The item pool is already narrowed to this plan's bracket + diet by the API.
  useEffect(() => {
    if (!plan) return;
    fetch(`/api/subscriptions/menu?bracket=${plan.bracket}&diet=${plan.diet}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setItems(d.items as SubscriptionItem[]);
      })
      .catch(() => {});
  }, [plan?.bracket, plan?.diet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Booked meals (scheduled or delivered), oldest first.
  const scheduledCredits = useMemo(() => {
    return (plan?.credits ?? [])
      .filter(
        (c) => c.date && (c.status === "scheduled" || c.status === "delivered"),
      )
      .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  }, [plan]);

  const takenDates = useMemo(
    () => new Set(scheduledCredits.map((c) => c.date!)),
    [scheduledCredits],
  );

  // First day the customer may still book (today is excluded once its noon passes).
  const firstBookable = useMemo(
    () => days.find((d) => !d.locked)?.date,
    [days],
  );
  const lockedByDate = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of days) m.set(d.date, d.locked);
    return m;
  }, [days]);

  const accounting = useMemo(
    () =>
      plan ? accountCredits(plan.credits, plan.expiresOn, new Date()) : null,
    [plan],
  );

  // A meal suggested for the customer's next open day. Available whenever they
  // have a credit and an unbooked day — not gated on the evening reveal window.
  const suggestion = useMemo(() => {
    if (!plan || !accounting || accounting.available <= 0 || items.length === 0)
      return null;
    const target = firstOpenDay(days, takenDates);
    if (!target) return null;
    const history = plan.credits
      .filter((c) => c.date && c.productId)
      .map((c) => ({ date: c.date!, productId: c.productId! }));
    const item = suggestItemForDate({
      date: target.date,
      candidates: items,
      history,
      seed: String(plan._id),
    });
    return item ? { day: target, item } : null;
  }, [plan, accounting, days, items, takenDates]);

  async function mutate(fn: () => Promise<Response>) {
    setBusy(true);
    try {
      const res = await fn();
      const d = await res.json();
      if (!d.success) {
        message.error(d.message ?? "Something went wrong");
        if (res.status === 409) await loadPlan(); // stale — refetch
        return false;
      }
      if (d.plan) setPlan(d.plan);
      else await loadPlan();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const schedule = (date: string, productId: string) =>
    mutate(() =>
      fetch(`/api/subscriptions/plans/${planId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, productId }),
      }),
    );

  const unschedule = (creditId: string) =>
    mutate(() =>
      fetch(
        `/api/subscriptions/plans/${planId}/schedule?creditId=${creditId}`,
        {
          method: "DELETE",
        },
      ),
    );

  const clearDraft = () => {
    setSelectedItemId(null);
    setPickedDate("");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }
  if (notFound || !plan || !accounting) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto p-4">
        <p className="text-gray-500 text-sm">Plan not found.</p>
        <Link
          href="/subscription/orders"
          className="text-[#f56215] font-semibold text-sm"
        >
          ← My subscriptions
        </Link>
      </main>
    );
  }

  const expired = plan.status === "expired" || accounting.daysLeft === 0;
  const canAdd = !expired && accounting.available > 0 && !!firstBookable;

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;
  const draftDate = pickedDate || firstBookable || "";
  const dateTaken = !!draftDate && takenDates.has(draftDate);
  const canConfirm = !!selectedItem && !!draftDate && !dateTaken && !busy;

  const addMeal = async () => {
    if (!selectedItem || !draftDate) return;
    const ok = await schedule(draftDate, selectedItem.id);
    if (ok) clearDraft();
  };

  return (
    <main
      className={`min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto ${selectedItem ? "pb-44" : "pb-10"}`}
    >
      <header className="sticky top-16 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <Link href="/subscription/orders" className="p-2 -ml-2 text-[#111]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-[#111] leading-tight">
            Schedule meals
          </h1>
          <p className="text-xs text-gray-500">{plan.planNumber}</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <CreditsSummary accounting={accounting} expiresOn={plan.expiresOn} />

        {expired ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm text-sm text-[#737373]">
            This plan has expired. Any unused credits have lapsed.
          </div>
        ) : (
          <>
            {suggestion && (
              <SuggestionCard
                date={suggestion.day.date}
                weekday={suggestion.day.weekday}
                item={suggestion.item}
                busy={busy}
                onAccept={() =>
                  schedule(suggestion.day.date, suggestion.item.id)
                }
                onChooseDifferent={() => {
                  clearDraft();
                  document
                    .getElementById("meal-picker")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            )}

            {/* Booked meals — a short list, not a month of cells */}
            {scheduledCredits.length > 0 && (
              <section>
                <h2 className="font-semibold text-[#111] mb-2">Your meals</h2>
                <div className="space-y-2">
                  {scheduledCredits.map((c) => (
                    <ScheduledRow
                      key={c.id}
                      credit={c}
                      locked={lockedByDate.get(c.date!) ?? false}
                      busy={busy}
                      onRemove={() => unschedule(c.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Add a meal: pick a meal, then choose its day in the bottom bar */}
            {canAdd ? (
              <section id="meal-picker">
                <h2 className="font-semibold text-[#111]">Add a meal</h2>
                <p className="text-xs text-[#737373] mt-0.5 mb-2">
                  Pick a meal, then choose the day you want it.
                </p>
                {items.length === 0 ? (
                  <p className="text-sm text-gray-500">No meals available.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((it) => (
                      <SubscriptionItemCard
                        key={it.id}
                        item={it}
                        selected={selectedItemId === it.id}
                        onTap={() =>
                          setSelectedItemId((cur) =>
                            cur === it.id ? null : it.id,
                          )
                        }
                        onInfo={() => setDetailItem(it)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              accounting.available === 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                  <p className="font-semibold text-[#111]">
                    All {plan.mealCount} meals scheduled 🎉
                  </p>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Sticky action bar: confirm the chosen meal + date */}
      {selectedItem && canAdd && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 px-4 pt-3 pb-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] space-y-3 z-10">
          <div className="flex items-center gap-2">
            <VegDot isVeg={selectedItem.isVeg} />
            <span className="flex-1 font-semibold text-sm text-[#111] truncate">
              {selectedItem.name.trim()}
            </span>
            <button
              type="button"
              onClick={clearDraft}
              aria-label="Clear selection"
              className="text-gray-400 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
              <input
                type="date"
                value={draftDate}
                min={firstBookable}
                max={plan.expiresOn}
                onChange={(e) => setPickedDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-[#111]"
              />
            </label>
            <button
              type="button"
              onClick={addMeal}
              disabled={!canConfirm}
              className="shrink-0 bg-[#f56215] text-white font-semibold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add to plan"}
            </button>
          </div>

          {dateTaken && (
            <p className="text-xs text-red-500">
              You already have a meal on {dayLabel(draftDate)} — pick another
              day.
            </p>
          )}
        </div>
      )}

      {detailItem && (
        <IngredientsSheet
          open
          onClose={() => setDetailItem(null)}
          product={toProduct(detailItem)}
        />
      )}
    </main>
  );
}

function ScheduledRow({
  credit,
  locked,
  busy,
  onRemove,
}: {
  credit: SubscriptionCredit;
  locked: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const delivered = credit.status === "delivered";
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
      {/* Date chip */}
      <div className="w-12 shrink-0 text-center">
        <p className="text-[11px] font-semibold text-[#737373] uppercase">
          {credit.weekday?.slice(0, 3)}
        </p>
        <p className="text-sm font-bold text-[#111] leading-tight">
          {dayLabel(credit.date!)}
        </p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {credit.isVeg !== undefined && <VegDot isVeg={credit.isVeg} />}
          <span className="font-medium text-sm text-[#111] truncate">
            {credit.itemName?.trim()}
          </span>
        </div>
        <p className="text-[11px] font-semibold text-[#009940] mt-0.5">
          {delivered ? "Delivered" : `${credit.protein ?? 0}g protein`}
        </p>
      </div>

      {delivered ? null : locked ? (
        <span
          className="text-[11px] text-gray-400 flex items-center gap-1"
          title="Locked at 12:00 PM"
        >
          🔒 Locked
        </span>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-xs text-[#f56215] font-semibold px-2 py-1 disabled:opacity-50"
        >
          Remove
        </button>
      )}
    </div>
  );
}
