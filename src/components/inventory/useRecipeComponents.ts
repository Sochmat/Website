"use client";

import { useEffect, useMemo, useState } from "react";
import {
  componentKey,
  itemRecipeCostsById,
  type ComponentType,
  type ItemRecipe,
  type ItemRecipeLine,
  type StockComponentType,
} from "@/lib/itemRecipes";
import {
  toRecipeLines,
  type CostingMaterial,
  type ProductionItem,
} from "@/lib/productionItems";
import type { RawMaterial } from "@/lib/rawMaterials";

/**
 * The unit a food-item line is counted in.
 *
 * An item recipe has no unit of its own — unlike a raw material or a production
 * item it is a definition, not a quantity of something — so the count is of
 * whole plates.
 */
export const ITEM_PORTION_UNIT = "portion";

/** Everything the item-recipe UI needs to know about one selectable component. */
export interface ComponentOption {
  key: string;
  refType: ComponentType;
  refId: string;
  name: string;
  /** Category for a raw material; blank for anything else. */
  categoryName: string;
  consumptionUnit: string;
}

/**
 * A component that holds stock. Narrower on purpose: the production-item form
 * is handed only these, so a food item cannot reach a picker that must not
 * offer one.
 */
export interface StockComponentOption extends Omit<ComponentOption, "refType"> {
  refType: StockComponentType;
}

/**
 * Loads raw materials and production items and presents them as one flat list
 * of selectable components, plus the costing map keyed the same way.
 *
 * Item recipes load too, but stay OUT of `options`: that list is what a
 * production item may be made from, and a production item may never be made
 * from a food item. They come back separately, as `itemOptions`, for the one
 * screen that can use them.
 *
 * Shared by the item-recipe form and its view modal so both resolve names and
 * costs identically.
 */
export function useRecipeComponents() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItem[]>([]);
  const [itemRecipes, setItemRecipes] = useState<ItemRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, pRes, iRes] = await Promise.all([
          fetch("/api/inventory/raw-materials", { cache: "no-store" }),
          fetch("/api/inventory/production-items", { cache: "no-store" }),
          fetch("/api/inventory/item-recipes", { cache: "no-store" }),
        ]);
        const [mData, pData, iData] = await Promise.all([
          mRes.json(),
          pRes.json(),
          iRes.json(),
        ]);
        if (cancelled) return;
        if (mData.success) setMaterials(mData.materials ?? []);
        if (pData.success) setProductionItems(pData.items ?? []);
        if (iData.success) setItemRecipes(iData.recipes ?? []);
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

  const options = useMemo<StockComponentOption[]>(
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

  /** Item recipes as components, for the one form allowed to name them. */
  const itemOptions = useMemo<ComponentOption[]>(
    () =>
      itemRecipes.map((r) => ({
        key: componentKey("item", String(r._id)),
        refType: "item" as const,
        refId: String(r._id),
        name: r.name,
        categoryName: "",
        consumptionUnit: ITEM_PORTION_UNIT,
      })),
    [itemRecipes],
  );

  // Every type is in here, unlike `options` — this is only ever read from, so
  // a screen that cannot offer food items still resolves one it already has.
  const optionsByKey = useMemo(
    () => new Map([...options, ...itemOptions].map((o) => [o.key, o])),
    [options, itemOptions],
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

  /**
   * Every production item's recipe, keyed by id — mirrors
   * productionRecipesById() on the server. The production-item form checks a
   * candidate component against this before offering it, so a recipe that
   * would close a loop is never even selectable.
   */
  const productionRecipesById = useMemo(
    () =>
      new Map(
        productionItems.map((p) => [String(p._id), toRecipeLines(p.recipe)]),
      ),
    [productionItems],
  );

  /**
   * Every item recipe's components, keyed by id — the same graph the server
   * checks loops against, so a recipe that would close one is never offered.
   */
  const itemLinesById = useMemo(
    () =>
      new Map<string, ItemRecipeLine[]>(
        itemRecipes.map((r) => [String(r._id), r.lines]),
      ),
    [itemRecipes],
  );

  /**
   * Each item recipe's settled cost — mirrors itemRecipeCostsById() on the
   * server, so a combo prices in the browser exactly as it will when saved.
   */
  const itemCostsById = useMemo(
    () => itemRecipeCostsById(itemRecipes, costsByKey),
    [itemRecipes, costsByKey],
  );

  return {
    options,
    itemOptions,
    optionsByKey,
    costsByKey,
    itemCostsById,
    itemLinesById,
    /** The recipes themselves, for a screen that needs to find one by name. */
    itemRecipes,
    productionRecipesById,
    loading,
  };
}
