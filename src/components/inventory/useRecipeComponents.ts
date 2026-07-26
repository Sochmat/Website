"use client";

import { useEffect, useMemo, useState } from "react";
import {
  componentKey,
  type ComponentType,
} from "@/lib/itemRecipes";
import type { CostingMaterial, ProductionItem } from "@/lib/productionItems";
import type { RawMaterial } from "@/lib/rawMaterials";

/** Everything the item-recipe UI needs to know about one selectable component. */
export interface ComponentOption {
  key: string;
  refType: ComponentType;
  refId: string;
  name: string;
  /** Category for a raw material; blank for a production item. */
  categoryName: string;
  consumptionUnit: string;
}

/**
 * Loads raw materials and production items and presents them as one flat list
 * of selectable components, plus the costing map keyed the same way.
 *
 * Shared by the item-recipe form and its view modal so both resolve names and
 * costs identically.
 */
export function useRecipeComponents() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          fetch("/api/inventory/raw-materials", { cache: "no-store" }),
          fetch("/api/inventory/production-items", { cache: "no-store" }),
        ]);
        const [mData, pData] = await Promise.all([mRes.json(), pRes.json()]);
        if (cancelled) return;
        if (mData.success) setMaterials(mData.materials ?? []);
        if (pData.success) setProductionItems(pData.items ?? []);
      } catch {
        /* the picker simply stays empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo<ComponentOption[]>(
    () => [
      ...materials.map((m) => ({
        key: componentKey("raw", String(m._id)),
        refType: "raw" as const,
        refId: String(m._id),
        name: m.name,
        categoryName: m.categoryName ?? "",
        consumptionUnit: m.consumptionUnit,
      })),
      ...productionItems.map((p) => ({
        key: componentKey("production", String(p._id)),
        refType: "production" as const,
        refId: String(p._id),
        name: p.name,
        categoryName: "",
        consumptionUnit: p.consumptionUnit,
      })),
    ],
    [materials, productionItems],
  );

  const optionsByKey = useMemo(
    () => new Map(options.map((o) => [o.key, o])),
    [options],
  );

  /** Mirrors componentCostsByKey() on the server. */
  const costsByKey = useMemo<Map<string, CostingMaterial>>(() => {
    const map = new Map<string, CostingMaterial>();
    for (const m of materials) {
      map.set(componentKey("raw", String(m._id)), {
        pricePerPurchaseUnit: m.pricePerPurchaseUnit,
        unitConversion: m.unitConversion,
      });
    }
    for (const p of productionItems) {
      map.set(componentKey("production", String(p._id)), {
        pricePerPurchaseUnit: p.pricePerPurchaseUnit,
        unitConversion: p.unitConversion,
      });
    }
    return map;
  }, [materials, productionItems]);

  return { options, optionsByKey, costsByKey, loading };
}
