"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "lucide-react";
import { SubscriptionPlan } from "@/lib/types";

function SuccessContent() {
  const planId = useSearchParams().get("planId");
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (!planId) return;
    fetch(`/api/subscriptions/plans?_id=${planId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.plan) setPlan(d.plan as SubscriptionPlan);
      })
      .catch(() => {});
  }, [planId]);

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto p-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm text-center mt-8">
        <CheckCircleIcon className="w-14 h-14 text-[#009940] mx-auto" />
        <h1 className="text-xl font-bold text-[#111] mt-3">Subscription confirmed</h1>
        {plan && (
          <p className="text-sm text-gray-500 mt-1">
            {plan.planNumber} · {plan.itemCount} days · ₹{plan.totalAmount}
          </p>
        )}
      </div>

      {plan && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <h2 className="font-semibold text-[#111] mb-2">Your week</h2>
          <div className="space-y-2">
            {plan.days.map((d) => (
              <div key={d.date} className="flex justify-between text-sm">
                <span className="text-[#666]">
                  {d.weekday.slice(0, 3)} {d.date.slice(5)}
                </span>
                <span className="text-[#111] font-medium">{d.itemName}</span>
                <span className="text-[#009940]">{d.protein}g</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between text-sm font-semibold">
            <span>Total protein</span>
            <span className="text-[#009940]">{plan.totalProtein}g</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <Link
          href="/subscription/orders"
          className="flex-1 text-center bg-white border border-gray-200 text-[#111] font-medium py-3 rounded-xl"
        >
          My subscriptions
        </Link>
        <Link
          href="/subscription"
          className="flex-1 text-center bg-[#f56215] text-white font-semibold py-3 rounded-xl"
        >
          Build another
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
