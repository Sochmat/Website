"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "lucide-react";
import { DIET_LABELS, rupees } from "@/components/subscription/types";
import type { SubscriptionMealPlan } from "@/lib/types";

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

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto p-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center mt-8">
        <CheckCircleIcon className="w-14 h-14 text-[#009940] mx-auto" />
        <h1 className="text-xl font-bold text-[#111] mt-3">Subscription confirmed</h1>
        {plan && (
          <>
            <p className="text-sm text-gray-500 mt-1">
              {plan.planNumber} · {rupees(plan.totalAmount)}
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="bg-gray-100 text-[#111] text-xs font-semibold px-2.5 py-1 rounded-full">
                {plan.bracket}g
              </span>
              <span className="bg-gray-100 text-[#111] text-xs font-semibold px-2.5 py-1 rounded-full">
                {DIET_LABELS[plan.diet]}
              </span>
            </div>
            <p className="text-sm text-[#111] mt-4 font-semibold">
              {plan.mealCount} meal credits
            </p>
            {plan.expiresOn && (
              <p className="text-xs text-[#737373] mt-0.5">valid until {plan.expiresOn}</p>
            )}
          </>
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
