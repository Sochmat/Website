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
 *
 * `reload` matters because the form modal is mounted for the whole life of the
 * page: a spreadsheet import can add units after this hook first ran, and
 * without re-reading, the dropdown would keep serving the list as it stood
 * when the page loaded. Callers refresh when the form opens.
 */
export function useUnits() {
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/units", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setUnits(data.units ?? []);
    } catch {
      // Keep whatever is on screen rather than blanking the dropdowns on a
      // blip; the field is still typeable either way.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  return { units, unitsByKind: byKind, addUnit, reload, loading };
}
