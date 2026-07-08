"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { SubscriptionPlan } from "@/lib/types";

export default function SubscriptionOrdersPage() {
  const { user, isAuthenticated, isLoading } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user?._id) {
      setLoading(false);
      return;
    }
    fetch(`/api/subscriptions/plans?userId=${user._id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.plans)) setPlans(d.plans);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, isLoading, user?._id]);

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-10">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
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
          plans.map((p) => (
            <div key={String(p._id)} className="bg-white rounded-2xl p-4 shadow-sm">
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
              <p className="text-sm text-[#666] mt-1">
                Week of {p.weekStartDate} · {p.itemCount} days
              </p>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-[#009940] font-medium">
                  {p.totalProtein}g protein
                </span>
                <span className="font-semibold text-[#111]">₹{p.totalAmount}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
