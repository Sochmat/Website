"use client";

import { useEffect, useState } from "react";
import type { CreditAccounting } from "@/lib/subscriptionSchedule";
import type { SubscriptionMealPlan } from "@/lib/types";

type Tab = "plans" | "daily";
type PlanRow = SubscriptionMealPlan & { accounting: CreditAccounting };

interface Delivery {
  planId: string;
  creditId: string;
  planNumber: string;
  bracket: string;
  diet: string;
  receiver: { name: string; phone: string; address: string };
  deliveryTime: string;
  itemName?: string;
  protein?: number;
  isVeg?: boolean;
  status: string;
  locked: boolean;
}

export default function AdminSubscriptionPlansPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [dayLocked, setDayLocked] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockedOnly, setLockedOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const qs =
      tab === "daily" ? `?date=${date}${lockedOnly ? "&lockedOnly=1" : ""}` : "";
    (async () => {
      try {
        const res = await fetch(`/api/admin/subscription-plans${qs}`);
        const data = await res.json();
        if (!cancelled && data?.success) {
          if (tab === "daily") {
            setDeliveries(data.deliveries ?? []);
            setDayLocked(!!data.locked);
          } else {
            setPlans(data.plans ?? []);
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, date, lockedOnly, reloadKey]);

  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/admin/subscription-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: id, status }),
    });
    refresh();
  };

  const markDelivered = async (planId: string, creditId: string) => {
    await fetch("/api/admin/subscription-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, creditId, action: "deliver" }),
    });
    refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-4">Subscription plans</h1>

      <div className="flex gap-2 mb-4">
        {(["plans", "daily"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              if (t === tab) return;
              setLoading(true);
              setTab(t);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === t ? "bg-[#1c1c1c] text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {t === "plans" ? "All plans" : "Daily deliveries"}
          </button>
        ))}
      </div>

      {tab === "daily" && (
        <div className="flex items-center gap-4 mb-4">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setLoading(true);
              setDate(e.target.value);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={lockedOnly}
              onChange={(e) => {
                setLoading(true);
                setLockedOnly(e.target.checked);
              }}
            />
            Locked only
          </label>
        </div>
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
                {p.bracket}g · {p.diet} · ₹{p.pricePerMeal} × {p.mealCount} = ₹
                {p.totalAmount} · <span className="font-medium">{p.paymentStatus}</span>
              </p>
              <p className="text-sm text-[#666] mt-0.5">
                {p.accounting.scheduled} scheduled · {p.accounting.delivered} delivered ·{" "}
                {p.accounting.available} available
                {p.expiresOn && <> · expires {p.expiresOn}</>}
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
                  <option value="expired">expired</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.length === 0 && (
            <p className="text-gray-500">
              {lockedOnly && !dayLocked
                ? `Deliveries for ${date} are still editable by customers until 12:00 PM.`
                : `No deliveries on ${date}.`}
            </p>
          )}
          {deliveries.map((d) => (
            <div
              key={`${d.planId}-${d.creditId}`}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 border-2 ${d.isVeg ? "border-green-600" : "border-red-600"} inline-flex items-center justify-center`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${d.isVeg ? "bg-green-600" : "bg-red-600"}`}
                    />
                  </span>
                  <p className="font-medium text-[#111]">{d.itemName?.trim()}</p>
                </div>
                <p className="text-sm text-[#666] mt-0.5">
                  {d.receiver?.name} · {d.receiver?.phone}
                </p>
                <p className="text-sm text-[#666]">{d.receiver?.address}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#009940] font-medium">{d.protein}g</p>
                <p className="text-sm text-[#666]">{d.deliveryTime}</p>
                {d.status === "delivered" ? (
                  <span className="text-xs text-[#009940] font-semibold">Delivered</span>
                ) : d.locked ? (
                  <button
                    onClick={() => markDelivered(d.planId, d.creditId)}
                    className="mt-1 text-xs bg-[#1c1c1c] text-white px-2 py-1 rounded-lg"
                  >
                    Mark delivered
                  </button>
                ) : (
                  <span className="text-xs text-amber-600">Editable until 12:00</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
