"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "lucide-react";
import {
  DIET_LABELS,
  rupees,
  TIER_LABELS,
} from "@/components/subscription/types";
import { BRACKET_KEYS, type SubscriptionMealPlan } from "@/lib/types";

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

/** "2026-08-11" → "11 Aug 2026" (parsed manually to dodge timezone shifts). */
function formatDate(d?: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

function planNameFor(bracket: string): string {
  const i = (BRACKET_KEYS as readonly string[]).indexOf(bracket);
  return i >= 0 ? TIER_LABELS[i] : "";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-[#737373]">{label}</span>
      <span className="text-sm font-semibold text-[#111]">{value}</span>
    </div>
  );
}

function SuccessContent() {
  const planId = useSearchParams().get("planId");
  const [plan, setPlan] = useState<SubscriptionMealPlan | null>(null);

  useEffect(() => {
    if (!planId) return;
    fetch(`/api/subscriptions/plans/${planId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.plan) setPlan(d.plan as SubscriptionMealPlan);
      })
      .catch(() => {});
  }, [planId]);

  const planName = plan ? planNameFor(plan.bracket) : "";

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-sm mt-8 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f6ec]">
            <CheckCircleIcon className="w-10 h-10 text-[#009940]" />
          </div>
          <h1 className="text-xl font-bold text-[#111] mt-4">
            Subscription Confirmed!
          </h1>
          <p className="text-sm text-gray-500 mt-1">Your plan is active.</p>
        </div>

        {plan && (
          <div className="px-6 pb-6">
            {/* Plan highlight */}
            <div className="flex items-center justify-between rounded-xl bg-[#fff4ec] px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-lg font-extrabold leading-tight text-[#111]">
                  {planName || "Your plan"}
                </p>
                <p className="text-xs font-semibold text-[#c2410c] mt-0.5">
                  {plan.bracket.replace("-", "–")}g protein ·{" "}
                  {DIET_LABELS[plan.diet]}
                </p>
              </div>
              <div className="text-right shrink-0 pl-3">
                <p className="text-2xl font-black leading-none text-[#f56215]">
                  {plan.mealCount}
                </p>
                <p className="text-[11px] font-semibold text-[#c2410c]">
                  meals
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="mt-3 divide-y divide-gray-100">
              <DetailRow label="Amount paid" value={rupees(plan.totalAmount)} />
              {plan.expiresOn && (
                <DetailRow
                  label="Credits valid until"
                  value={formatDate(plan.expiresOn)}
                />
              )}
              <DetailRow label="Order ID" value={plan.planNumber} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {planId && (
          <Link
            href={`/subscription/plan/${planId}`}
            className="block text-center bg-[#f56215] text-white font-semibold py-3 rounded-xl"
          >
            Schedule your meals
          </Link>
        )}
        <Link
          href="/subscription/orders"
          className="block text-center bg-white border border-gray-200 text-[#111] font-medium py-3 rounded-xl"
        >
          My subscriptions
        </Link>
      </div>
    </main>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
          <p className="text-gray-500">Loading…</p>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
