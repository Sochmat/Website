"use client";

import { useCallback, useEffect, useState } from "react";
import { parseHHMM, toHHMM, formatMinutesLabel } from "@/lib/ist";

interface ScheduleState {
  scheduleEnabled: boolean;
  openMinutes: number;
  closeMinutes: number;
  effectiveOpen: boolean;
  overrideActive: boolean;
}

export default function StoreHoursPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [openTime, setOpenTime] = useState("11:00");
  const [closeTime, setCloseTime] = useState("22:30");
  const [live, setLive] = useState<ScheduleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Apply a schedule payload to local form state. Not called synchronously
  // inside an effect (that trips react-hooks/set-state-in-effect) — the effect
  // runs its fetch in an inline async IIFE and calls this only after awaiting.
  const applyData = useCallback((data: ScheduleState) => {
    setEnabled(data.scheduleEnabled);
    setOpenTime(toHHMM(data.openMinutes));
    setCloseTime(toHHMM(data.closeMinutes));
    setLive(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/store-schedule", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.success) applyData(data);
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
      const res = await fetch("/api/admin/store-schedule", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) applyData(data);
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    const openMinutes = parseHHMM(openTime);
    const closeMinutes = parseHHMM(closeTime);
    if (openMinutes === null || closeMinutes === null) {
      setError("Please enter valid times.");
      return;
    }
    if (enabled && openMinutes === closeMinutes) {
      setError("Open and close times can't be identical.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/store-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleEnabled: enabled,
          openMinutes,
          closeMinutes,
        }),
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

  const openMin = parseHHMM(openTime);
  const closeMin = parseHHMM(closeTime);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-1">Store hours</h1>
      <p className="text-sm text-gray-500 mb-6">
        Automatically open and close the store on a daily schedule. The manual
        Store ON/OFF button still works — it overrides the schedule until the
        next open or close time.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-5">
          {live && (
            <div
              className={`rounded-lg px-4 py-3 text-sm font-medium ${
                live.effectiveOpen
                  ? "bg-[rgba(0,153,64,0.1)] text-[#009940]"
                  : "bg-red-50 text-red-700"
              }`}
            >
              Store is currently {live.effectiveOpen ? "OPEN" : "CLOSED"}
              {live.overrideActive && " (manual override active)"}
              {!live.overrideActive &&
                live.scheduleEnabled &&
                !live.effectiveOpen &&
                ` — opens at ${formatMinutesLabel(live.openMinutes)}`}
            </div>
          )}

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-[#111] font-medium">
              Enable automatic hours
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Opens at</label>
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                disabled={!enabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Closes at
              </label>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                disabled={!enabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
              />
            </div>
          </div>

          {enabled && openMin !== null && closeMin !== null && (
            <p className="text-xs text-gray-500">
              Open daily from {formatMinutesLabel(openMin)} to{" "}
              {formatMinutesLabel(closeMin)} (IST).
            </p>
          )}

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
