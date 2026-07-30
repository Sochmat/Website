"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryUnit, UnitKind } from "@/lib/rawMaterials";

/**
 * The unit lists behind the two unit dropdowns, plus adding to them.
 *
 * One fetch serves both kinds — the raw-material form shows them side by side,
 * and a unit added in one must appear in the other's list the moment it is
 * relevant. New units are folded into local state rather than refetched, so
 * the dropdown you are standing in does not flicker.
 */
export function useUnits() {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inventory/units", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.success) setUnits(data.units ?? []);
      } catch {
        // The dropdowns simply stay empty; the field is still typeable.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byKind = useMemo(
    () => ({
      consumption: units
        .filter((u) => u.kind === "consumption")
        .map((u) => u.name),
      purchase: units.filter((u) => u.kind === "purchase").map((u) => u.name),
    }),
    [units],
  );

  /**
   * Add a unit and keep it. Returns the server's message on failure rather
   * than throwing, so the field that asked can show it inline.
   */
  const addUnit = useCallback(
    async (name: string, kind: UnitKind): Promise<{ error?: string }> => {
      try {
        const res = await fetch("/api/inventory/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, kind }),
        });
        const data = await res.json();
        if (!data.success) return { error: data.message ?? "Could not add unit" };

        setUnits((current) =>
          [...current, data.unit as InventoryUnit].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
        return {};
      } catch {
        return { error: "Network error — please try again" };
      }
    },
    [],
  );

  return { units, unitsByKind: byKind, addUnit, loading };
}
