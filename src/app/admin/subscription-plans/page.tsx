"use client";

import { useEffect, useState, useCallback } from "react";
import { SubscriptionPlan } from "@/lib/types";

type Tab = "plans" | "daily";

export default function AdminSubscriptionPlansPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = tab === "daily" ? `?date=${date}` : "";
    try {
      const res = await fetch(`/api/admin/subscription-plans${qs}`);
      const data = await res.json();
      if (data?.success) setPlans(data.plans);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [tab, date]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/admin/subscription-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: id, status }),
    });
    load();
  };

  // Flatten to per-delivery rows for the daily view.
  const deliveries =
    tab === "daily"
      ? plans.flatMap((p) =>
          p.days
            .filter((d) => d.date === date)
            .map((d) => ({
              plan: p,
              item: d.itemName,
              protein: d.protein,
            })),
        )
      : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-4">Subscription plans</h1>

      <div className="flex gap-2 mb-4">
        {(["plans", "daily"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t ? "bg-[#1c1c1c] text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {t === "plans" ? "All plans" : "Daily deliveries"}
          </button>
        ))}
      </div>

      {tab === "daily" && (
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : tab === "plans" ? (
        <div className="space-y-3">
          {plans.length === 0 && <p className="text-gray-500">No plans yet.</p>}
          {plans.map((p) => (
            <div
              key={String(p._id)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex justify-between">
                <span className="font-semibold text-[#111]">{p.planNumber}</span>
                <span className="text-sm text-gray-500">
                  {p.receiver?.name} · {p.receiver?.phone}
                </span>
              </div>
              <p className="text-sm text-[#666] mt-1">
                Week {p.weekStartDate} · {p.itemCount} days · {p.totalProtein}g
                protein · ₹{p.totalAmount} ·{" "}
                <span className="font-medium">{p.paymentStatus}</span>
              </p>
              <div className="flex gap-2 mt-2">
                <select
                  value={p.status}
                  onChange={(e) => updateStatus(String(p._id), e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                >
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.length === 0 && (
            <p className="text-gray-500">No deliveries on {date}.</p>
          )}
          {deliveries.map((d, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between"
            >
              <div>
                <p className="font-medium text-[#111]">{d.item}</p>
                <p className="text-sm text-[#666]">
                  {d.plan.receiver?.name} · {d.plan.receiver?.phone}
                </p>
                <p className="text-sm text-[#666]">{d.plan.receiver?.address}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#009940] font-medium">{d.protein}g</p>
                <p className="text-sm text-[#666]">{d.plan.deliveryTime}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
