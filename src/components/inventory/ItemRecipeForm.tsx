"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Collapse, message } from "antd";
import {
  computeItemRecipeCost,
  itemRecipeDependencies,
  type ItemRecipe,
} from "@/lib/itemRecipes";
import { formatCurrency, normalizeMaterialName } from "@/lib/rawMaterials";
import type { MenuItemSummary } from "@/lib/menuRecipes";
import { useRecipeComponents } from "@/components/inventory/useRecipeComponents";
import ComponentLinesEditor, {
  toLines,
  type DraftLine,
} from "@/components/inventory/ComponentLinesEditor";

const LIST_PATH = "/inventory-management/setup/item-recipe";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

/** Shared empty set, so an unblocked picker keeps a stable dependency. */
const NOTHING_BLOCKED: ReadonlySet<string> = new Set();

/** One add-on of the menu item this recipe defines, with its own recipe. */
interface AddOnTarget {
  /** Menu item id of the add-on. */
  id: string;
  name: string;
  /** Its existing item recipe, when someone has already mapped it. */
  recipeId: string | null;
}

/**
 * Add/edit form for an item recipe, shared by /new and /[id]/edit.
 *
 * Unlike a production item there are no units, conversion or batch yield —
 * a recipe is a name plus components, and its costing is simply the sum of
 * the component costs.
 *
 * The menu item's add-ons are edited here too. An add-on is a menu item in its
 * own right and an order records it as its own product line, so its components
 * are saved as its OWN item recipe rather than folded into this one — see the
 * add-ons section below.
 */
