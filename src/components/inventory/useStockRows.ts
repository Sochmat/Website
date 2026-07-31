"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isBelowAlert,
  pricePerConsumptionUnit,
  type RawMaterial,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";
import type { ProductionItem } from "@/lib/productionItems";
import type { AuditKind } from "@/lib/stockAudits";

/** One line of either collection, flattened to what a stock table needs. */
export interface StockRow {
  key: string;
  id: string;
  kind: AuditKind;
  name: string;
  /** Blank for production items — they have no category. */
  categoryName: string;
  unit: string;
  /** What's currently stored. undefined = never counted. */
  savedStock?: number;
  alertQty: number;
  /**
   * What one consumption unit is worth. 0 when the item has no price or no
   * unit conversion set, which reads as "cannot be valued" rather than "free".
   */
  unitCost: number;
}

/** Parse an edited quantity cell. null = not a usable number. */
export function parseQtyDraft(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function materialRow(m: RawMaterial): StockRow {
  return {
    key: `raw:${m._id}`,
    id: String(m._id),
    kind: "raw",
    name: m.name,
    categoryName: m.categoryName ?? "",
    unit: m.consumptionUnit,
    savedStock: m.currentStock,
    alertQty: m.alertQty,
    unitCost: pricePerConsumptionUnit(m),
  };
}

function itemRow(i: ProductionItem): StockRow {
  return {
    key: `production:${i._id}`,
    id: String(i._id),
    kind: "production",
    name: i.name,
    categoryName: "",
    unit: i.consumptionUnit,
    savedStock: i.currentStock,
    alertQty: i.alertQty ?? 0,
    // A production item's price is derived from its recipe, but it is stored
    // in the same two fields, so the same maths values it.
    unitCost: pricePerConsumptionUnit(i),
  };
}

/**
 * Raw materials and production items, with the filter state the stock screens
 * share.
 *
 * Both the Audit and Add Stock screens are the same table over the same two
 * collections — only the editable column and what a save means differ — so the
 * loading, filtering and post-save fold-in live here rather than twice.
 */
export function useStockRows() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Shared across both tabs, like the search term.
  const [belowAlertOnly, setBelowAlertOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, pRes, cRes] = await Promise.all([
        fetch("/api/inventory/raw-materials", { cache: "no-store" }),
        fetch("/api/inventory/production-items", { cache: "no-store" }),
        fetch("/api/inventory/categories", { cache: "no-store" }),
      ]);
      const [mData, pData, cData] = await Promise.all([
        mRes.json(),
        pRes.json(),
        cRes.json(),
      ]);
      if (mData.success) setMaterials(mData.materials ?? []);
      if (pData.success) setItems(pData.items ?? []);
      if (cData.success) setCategories(cData.categories ?? []);
    } catch {
      // Leave whatever is on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const term = search.trim().toLowerCase();

  const materialRows = useMemo<StockRow[]>(
    () =>
      materials
        .filter((m) => !term || m.name.toLowerCase().includes(term))
        .filter((m) => !categoryId || m.categoryId === categoryId)
        // Filters on the SAVED quantity, not the draft: a row you are part-way
        // through editing must not vanish under the cursor as you type.
        .filter((m) => !belowAlertOnly || isBelowAlert(m.currentStock, m.alertQty))
        .map(materialRow),
    [materials, term, categoryId, belowAlertOnly],
  );

  const itemRows = useMemo<StockRow[]>(
    () =>
      items
        .filter((i) => !term || i.name.toLowerCase().includes(term))
        .filter((i) => !belowAlertOnly || isBelowAlert(i.currentStock, i.alertQty))
        .map(itemRow),
    [items, term, belowAlertOnly],
  );

  /**
   * Every row, unfiltered.
   *
   * Pending edits are tracked against this, not the filtered lists — an entry
   * made before you changed the search must still be saved, not quietly
   * abandoned because it scrolled out of view.
   */
  const allRows = useMemo<StockRow[]>(
    () => [...materials.map(materialRow), ...items.map(itemRow)],
    [materials, items],
  );

  const belowAlertCounts = useMemo(
    () => ({
      raw: materials.filter((m) => isBelowAlert(m.currentStock, m.alertQty))
        .length,
      production: items.filter((i) => isBelowAlert(i.currentStock, i.alertQty))
        .length,
    }),
    [materials, items],
  );

  /**
   * Fold saved quantities into local state, keyed by item id.
   *
   * Lets a screen settle after a save without a refetch, which would wipe
   * anything still being typed on the other tab.
   */
  const applySaved = useCallback(
    (kind: AuditKind, byId: Map<string, number>) => {
      if (kind === "raw") {
        setMaterials((current) =>
          current.map((m) => {
            const next = byId.get(String(m._id));
            return next === undefined ? m : { ...m, currentStock: next };
          }),
        );
      } else {
        setItems((current) =>
          current.map((i) => {
            const next = byId.get(String(i._id));
            return next === undefined ? i : { ...i, currentStock: next };
          }),
        );
      }
    },
    [],
  );

  return {
    loading,
    categories,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    belowAlertOnly,
    setBelowAlertOnly,
    term,
    materialRows,
    itemRows,
    allRows,
    belowAlertCounts,
    applySaved,
  };
}
