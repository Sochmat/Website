"use client";

import { useCallback, useEffect, useState } from "react";
import { SOCIETIES } from "@/lib/societies";
import {
  sanitizeDiscountMap,
  type SocietyDiscountMap,
} from "@/lib/societyDiscounts";

export default function SocietyDiscountsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Per-society percentage as a string, so the input can be cleared while typing.
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const applyData = useCallback((discounts: SocietyDiscountMap) => {
    const next: Record<string, string> = {};
    for (const s of SOCIETIES) next[s.id] = String(discounts[s.id] ?? 0);
    setValues(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/society-discounts", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.success) applyData(data.discounts ?? {});
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyData]);

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/society-discounts", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.success) applyData(data.discounts ?? {});
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    // Validate every field is a whole number in 0–100.
    const discounts: SocietyDiscountMap = {};
    for (const s of SOCIETIES) {
      const raw = (values[s.id] ?? "").trim();
      const pct = raw === "" ? 0 : Number(raw);
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        setError(`${s.name}: enter a whole number between 0 and 100.`);
        return;
      }
      if (pct > 0) discounts[s.id] = pct;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/society-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discounts: sanitizeDiscountMap(discounts) }),
      });
      const data = await res.json();
      if (data?.success) {
        setSavedAt(Date.now());
        await reload();
      } else {
        setError(data?.message ?? "Failed to save.");
      }
    } catch {
      setError("Failed to save.");
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-1">Location discounts</h1>
      <p className="text-sm text-gray-500 mb-6">
        Give a flat discount percentage to a delivery location. It applies to the
        item subtotal (before GST) on every order to that location and stacks with
        any coupon. Set to 0 for no discount.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-5">
          {SOCIETIES.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[#111] font-medium">{s.name}</div>
                <div className="text-xs text-gray-500">{s.sector}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={values[s.id] ?? "0"}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [s.id]: e.target.value }))
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-right"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="bg-[#1c1c1c] text-white px-5 py-2 rounded-lg font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {savedAt && !saving && (
              <span className="text-sm text-[#009940]">Saved.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
