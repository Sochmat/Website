"use client";

import { useCallback, useEffect, useState } from "react";
import { toHHMM, weekdayName } from "@/lib/ist";
import {
  emptyWeek,
  DAYS_IN_WEEK,
  type StoreWindow,
  type WeeklyHours,
} from "@/lib/storeHours";
import { Button, DatePicker, Switch, Tag, message } from "antd";
import { Plus, Trash2, Copy } from "lucide-react";

interface ScheduleState {
  scheduleEnabled: boolean;
  weeklyHours: WeeklyHours;
  effectiveOpen: boolean;
  overrideActive: boolean;
  opensAtLabel: string | null;
}

/** "HH:MM" → minutes, accepting "24:00" for a window that runs to midnight. */
function toMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins <= 1440 ? mins : null;
}

export default function StoreHoursPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [week, setWeek] = useState<WeeklyHours>(emptyWeek);
  const [live, setLive] = useState<ScheduleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [savingHolidays, setSavingHolidays] = useState(false);

  // Apply a schedule payload to local form state. Not called synchronously
  // inside an effect (that trips react-hooks/set-state-in-effect) — the effect
  // runs its fetch in an inline async IIFE and calls this only after awaiting.
  const applyData = useCallback((data: ScheduleState) => {
    setEnabled(data.scheduleEnabled);
    setWeek(
      Array.isArray(data.weeklyHours) && data.weeklyHours.length === DAYS_IN_WEEK
        ? data.weeklyHours.map((day) => day.map((w) => ({ ...w })))
        : emptyWeek(),
    );
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/streak-holidays", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.dates)) {
          setHolidays(data.dates as string[]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/store-schedule", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) applyData(data);
    } catch {
      /* ignore */
    }
  };

  // Day-row mutators. Each rebuilds the week immutably so React sees the change.
  const editDay = (dayIndex: number, fn: (windows: StoreWindow[]) => StoreWindow[]) =>
    setWeek((prev) => prev.map((day, i) => (i === dayIndex ? fn(day) : day)));

  const addWindow = (dayIndex: number) => {
    const windows = week[dayIndex];
    // Start where the last one ended, so the new window never overlaps on sight.
    const lastClose = windows.length ? windows[windows.length - 1].close : 11 * 60;
    if (lastClose >= 1440) {
      message.info("That day already runs to midnight.");
      return;
    }
    editDay(dayIndex, (prev) => [
      ...prev,
      { open: lastClose, close: Math.min(lastClose + 120, 1440) },
    ]);
  };

  const removeWindow = (dayIndex: number, at: number) =>
    editDay(dayIndex, (windows) => windows.filter((_, i) => i !== at));

  const setWindowTime = (
    dayIndex: number,
    at: number,
    field: "open" | "close",
    value: string,
  ) => {
    const parsed = toMinutes(value);
    if (parsed === null) return;
    // <input type="time"> cannot express 24:00, so a close of 23:59 is taken to
    // mean midnight. Storing 1439 instead would shut the store a minute early
    // and make the value fail to round-trip through the box it was typed into.
    const mins = field === "close" && parsed === 1439 ? 1440 : parsed;
    editDay(dayIndex, (windows) =>
      windows.map((w, i) => (i === at ? { ...w, [field]: mins } : w)),
    );
  };

  const setDayClosed = (dayIndex: number, closed: boolean) =>
    editDay(dayIndex, (windows) =>
      closed ? [] : windows.length ? windows : [{ open: 11 * 60, close: 22 * 60 + 30 }],
    );

  const copyToAllDays = (dayIndex: number) =>
    setWeek((prev) => prev.map(() => prev[dayIndex].map((w) => ({ ...w }))));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/store-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleEnabled: enabled, weeklyHours: week }),
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

  const saveHolidays = async (dates: string[]) => {
    setSavingHolidays(true);
    try {
      const res = await fetch("/api/admin/streak-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates }),
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.dates)) {
        setHolidays(data.dates as string[]);
        message.success("Closure dates saved");
      } else {
        message.error(data?.message ?? "Failed to save holidays");
      }
    } catch {
      message.error("Failed to save holidays");
    }
    setSavingHolidays(false);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-1">Store hours</h1>
      <p className="text-sm text-gray-500 mb-6">
        Automatically open and close the store on a weekly schedule. Each day
        can hold several windows — a lunch and a dinner service, say — or none
        at all to shut for the day. The manual Store ON/OFF button still works:
        it overrides the schedule until the next open or close time.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <>
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
                  live.opensAtLabel &&
                  ` — opens ${live.opensAtLabel}`}
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

            <div
              className={`divide-y divide-gray-100 ${enabled ? "" : "opacity-50 pointer-events-none"}`}
            >
              {week.map((windows, dayIndex) => {
                const closed = windows.length === 0;
                return (
                  <div key={dayIndex} className="py-3 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[#111] font-medium w-24 shrink-0">
                        {weekdayName(dayIndex)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Switch
                          size="small"
                          checked={!closed}
                          onChange={(on) => setDayClosed(dayIndex, !on)}
                        />
                        <span className="text-sm text-gray-500 w-12">
                          {closed ? "Closed" : "Open"}
                        </span>
                        <Button
                          size="small"
                          type="text"
                          icon={<Copy size={14} />}
                          title="Copy this day to all days"
                          onClick={() => copyToAllDays(dayIndex)}
                        />
                      </div>
                    </div>

                    {!closed && (
                      <div className="mt-2 space-y-2 pl-24">
                        {windows.map((w, at) => (
                          <div key={at} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={toHHMM(w.open)}
                              onChange={(e) =>
                                setWindowTime(dayIndex, at, "open", e.target.value)
                              }
                              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                            />
                            <span className="text-gray-400 text-sm">to</span>
                            <input
                              type="time"
                              value={w.close === 1440 ? "23:59" : toHHMM(w.close)}
                              onChange={(e) =>
                                setWindowTime(dayIndex, at, "close", e.target.value)
                              }
                              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                            />
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<Trash2 size={14} />}
                              onClick={() => removeWindow(dayIndex, at)}
                            />
                          </div>
                        ))}
                        <Button
                          size="small"
                          type="link"
                          icon={<Plus size={14} />}
                          onClick={() => addWindow(dayIndex)}
                          className="!px-0"
                        >
                          Add window
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {enabled && (
              <p className="text-xs text-gray-500">
                All times are IST. A window is open from its start time up to,
                but not including, its end time.
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

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4 mt-6">
            <div>
              <h2 className="text-[#111] font-semibold">Closure dates</h2>
              <p className="text-sm text-gray-500 mt-1">
                A record of dates the kitchen is shut, kept for your reference.
                These no longer affect reward rates: a customer&apos;s rate only
                climbs within a calendar month and resets on the 1st, so skipped
                days cost them nothing either way.
              </p>
            </div>

            <DatePicker
              value={null}
              disabled={savingHolidays}
              placeholder="Add a date"
              disabledDate={(current) =>
                !!current && (current.day() === 0 || current.day() === 6)
              }
              onChange={(_, dateString) => {
                const date = Array.isArray(dateString)
                  ? dateString[0]
                  : dateString;
                if (!date || holidays.includes(date)) return;
                void saveHolidays([...holidays, date]);
              }}
            />

            {holidays.length === 0 ? (
              <p className="text-sm text-gray-400">No holidays set.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {holidays.map((date) => (
                  <Tag
                    key={date}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      void saveHolidays(holidays.filter((d) => d !== date));
                    }}
                  >
                    {date}
                  </Tag>
                ))}
              </div>
            )}

            {savingHolidays && (
              <Button type="text" loading size="small">
                Saving…
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
