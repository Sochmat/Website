"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch, message } from "antd";
import type { LocationAvailability } from "@/lib/locationAvailability";

interface LocationRow {
  id: string;
  label: string;
}

/**
 * Per-location store and delivery switches.
 *
 * These only ever close a location. The global Store ON/OFF button and the
 * weekly schedule still decide whether anything is open at all — switching a
 * location on cannot reopen a globally closed store, which is why the copy
 * says "when the store is open".
 *
 * Each toggle saves on change rather than behind a Save button: these are the
 * controls someone reaches for when one society needs shutting *now*, and an
 * unsaved switch would be a silent failure at exactly the wrong moment.
 */
export default function LocationAvailabilityCard() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [availability, setAvailability] = useState<LocationAvailability>({
    store: {},
    delivery: {},
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const applyData = useCallback(
    (data: { availability: LocationAvailability; locations: LocationRow[] }) => {
      setAvailability(data.availability);
      setLocations(data.locations);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/location-availability", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.success) applyData(data);
      } catch {
        /* ignore — the card renders empty and the page still works */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyData]);

  const toggle = async (
    kind: "store" | "delivery",
    id: string,
    value: boolean,
  ) => {
    const previous = availability;
    const next: LocationAvailability = {
      store: { ...availability.store },
      delivery: { ...availability.delivery },
    };
    // Only `false` is stored; `true` is the default, so switching back on
    // removes the entry rather than writing a redundant one.
    if (value) delete next[kind][id];
    else next[kind][id] = false;

    setAvailability(next); // optimistic
    setSavingKey(`${kind}:${id}`);
    try {
      const res = await fetch("/api/admin/location-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (data?.success) {
        if (data.availability) setAvailability(data.availability);
      } else {
        setAvailability(previous);
        message.error(data?.message ?? "Failed to save");
      }
    } catch {
      setAvailability(previous);
      message.error("Failed to save");
    }
    setSavingKey(null);
  };

  return (
    <div className="mt-8 rounded-xl border border-gray-200 p-4">
      <h2 className="text-[#111] font-semibold">Locations</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Turn ordering or delivery off for a single location. These only close —
        when the store is closed globally, or outside its hours, every location
        is closed regardless of what is set here.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-gray-400">No locations configured.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 text-xs text-gray-400 uppercase tracking-wide">
            <span className="flex-1">Location</span>
            <span className="w-16 text-center">Store</span>
            <span className="w-16 text-center">Delivery</span>
          </div>
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center gap-4 border-t border-gray-100 pt-3"
            >
              <span className="flex-1 text-sm text-[#111]">{loc.label}</span>
              <span className="w-16 flex justify-center">
                <Switch
                  size="small"
                  checked={availability.store[loc.id] !== false}
                  loading={savingKey === `store:${loc.id}`}
                  onChange={(v) => toggle("store", loc.id, v)}
                  aria-label={`Ordering at ${loc.label}`}
                />
              </span>
              <span className="w-16 flex justify-center">
                <Switch
                  size="small"
                  checked={availability.delivery[loc.id] !== false}
                  loading={savingKey === `delivery:${loc.id}`}
                  onChange={(v) => toggle("delivery", loc.id, v)}
                  aria-label={`Delivery at ${loc.label}`}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
