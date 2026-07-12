"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Info,
  Pencil,
  Trash2,
} from "lucide-react";
import { message } from "antd";
import {
  accountCredits,
  firstOpenDay,
  suggestItemForDate,
  type ScheduleDay,
} from "@/lib/subscriptionSchedule";
import {
  BRACKET_KEYS,
  type SubscriptionCredit,
  type SubscriptionMealPlan,
} from "@/lib/types";
import SuggestionCard from "@/components/subscription/SuggestionCard";
import CreditsSummary from "@/components/subscription/CreditsSummary";
import VegDot from "@/components/subscription/VegDot";
import BatchPlanner from "@/components/subscription/BatchPlanner";
import MealPickerSheet from "@/components/subscription/MealPickerSheet";
import {
  TIER_LABELS,
  type SubscriptionItem,
} from "@/components/subscription/types";

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
  // The batch date→meal planner overlay.
  const [plannerOpen, setPlannerOpen] = useState(false);
  // The scheduled credit currently being edited (meal swap).
  const [editingCredit, setEditingCredit] = useState<SubscriptionCredit | null>(null);

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

  // Swap the meal on a scheduled credit, keeping its date.
  const swapMeal = (creditId: string, productId: string) =>
    mutate(() =>
      fetch(`/api/subscriptions/plans/${planId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditId, productId }),
      }),
    );

  // Book a whole set of (date, meal) pairs in one go. The schedule endpoint is
  // single-shot, so we fire them sequentially and reconcile with one refetch.
  const scheduleBatch = async (
    assignments: { date: string; productId: string }[],
  ) => {
    setBusy(true);
    let failed = 0;
    try {
      for (const a of assignments) {
        try {
          const res = await fetch(`/api/subscriptions/plans/${planId}/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(a),
          });
          const d = await res.json();
          if (!d.success) failed++;
        } catch {
          failed++;
        }
      }
      await loadPlan();
      const booked = assignments.length - failed;
      if (failed === 0) {
        message.success(`${booked} ${booked === 1 ? "meal" : "meals"} scheduled`);
      } else {
        message.warning(`${booked} scheduled · ${failed} couldn't be booked`);
      }
    } finally {
      setBusy(false);
    }
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

  const history = plan.credits
    .filter((c) => c.date && c.productId)
    .map((c) => ({ date: c.date!, productId: c.productId! }));

  const bracketIdx = (BRACKET_KEYS as readonly string[]).indexOf(plan.bracket);
  const planName = bracketIdx >= 0 ? TIER_LABELS[bracketIdx] : "Your plan";

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-10">
      <header className="sticky top-16 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <Link href="/subscription/orders" className="p-2 -ml-2 text-[#111]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-[#111] leading-tight">
            Schedule meals
          </h1>
          <p className="text-xs text-gray-500">
            {planName} · {plan.bracket.replace("-", "–")}g protein
          </p>
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
            {/* Cutoff notice */}
            <div className="flex items-start gap-2 rounded-xl bg-[#fff4ec] px-3.5 py-3 ring-1 ring-[#f56215]/15">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#f56215]" />
              <p className="text-xs text-[#8a5a3c] leading-relaxed">
                You can&rsquo;t change or cancel a meal within 3 hours of its
                delivery time.
              </p>
            </div>

            {suggestion && (
              <SuggestionCard
                date={suggestion.day.date}
                weekday={suggestion.day.weekday}
                item={suggestion.item}
                busy={busy}
                onAccept={() =>
                  schedule(suggestion.day.date, suggestion.item.id)
                }
                onChooseDifferent={() => setPlannerOpen(true)}
              />
            )}

            {/* Plan your meals — pick dates, then review a proposal */}
            {canAdd && (
              <button
                type="button"
                onClick={() => setPlannerOpen(true)}
                className="w-full text-left bg-white rounded-2xl p-4 shadow-sm ring-1 ring-[#f56215]/25 flex items-center gap-3"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f56215]/15 text-[#f56215]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[#111]">
                    Plan your meals
                  </span>
                  <span className="block text-xs text-[#737373]">
                    Pick your days and plan future meals.
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
              </button>
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
                      onEdit={() => setEditingCredit(c)}
                    />
                  ))}
                </div>
              </section>
            )}

            {!canAdd && accounting.available === 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                <p className="font-semibold text-[#111]">
                  All {plan.mealCount} meals scheduled 🎉
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <BatchPlanner
        open={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        planId={planId}
        days={days}
        takenDates={takenDates}
        availableCredits={accounting.available}
        items={items}
        history={history}
        busy={busy}
        onConfirm={scheduleBatch}
      />

      {editingCredit && (
        <MealPickerSheet
          items={items}
          activeId={editingCredit.productId}
          title="Change this meal"
          onClose={() => setEditingCredit(null)}
          onPick={async (id) => {
            const target = editingCredit;
            setEditingCredit(null);
            if (id !== target.productId) await swapMeal(target.id, id);
          }}
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
  onEdit,
}: {
  credit: SubscriptionCredit;
  locked: boolean;
  busy: boolean;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const delivered = credit.status === "delivered";
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
      {/* Date chip */}
      <div className="w-14 shrink-0 rounded-xl bg-[#fff4ec] py-2 text-center">
        <p className="text-[10px] font-bold uppercase text-[#c2410c] leading-none">
          {credit.weekday?.slice(0, 3)}
        </p>
        <p className="text-lg font-black text-[#111] leading-tight">
          {Number(credit.date!.split("-")[2])}
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-label="Change meal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-[#111] hover:bg-gray-50 disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label="Remove meal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
