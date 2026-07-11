"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import type { CreditAccounting } from "@/lib/subscriptionSchedule";
import { DIET_LABELS, rupees } from "@/components/subscription/types";
import type { SubscriptionMealPlan } from "@/lib/types";

type PlanRow = SubscriptionMealPlan & { accounting: CreditAccounting };

export default function SubscriptionOrdersPage() {
  const { isAuthenticated, isLoading } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [fetched, setFetched] = useState(false);

  const willFetch = !isLoading && isAuthenticated;

  useEffect(() => {
    if (!willFetch) return;
    let cancelled = false;
    // The session cookie identifies the user; no userId in the query.
    fetch(`/api/subscriptions/plans`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success && Array.isArray(d.plans)) setPlans(d.plans);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [willFetch]);

  const loading = isLoading || (willFetch && !fetched);

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-10">
      <header className="sticky top-16 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <Link href="/subscription" className="p-2 -ml-2 text-[#111]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-[#111]">My subscriptions</h1>
      </header>

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : !isAuthenticated ? (
          <button
            onClick={openLoginPopup}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl"
          >
            Log in to see your subscriptions
          </button>
        ) : plans.length === 0 ? (
          <p className="text-gray-500 text-sm">No subscriptions yet.</p>
        ) : (
          plans.map((p) => {
            const used = p.accounting.scheduled + p.accounting.delivered;
            const expired = p.status === "expired" || p.accounting.daysLeft === 0;
            return (
              <Link
                key={String(p._id)}
                href={`/subscription/plan/${p._id}`}
                className="block bg-white rounded-2xl p-4 shadow-sm"
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-[#111]">{p.planNumber}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.paymentStatus === "paid"
                        ? "bg-[rgba(0,153,64,0.1)] text-[#009940]"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {p.paymentStatus}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="bg-gray-100 text-[#111] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    {p.bracket}g
                  </span>
                  <span className="bg-gray-100 text-[#111] text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    {DIET_LABELS[p.diet]}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-[#666]">
                    {used}/{p.mealCount} scheduled
                  </span>
                  <span className={expired ? "text-red-600 font-medium" : "text-[#009940] font-medium"}>
                    {p.paymentStatus !== "paid"
                      ? rupees(p.totalAmount)
                      : expired
                        ? "Expired"
                        : `${p.accounting.daysLeft} days left`}
                  </span>
                </div>
                {p.paymentStatus === "paid" && !expired && (
                  <p className="text-right text-xs text-[#f56215] font-semibold mt-2">Manage →</p>
                )}
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
