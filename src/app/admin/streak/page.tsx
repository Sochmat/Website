"use client";

import { useCallback, useEffect, useState } from "react";
import { InputNumber, Select, Button, message } from "antd";
import { SOCIETIES } from "@/lib/societies";
import {
  DEFAULT_LADDER,
  DEFAULT_LADDER_KEY,
  MAX_LADDER_LENGTH,
  MAX_LADDER_RATE,
  MIN_LADDER_LENGTH,
  sanitizeStreakConfig,
  type LadderMap,
} from "@/lib/streakLadder";

/** Rates held as strings while editing so a field can be cleared mid-type. */
type Draft = Record<string, number[]>;

const LENGTH_OPTIONS = Array.from(
  { length: MAX_LADDER_LENGTH - MIN_LADDER_LENGTH + 1 },
  (_, i) => {
    const n = MIN_LADDER_LENGTH + i;
    return { value: n, label: `${n} ${n === 1 ? "day" : "days"}` };
  },
);

/** Grow or shrink a ladder, extending with its own last rate. */
function resize(rates: number[], length: number): number[] {
  if (length <= rates.length) return rates.slice(0, length);
  const last = rates.length ? rates[rates.length - 1] : 0;
  return [...rates, ...Array.from({ length: length - rates.length }, () => last)];
}

function LadderEditor({
  rates,
  onChange,
}: {
  rates: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Ladder length</span>
        <Select
          size="small"
          value={rates.length}
          options={LENGTH_OPTIONS}
          onChange={(n) => onChange(resize(rates, n))}
          style={{ width: 110 }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {rates.map((rate, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-400">
              {index === rates.length - 1 ? `Day ${index + 1}+` : `Day ${index + 1}`}
            </span>
            <InputNumber
              size="small"
              min={0}
              max={MAX_LADDER_RATE}
              step={1}
              precision={0}
              value={rate}
              onChange={(v) => {
                const next = [...rates];
                next[index] = Number(v ?? 0);
                onChange(next);
              }}
              style={{ width: 64 }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Day {rates.length} is the cap — it holds for the rest of the month once
        reached.
      </p>
    </div>
  );
}

export default function AdminStreakPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultRates, setDefaultRates] = useState<number[]>(DEFAULT_LADDER);
  /** Locations with their own ladder. Absent from the draft = inherits default. */
  const [custom, setCustom] = useState<Draft>({});
  /** Locations opted out entirely — no earning, no day advance. */
  const [disabled, setDisabled] = useState<string[]>([]);

  const applyData = useCallback((ladders: LadderMap, off: string[]) => {
    setDefaultRates(ladders[DEFAULT_LADDER_KEY] ?? DEFAULT_LADDER);
    const next: Draft = {};
    for (const s of SOCIETIES) {
      if (ladders[s.id]?.length) next[s.id] = ladders[s.id];
    }
    setCustom(next);
    setDisabled(off);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/streak-ladders", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.success) applyData(data.ladders ?? {}, data.disabled ?? []);
    } catch {
      /* ignore */
    }
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const ladders: LadderMap = {
        [DEFAULT_LADDER_KEY]: defaultRates,
        ...custom,
      };
      const res = await fetch("/api/admin/streak-ladders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizeStreakConfig({ ladders, disabled })),
      });
      const data = await res.json();
      if (data?.success) {
        message.success("Streak ladders saved");
        await load();
      } else {
        message.error(data?.message ?? "Failed to save");
      }
    } catch {
      message.error("Failed to save");
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-1">Streak rewards</h1>
      <p className="text-sm text-gray-500 mb-6">
        A ladder is the reward percentage a customer earns by how many separate
        days they have ordered in the current calendar month. The days need not be
        consecutive, the rate only climbs, and every customer resets to the first
        rung on the 1st. A customer has one day count — the delivery location of
        the order decides which ladder converts it into a percentage.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-[#111] font-semibold">Default</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Used by every location without its own ladder, including any
              location added later.
            </p>
            <LadderEditor rates={defaultRates} onChange={setDefaultRates} />
          </div>

          {SOCIETIES.map((s) => {
            const own = custom[s.id];
            const off = disabled.includes(s.id);
            const mode = off ? "off" : own ? "custom" : "default";
            return (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[#111] font-semibold">{s.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{s.sector}</p>
                  </div>
                  <Select
                    size="small"
                    value={mode}
                    style={{ width: 150 }}
                    onChange={(next) => {
                      // A location keeps its custom ladder while switched off,
                      // so turning it back on restores what was configured.
                      setDisabled((prev) =>
                        next === "off"
                          ? [...new Set([...prev, s.id])]
                          : prev.filter((id) => id !== s.id),
                      );
                      if (next === "custom") {
                        setCustom((prev) =>
                          prev[s.id] ? prev : { ...prev, [s.id]: [...defaultRates] },
                        );
                      } else if (next === "default") {
                        setCustom((prev) => {
                          const copy = { ...prev };
                          delete copy[s.id];
                          return copy;
                        });
                      }
                    }}
                    options={[
                      { value: "default", label: "Uses default" },
                      { value: "custom", label: "Custom ladder" },
                      { value: "off", label: "Rewards off" },
                    ]}
                  />
                </div>

                {off ? (
                  <p className="mt-3 text-xs text-gray-500">
                    Orders here earn no points and don&apos;t count towards a
                    customer&apos;s days for the month. Points earned elsewhere
                    can still be spent here.
                  </p>
                ) : own ? (
                  <div className="mt-4">
                    <LadderEditor
                      rates={own}
                      onChange={(next) =>
                        setCustom((prev) => ({ ...prev, [s.id]: next }))
                      }
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-400">
                    {defaultRates.join("% · ")}%
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3 pb-4">
            <Button type="primary" loading={saving} onClick={save}>
              Save
            </Button>
            <span className="text-xs text-gray-400">
              Changes apply to orders placed from now on. Points already awarded
              keep the rate they were earned at.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
