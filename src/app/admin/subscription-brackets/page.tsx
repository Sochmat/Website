"use client";

import { useEffect, useState } from "react";
import { message } from "antd";
import { GST_RATE } from "@/lib/subscription";
import { applyDiscount, MEALS_PER_PLAN } from "@/lib/subscriptionBrackets";
import type { SubscriptionBracket } from "@/lib/types";

type Row = SubscriptionBracket & {
  vegPriceStr: string;
  nonVegPriceStr: string;
  vegDiscountStr: string;
  nonVegDiscountStr: string;
  dirty: boolean;
};

function planTotal(perMeal: number): number {
  const subtotal = perMeal * MEALS_PER_PLAN;
  return subtotal + Math.round(subtotal * GST_RATE);
}

export default function AdminSubscriptionBracketsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch("/api/admin/subscription-brackets")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) {
          setRows(
            (d.brackets as SubscriptionBracket[]).map((b) => ({
              ...b,
              vegPriceStr: String(b.vegPrice),
              nonVegPriceStr: String(b.nonVegPrice),
              vegDiscountStr: String(b.vegDiscount ?? 0),
              nonVegDiscountStr: String(b.nonVegDiscount ?? 0),
              dirty: false,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const edit = (
    key: string,
    field: "vegPriceStr" | "nonVegPriceStr" | "vegDiscountStr" | "nonVegDiscountStr",
    value: string,
  ) => {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, [field]: value, dirty: true } : r)),
    );
  };

  const save = async (row: Row) => {
    const vegPrice = Number(row.vegPriceStr);
    const nonVegPrice = Number(row.nonVegPriceStr);
    const vegDiscount = Number(row.vegDiscountStr) || 0;
    const nonVegDiscount = Number(row.nonVegDiscountStr) || 0;
    const res = await fetch("/api/admin/subscription-brackets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: row.key,
        vegPrice,
        nonVegPrice,
        vegDiscount,
        nonVegDiscount,
        active: row.active,
      }),
    });
    const data = await res.json();
    if (data.success) {
      message.success(`${row.label} saved`);
      load();
    } else {
      message.error(data.message ?? "Failed to save");
    }
  };

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-1">Bracket prices</h1>
      <p className="text-sm text-gray-500 mb-4">
        Per-meal price, pre-GST. A plan is {MEALS_PER_PLAN} meals + 5% GST. Changes never
        re-price plans that are already bought.
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-[#111]">
                {row.label} ({row.proteinMin}–{row.proteinMax}g)
              </span>
              <button
                onClick={() => save(row)}
                disabled={!row.dirty}
                className="text-sm bg-[#1c1c1c] text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                Save
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ["Veg", "vegPriceStr", "vegDiscountStr"],
                  ["Non-veg", "nonVegPriceStr", "nonVegDiscountStr"],
                ] as const
              ).map(([label, priceField, discountField]) => {
                const price = Number(row[priceField]) || 0;
                const discount = Number(row[discountField]) || 0;
                const effective = applyDiscount(price, discount);
                return (
                  <div key={priceField}>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">
                          {label} / meal
                        </label>
                        <input
                          type="number"
                          value={row[priceField]}
                          onChange={(e) => edit(row.key, priceField, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-gray-500 mb-1">
                          Discount %
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row[discountField]}
                          onChange={(e) => edit(row.key, discountField, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {discount > 0 ? (
                        <>
                          ₹{effective}/meal{" "}
                          <span className="line-through">₹{price}</span> · {MEALS_PER_PLAN} ×
                          + 5% GST ={" "}
                          <span className="font-semibold">₹{planTotal(effective)}</span>
                        </>
                      ) : (
                        <>
                          {MEALS_PER_PLAN} × ₹{price} + 5% GST ={" "}
                          <span className="font-semibold">₹{planTotal(price)}</span>
                        </>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-gray-500 text-sm">
            No brackets yet. Run the import script to seed them.
          </p>
        )}
      </div>
    </div>
  );
}