export default function ItemRecipeForm({
  recipe,
  initialName = "",
}: {
  /** null = create mode. */
  recipe: ItemRecipe | null;
  /** Create mode only: pre-fills the name, e.g. from the menu item being
   *  mapped. Ignored when editing, where the stored name wins. */
  initialName?: string;
}) {
  const router = useRouter();
  const [messageApi, messageContextHolder] = message.useMessage();
  const components = useRecipeComponents();
  const { optionsByKey, costsByKey, itemCostsById, itemLinesById, itemRecipes } =
    components;

  const [name, setName] = useState(recipe?.name ?? initialName);
  const [lines, setLines] = useState<DraftLine[]>(
    recipe?.lines.map((l) => ({
      refType: l.refType,
      refId: l.refId,
      qtyUsed: String(l.qtyUsed),
    })) ?? [],
  );

  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  /** Draft components per add-on, keyed by the add-on's menu item id. */
  const [addOnLines, setAddOnLines] = useState<Record<string, DraftLine[]>>({});

  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inventory/menu-items", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data.success) setMenuItems(data.items ?? []);
      } catch {
        /* the add-ons section simply stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const breakdown = useMemo(
    () => computeItemRecipeCost(toLines(lines), costsByKey, itemCostsById),
    [lines, costsByKey, itemCostsById],
  );

  /** Recipes by the key a menu item resolves to, for finding an add-on's own. */
  const recipeByNameKey = useMemo(
    () =>
      new Map(
        itemRecipes.map((r) => [
          r.nameKey || normalizeMaterialName(r.name),
          r,
        ]),
      ),
    [itemRecipes],
  );

  /**
   * The add-ons of the menu item this recipe is for.
   *
   * Matched by name, the same link the rest of the screen uses — so typing a
   * name on /new brings that item's add-ons into view before it is even saved.
   */
  const addOns = useMemo<AddOnTarget[]>(() => {
    const key = normalizeMaterialName(name);
    if (!key) return [];

    const menuItem = menuItems.find(
      (m) => normalizeMaterialName(m.name) === key,
    );
    if (!menuItem?.addOnIds?.length) return [];

    const byId = new Map(menuItems.map((m) => [String(m._id), m]));
    return menuItem.addOnIds
      .map((id) => byId.get(id))
      .filter((m): m is MenuItemSummary => !!m)
      .map((m) => ({
        id: String(m._id),
        name: m.name,
        recipeId:
          recipeByNameKey.get(normalizeMaterialName(m.name))?._id ?? null,
      }));
  }, [name, menuItems, recipeByNameKey]);

  /**
   * The component graph as this form would leave it: what is stored, with the
   * rows currently on screen standing in for the recipes being edited.
   *
   * The drafts matter because the recipe and its add-ons are saved together. A
   * loop can be assembled out of two panels that are each innocent against
   * stored data alone — put "Extra Jeera Rice" into the plate, then the plate
   * into "Extra Jeera Rice" — and neither picker would see it coming from the
   * stored graph.
   */
  const draftLinesById = useMemo(() => {
    const graph = new Map(itemLinesById);
    if (recipe?._id) graph.set(String(recipe._id), toLines(lines));
    for (const addOn of addOns) {
      if (addOn.recipeId) {
        graph.set(addOn.recipeId, toLines(addOnLines[addOn.id] ?? []));
      }
    }
    return graph;
  }, [itemLinesById, recipe?._id, lines, addOns, addOnLines]);

  /**
   * Per recipe on this screen, the food items it may not be built on: itself,
   * and anything that already leads back to it. Offering one and rejecting it
   * on save would be a worse way to explain the same rule, so they never
   * appear in the picker.
   *
   * A recipe that does not exist yet has nothing blocked — with no id, nothing
   * can point at it, so no chain can come back.
   */
  const blockedByRecipeId = useMemo(() => {
    const targets = [
      ...(recipe?._id ? [String(recipe._id)] : []),
      ...addOns.map((a) => a.recipeId).filter((id): id is string => !!id),
    ];

    const map = new Map<string, ReadonlySet<string>>();
    for (const selfId of targets) {
      const blocked = new Set<string>([selfId]);
      for (const id of draftLinesById.keys()) {
        if (itemRecipeDependencies(id, draftLinesById).has(selfId)) {
          blocked.add(id);
        }
      }
      map.set(selfId, blocked);
    }
    return map;
  }, [draftLinesById, recipe?._id, addOns]);

  const blockedFor = useCallback(
    (id: string | null): ReadonlySet<string> =>
      (id ? blockedByRecipeId.get(id) : undefined) ?? NOTHING_BLOCKED,
    [blockedByRecipeId],
  );

  /**
   * Seed each add-on's rows from its stored recipe, once.
   *
   * Keyed on the add-on id and never overwritten, so a reload of the recipe
   * list mid-edit cannot wipe rows the user has just typed.
   */
  useEffect(() => {
    setAddOnLines((current) => {
      let changed = false;
      const next = { ...current };
      for (const addOn of addOns) {
        if (next[addOn.id]) continue;
        const stored = recipeByNameKey.get(normalizeMaterialName(addOn.name));
        next[addOn.id] =
          stored?.lines.map((l) => ({
            refType: l.refType,
            refId: l.refId,
            qtyUsed: String(l.qtyUsed),
          })) ?? [];
        changed = true;
      }
      return changed ? next : current;
    });
  }, [addOns, recipeByNameKey]);

  const setAddOn = useCallback((id: string, next: DraftLine[]) => {
    setAddOnLines((current) => ({ ...current, [id]: next }));
    setFormError(null);
  }, []);

  const notifyDuplicate = useCallback(
    () => messageApi.info("That component is already in the recipe"),
    [messageApi],
  );

  /** The first row anywhere with a quantity that is blank, junk or ≤ 0. */
  const badQuantity = (draft: DraftLine[]) =>
    draft.find((l) => {
      const q = Number(l.qtyUsed.replace(/,/g, "").trim());
      return !l.qtyUsed.trim() || !Number.isFinite(q) || q <= 0;
    });

  /**
   * The first food-item row counted in part portions.
   *
   * A food item is counted in whole plates — half a portion is its own recipe,
   * not a fraction of this line.
   */
  const fractionalItem = (draft: DraftLine[]) =>
    draft.find(
      (l) =>
        l.refType === "item" &&
        !Number.isInteger(Number(l.qtyUsed.replace(/,/g, "").trim())),
    );

  const labelFor = (line: DraftLine) =>
    optionsByKey.get(`${line.refType}:${line.refId}`)?.name ?? "a row";

  /**
   * Save the recipe, then every add-on that has components.
   *
   * The add-ons go through the bulk endpoint, which re-validates and costs each
   * one exactly as the single-recipe endpoints do. An add-on cleared back to no
   * components has its recipe deleted: an empty recipe cannot be stored, and
   * leaving the old one would keep deducting components nobody still lists.
   */
  const handleSave = async () => {
    setNameError(name.trim() ? null : "Name is required");
    if (!name.trim()) return;

    if (lines.length === 0) {
      setFormError("Add at least one component to the recipe");
      return;
    }

    const bad = badQuantity(lines);
    if (bad) {
      setFormError(`Enter a quantity greater than 0 for ${labelFor(bad)}`);
      return;
    }

    const fractional = fractionalItem(lines);
    if (fractional) {
      setFormError(`${labelFor(fractional)} must be a whole number of portions`);
      return;
    }

    for (const addOn of addOns) {
      const draft = addOnLines[addOn.id] ?? [];
      const badAddOn = badQuantity(draft);
      if (badAddOn) {
        setFormError(
          `Enter a quantity greater than 0 for ${labelFor(badAddOn)} in “${addOn.name}”`,
        );
        return;
      }
      const fractionalAddOn = fractionalItem(draft);
      if (fractionalAddOn) {
        setFormError(
          `${labelFor(fractionalAddOn)} in “${addOn.name}” must be a whole number of portions`,
        );
        return;
      }
    }
    setFormError(null);

    setSaving(true);
    try {
      const res = await fetch(
        recipe?._id
          ? `/api/inventory/item-recipes/${recipe._id}`
          : "/api/inventory/item-recipes",
        {
          method: recipe?._id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            lines: lines.map((l) => ({
              refType: l.refType,
              refId: l.refId,
              qtyUsed: l.qtyUsed,
            })),
          }),
        },
      );
      const data = await res.json();
      if (!data.success) {
        setFormError(data.message ?? "Could not save");
        return;
      }

      const addOnError = await saveAddOns();
      if (addOnError) {
        // The recipe itself is saved; say so rather than implying nothing was.
        setFormError(`Recipe saved, but its add-ons were not: ${addOnError}`);
        return;
      }

      messageApi.success(recipe?._id ? "Item recipe updated" : "Item recipe added");
      window.setTimeout(() => router.push(LIST_PATH), 350);
    } catch {
      setFormError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Writes the add-on recipes. Returns a message on failure, null on success.
   *
   * One request per add-on, through the ordinary single-recipe endpoints
   * rather than the bulk one. Bulk deliberately skips the self/loop check —
   * it serves the importer, where a sheet may be in the middle of breaking an
   * existing loop — and an add-on that can now name a food item needs exactly
   * that check. There are only ever a handful of add-ons on a dish.
   */
  const saveAddOns = async (): Promise<string | null> => {
    for (const addOn of addOns) {
      const draft = addOnLines[addOn.id] ?? [];
      const payload = draft.map((l) => ({
        refType: l.refType,
        refId: l.refId,
        qtyUsed: l.qtyUsed,
      }));

      // Cleared back to nothing: drop the recipe rather than store an empty
      // one, which could not be saved anyway and would keep deducting
      // components nobody still lists.
      if (payload.length === 0) {
        if (!addOn.recipeId) continue;
        const res = await fetch(
          `/api/inventory/item-recipes/${addOn.recipeId}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!data.success) {
          return `“${addOn.name}”: ${data.message ?? "could not be cleared"}`;
        }
        continue;
      }

      const res = await fetch(
        addOn.recipeId
          ? `/api/inventory/item-recipes/${addOn.recipeId}`
          : "/api/inventory/item-recipes",
        {
          method: addOn.recipeId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: addOn.name, lines: payload }),
        },
      );
      const data = await res.json();
      if (!data.success) {
        return `“${addOn.name}”: ${data.message ?? "could not be saved"}`;
      }
    }

    return null;
  };

  return (
    <div>
      {messageContextHolder}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Item details
          </h2>
          <div className="mt-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700">
                Item name
              </span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                placeholder="Dal Thali"
                autoFocus
              />
              {nameError && (
                <span className="mt-1 block text-xs text-red-600">
                  {nameError}
                </span>
              )}
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Costing
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Sum of the components below — not editable.
          </p>
          <div className="mt-4 rounded-lg bg-[#024731]/5 border border-[#024731]/20 px-4 py-3">
            <div className="text-2xl font-bold tabular-nums text-[#024731]">
              {formatCurrency(breakdown.totalCost)}
            </div>
            <div className="mt-0.5 text-xs text-gray-600">
              across {lines.length} component{lines.length === 1 ? "" : "s"}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Components
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Raw materials and production items that make up this recipe — or
            another food item, whose own components are then deducted with it.
          </p>
        </div>

        <div className="mt-4">
          <ComponentLinesEditor
            lines={lines}
            onChange={(next) => {
              setLines(next);
              setFormError(null);
            }}
            components={components}
            allowItems
            blockedItemIds={blockedFor(recipe?._id ? String(recipe._id) : null)}
            onDuplicate={notifyDuplicate}
          />
        </div>
      </section>

      {addOns.length > 0 && (
        <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Add-ons
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Offered with this item on the menu. Each one is ordered as a
              product in its own right, so it carries its own components and is
              deducted separately — not as part of the plate above. When an
              add-on is a portion of a dish you already have a recipe for, add
              that dish as a food item instead of listing its ingredients again.
            </p>
          </div>

          <Collapse
            className="mt-4 bg-white"
            items={addOns.map((addOn) => {
              const draft = addOnLines[addOn.id] ?? [];
              const cost = computeItemRecipeCost(
                toLines(draft),
                costsByKey,
                itemCostsById,
              ).totalCost;

              return {
                key: addOn.id,
                label: (
                  <div className="flex flex-wrap items-center justify-between gap-2 pr-2">
                    <span className="font-medium text-gray-900">
                      {addOn.name}
                    </span>
                    <span className="flex items-center gap-2">
                      {draft.length === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          not mapped
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">
                          {draft.length} component
                          {draft.length === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className="tabular-nums text-sm font-semibold text-[#024731]">
                        {formatCurrency(cost)}
                      </span>
                    </span>
                  </div>
                ),
                children: (
                  <ComponentLinesEditor
                    lines={draft}
                    onChange={(next) => setAddOn(addOn.id, next)}
                    components={components}
                    // An add-on is often a portion of a dish you already have a
                    // recipe for, so it may name a food item — one line, rather
                    // than that dish's ingredients typed out a second time.
                    allowItems
                    blockedItemIds={blockedFor(addOn.recipeId)}
                    onDuplicate={notifyDuplicate}
                    dense
                  />
                ),
              };
            })}
          />
        </section>
      )}

      {formError && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {formError}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push(LIST_PATH)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#1c1c1c] px-5 py-2 text-sm font-medium text-white hover:bg-[#024731] disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : recipe ? "Save changes" : "Add item recipe"}
        </button>
      </div>
    </div>
  );
}
