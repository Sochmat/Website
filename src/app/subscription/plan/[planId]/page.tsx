"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { message } from "antd";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  accountCredits,
  suggestItemForDate,
  type ScheduleDay,
} from "@/lib/subscriptionSchedule";
import type { SubscriptionCredit, SubscriptionMealPlan } from "@/lib/types";
import DayCard from "@/components/subscription/DayCard";
import SubscriptionItemCard from "@/components/subscription/SubscriptionItemCard";
import SuggestionCard from "@/components/subscription/SuggestionCard";
import CreditsSummary from "@/components/subscription/CreditsSummary";
import type { SubscriptionItem } from "@/components/subscription/types";

interface PlanResponse {
  plan: SubscriptionMealPlan;
  days: ScheduleDay[];
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

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<SubscriptionItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  const loadPlan = useCallback(async () => {
    const res = await fetch(`/api/subscriptions/plans/${planId}`, { cache: "no-store" });
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

  const creditByDate = useMemo(() => {
    const m = new Map<string, SubscriptionCredit>();
    for (const c of plan?.credits ?? []) {
      if (c.date && (c.status === "scheduled" || c.status === "delivered")) m.set(c.date, c);
    }
    return m;
  }, [plan]);

  const accounting = useMemo(
    () => (plan ? accountCredits(plan.credits, plan.expiresOn, new Date()) : null),
    [plan],
  );

  // The earliest editable, unscheduled day whose suggestion window is open.
  const suggestion = useMemo(() => {
    if (!plan || !accounting || accounting.available <= 0 || items.length === 0) return null;
    const target = days.find(
      (d) => d.suggestionVisible && !d.locked && !creditByDate.has(d.date),
    );
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
  }, [plan, accounting, days, items, creditByDate]);

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
      if (d.plan) {
        setPlan(d.plan);
      } else {
        await loadPlan();
      }
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

  const reschedule = (creditId: string, productId: string) =>
    mutate(() =>
      fetch(`/api/subscriptions/plans/${planId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditId, productId }),
      }),
    );

  const unschedule = (creditId: string) =>
    mutate(() =>
      fetch(`/api/subscriptions/plans/${planId}/schedule?creditId=${creditId}`, {
        method: "DELETE",
      }),
    );

  const placeOnDate = (date: string, productId: string) => {
    const existing = creditByDate.get(date);
    if (existing) return reschedule(existing.id, productId);
    return schedule(date, productId);
  };

  const onDragStart = (e: DragStartEvent) => {
    const it = e.active.data.current?.item as SubscriptionItem | undefined;
    if (it) setActiveItem(it);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveItem(null);
    const it = e.active.data.current?.item as SubscriptionItem | undefined;
    const overDate = e.over?.data.current?.date as string | undefined;
    if (it && overDate) void placeOnDate(overDate, it.id);
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
        <Link href="/subscription/orders" className="text-[#f56215] font-semibold text-sm">
          ← My subscriptions
        </Link>
      </main>
    );
  }

  const expired = plan.status === "expired" || accounting.daysLeft === 0;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-10">
        <header className="sticky top-16 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
          <Link href="/subscription/orders" className="p-2 -ml-2 text-[#111]">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-[#111] leading-tight">Schedule meals</h1>
            <p className="text-xs text-gray-500">{plan.planNumber}</p>
          </div>
        </header>

        <div className="p-4 space-y-4">
          <CreditsSummary accounting={accounting} expiresOn={plan.expiresOn} />

          {expired ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm text-sm text-[#737373]">
              This plan has expired. Any unused credits have lapsed.
            </div>
          ) : accounting.exhausted ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="font-semibold text-[#111]">All {plan.mealCount} meals scheduled 🎉</p>
            </div>
          ) : (
            <>
              {suggestion && (
                <SuggestionCard
                  date={suggestion.day.date}
                  weekday={suggestion.day.weekday}
                  item={suggestion.item}
                  busy={busy}
                  onAccept={() => schedule(suggestion.day.date, suggestion.item.id)}
                  onChooseDifferent={() => {
                    setSelectedItemId(null);
                    document
                      .getElementById("meal-picker")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              )}

              <div>
                <h2 className="font-semibold text-[#111] mb-2">Your days</h2>
                <div className="grid grid-cols-2 gap-2">
                  {days.map((d) => (
                    <DayCard
                      key={d.date}
                      date={d.date}
                      weekday={d.weekday}
                      locked={d.locked}
                      credit={creditByDate.get(d.date) ?? null}
                      tapArmed={!!selectedItemId}
                      onTapPlace={() => {
                        if (selectedItemId) {
                          void placeOnDate(d.date, selectedItemId);
                          setSelectedItemId(null);
                        }
                      }}
                      onClear={() => {
                        const c = creditByDate.get(d.date);
                        if (c) void unschedule(c.id);
                      }}
                    />
                  ))}
                </div>
              </div>

              <div id="meal-picker">
                <h2 className="font-semibold text-[#111] mb-2">
                  {selectedItemId ? "Tap a day to place it" : "Choose a meal"}
                </h2>
                {items.length === 0 ? (
                  <p className="text-sm text-gray-500">No meals available.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((it) => (
                      <SubscriptionItemCard
                        key={it.id}
                        item={it}
                        draggable
                        selected={selectedItemId === it.id}
                        onTap={() =>
                          setSelectedItemId((cur) => (cur === it.id ? null : it.id))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="bg-white rounded-xl p-3 shadow-lg border-2 border-[#f56215]">
              <span className="font-medium text-sm text-[#111]">{activeItem.name.trim()}</span>
            </div>
          ) : null}
        </DragOverlay>
      </main>
    </DndContext>
  );
}
