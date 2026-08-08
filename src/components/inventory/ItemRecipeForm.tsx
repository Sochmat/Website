"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Collapse, message } from "antd";
import {
  computeItemRecipeCost,
  itemRecipeDependencies,
  type ItemRecipe,
  type ItemRecipeLine,
} from "@/lib/itemRecipes";
import { formatCurrency, normalizeMaterialName } from "@/lib/rawMaterials";
import { recipeLookupKey, type MenuItemSummary } from "@/lib/menuRecipes";
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

/** Stored lines as the editor holds them — quantities are typed, so strings. */
function toDraft(lines: ItemRecipeLine[] | undefined): DraftLine[] {
  return (lines ?? []).map((l) => ({
    refType: l.refType,
    refId: l.refId,
    qtyUsed: String(l.qtyUsed),
  }));
}

/** Draft rows as the API takes them. */
function toPayload(draft: DraftLine[]) {
  return draft.map((l) => ({
    refType: l.refType,
    refId: l.refId,
    qtyUsed: l.qtyUsed,
  }));
}

/** One figure when every size agrees, a span when they do not. */
function costLabel(costs: number[]): string {
  if (costs.length === 0) return formatCurrency(0);
  const low = Math.min(...costs);
  const high = Math.max(...costs);
  return low === high
    ? formatCurrency(low)
    : `${formatCurrency(low)} – ${formatCurrency(high)}`;
}

/** One variant of this menu item, with the recipe that sizes it. */
interface VariantTarget {
  name: string;
  /** Its own recipe, when someone has already mapped this size. */
  recipeId: string | null;
  /** Whether that recipe exists — a variant with none falls back to the base. */
  mapped: boolean;
}

/**
 * Add/edit form for an item recipe, shared by /new and /[id]/edit.
 *
 * Unlike a production item there are no units, conversion or batch yield —
 * a recipe is a name plus components, and its costing is simply the sum of
 * the component costs.
 *
 * An add-on is a menu item in its own right and an order records it as its own
 * product line, so it carries its own item recipe and is mapped from its own
 * row on the list — never from the dish that offers it.
 *
 * Packaging is edited here too. It is not part of the food cost, so it is
 * priced on its own; it IS consumed per portion, so it is deducted alongside
 * the components — see recipeDemand.ts.
 *
 * An item sold in sizes packs per size, next to that size's components: a
 * Large does not go out in the Small's box, and the two are stocked as
 * different materials. An item with no sizes keeps one list, as before.
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
  const [lines, setLines] = useState<DraftLine[]>(toDraft(recipe?.lines));

  /** The item's own packaging; used only when it is sold in no sizes. */
  const [packaging, setPackaging] = useState<DraftLine[]>(
    toDraft(recipe?.packagingLines),
  );

  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  /** Draft components per variant, keyed by the variant's label. */
  const [variantLines, setVariantLines] = useState<Record<string, DraftLine[]>>(
    {},
  );
  /** The same, for what each size is packed in. */
  const [variantPackaging, setVariantPackaging] = useState<
    Record<string, DraftLine[]>
  >({});

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
        /* the variants section simply stays empty */
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

  /** Recipes by (name, variant), for finding the one that sizes a variant. */
  const recipeByLookupKey = useMemo(
    () =>
      new Map(
        itemRecipes.map((r) => [
          recipeLookupKey(
            r.nameKey || normalizeMaterialName(r.name),
            r.variantKey ||
              (r.variantName ? normalizeMaterialName(r.variantName) : ""),
          ),
          r,
        ]),
      ),
    [itemRecipes],
  );

  /** The variants of the menu item this recipe is for, matched by name. */
  const variants = useMemo<VariantTarget[]>(() => {
    const key = normalizeMaterialName(name);
    if (!key) return [];

    const menuItem = menuItems.find(
      (m) => normalizeMaterialName(m.name) === key,
    );
    return (menuItem?.variantNames ?? []).map((label) => {
      const own = recipeByLookupKey.get(
        recipeLookupKey(key, normalizeMaterialName(label)),
      );
      return {
        name: label,
        recipeId: own?._id ?? null,
        mapped: !!own,
      };
    });
  }, [name, menuItems, recipeByLookupKey]);

  /** An item with sizes is defined by them, not by a list of its own. */
  const hasVariants = variants.length > 0;

  /**
   * Seed the variants that already have a recipe of their own, once.
   *
   * Components and packaging both, from the same stored record — each size is
   * one recipe, and reading half of it here would leave the other half looking
   * unwritten.
   *
   * A variant with no recipe is deliberately left out of state: its absence is
   * what "this size follows the item's components" means, both on screen and
   * at deduction time.
   */
  useEffect(() => {
    const storedFor = (variant: VariantTarget) =>
      recipeByLookupKey.get(
        recipeLookupKey(
          normalizeMaterialName(name),
          normalizeMaterialName(variant.name),
        ),
      );

    const seed = (
      pick: (recipe: ItemRecipe | undefined) => ItemRecipeLine[] | undefined,
    ) =>
      (current: Record<string, DraftLine[]>) => {
        let changed = false;
        const next = { ...current };
        for (const variant of variants) {
          if (!variant.mapped || next[variant.name]) continue;
          next[variant.name] = toDraft(pick(storedFor(variant)));
          changed = true;
        }
        return changed ? next : current;
      };

    setVariantLines(seed((stored) => stored?.lines));
    setVariantPackaging(seed((stored) => stored?.packagingLines));
  }, [variants, recipeByLookupKey, name]);

  const changePackaging = useCallback((next: DraftLine[]) => {
    setPackaging(next);
    setFormError(null);
  }, []);

  const packagingBreakdown = useMemo(
    () => computeItemRecipeCost(toLines(packaging), costsByKey),
    [packaging, costsByKey],
  );

  /**
   * The component graph as this form would leave it: what is stored, with the
   * rows currently on screen standing in for the recipe being edited.
   *
   * The draft matters because a loop can be assembled out of rows that are
   * innocent against stored data alone — put a food item into this recipe here,
   * having just pointed that item at this one, and the stored graph would not
   * yet show the chain coming back.
   */
  const draftLinesById = useMemo(() => {
    const graph = new Map(itemLinesById);
    if (recipe?._id) graph.set(String(recipe._id), toLines(lines));
    return graph;
  }, [itemLinesById, recipe?._id, lines]);

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
    const targets = recipe?._id ? [String(recipe._id)] : [];

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
  }, [draftLinesById, recipe?._id]);

  const blockedFor = useCallback(
    (id: string | null): ReadonlySet<string> =>
      (id ? blockedByRecipeId.get(id) : undefined) ?? NOTHING_BLOCKED,
    [blockedByRecipeId],
  );

  /**
   * The rows a size that nobody has mapped starts from: whatever the first
   * mapped size says.
   *
   * This is the whole point of mapping one size and moving on — the second and
   * third open already filled in, needing only their quantities changed rather
   * than the entire list typed again.
   */
  const prefillLines = useMemo(() => {
    for (const variant of variants) {
      const own = variantLines[variant.name];
      if (own?.length) return own;
    }
    return [] as DraftLine[];
  }, [variants, variantLines]);

  /** The same for packaging: sizes usually pack alike, differing in one box. */
  const prefillPackaging = useMemo(() => {
    for (const variant of variants) {
      const own = variantPackaging[variant.name];
      if (own?.length) return own;
    }
    return [] as DraftLine[];
  }, [variants, variantPackaging]);

  /** A size's rows: its own where it has them, the first mapped size's copy
   *  otherwise. */
  const variantDraft = useCallback(
    (variant: VariantTarget): DraftLine[] =>
      variantLines[variant.name] ?? prefillLines,
    [variantLines, prefillLines],
  );

  const variantPackagingDraft = useCallback(
    (variant: VariantTarget): DraftLine[] =>
      variantPackaging[variant.name] ?? prefillPackaging,
    [variantPackaging, prefillPackaging],
  );

  const setVariant = useCallback((label: string, next: DraftLine[]) => {
    setVariantLines((current) => ({ ...current, [label]: next }));
    setFormError(null);
  }, []);

  const setVariantPack = useCallback((label: string, next: DraftLine[]) => {
    setVariantPackaging((current) => ({ ...current, [label]: next }));
    setFormError(null);
  }, []);

  /**
   * What a variant item costs: one figure when every size comes to the same,
   * a range otherwise. A single total would have to pick a size and not say
   * which.
   */
  const variantCostLabel = useMemo(
    () =>
      costLabel(
        variants.map(
          (v) =>
            computeItemRecipeCost(
              toLines(variantDraft(v)),
              costsByKey,
              itemCostsById,
            ).totalCost,
        ),
      ),
    [variants, variantDraft, costsByKey, itemCostsById],
  );

  /** The same for what the sizes are packed in — raw materials, so no items. */
  const variantPackagingLabel = useMemo(
    () =>
      costLabel(
        variants.map(
          (v) =>
            computeItemRecipeCost(toLines(variantPackagingDraft(v)), costsByKey)
              .totalCost,
        ),
      ),
    [variants, variantPackagingDraft, costsByKey],
  );

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

  /** Save the recipe, then every variant that has components. */
  const handleSave = async () => {
    setNameError(name.trim() ? null : "Name is required");
    if (!name.trim()) return;

    // An item with sizes is defined BY its sizes — there is no item-level list
    // to fill in, so the requirement moves onto them.
    if (hasVariants) {
      if (!variants.some((v) => variantDraft(v).length > 0)) {
        setFormError("Add components to at least one variant");
        return;
      }
    } else if (lines.length === 0) {
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

    for (const variant of variants) {
      const draft = variantDraft(variant);
      const badVariant = badQuantity(draft);
      if (badVariant) {
        setFormError(
          `Enter a quantity greater than 0 for ${labelFor(badVariant)} in “${variant.name}”`,
        );
        return;
      }
      const fractionalVariant = fractionalItem(draft);
      if (fractionalVariant) {
        setFormError(
          `${labelFor(fractionalVariant)} in “${variant.name}” must be a whole number of portions`,
        );
        return;
      }
      const badVariantPack = badQuantity(variantPackagingDraft(variant));
      if (badVariantPack) {
        setFormError(
          `Enter a quantity greater than 0 for ${labelFor(badVariantPack)} in “${variant.name}” packaging`,
        );
        return;
      }
    }

    // The item-level list only exists for an item with no sizes; one with them
    // packs per size, and those were just checked above.
    const badPackaging = hasVariants ? undefined : badQuantity(packaging);
    if (badPackaging) {
      setFormError(
        `Enter a quantity greater than 0 for ${labelFor(badPackaging)} in packaging`,
      );
      return;
    }
    setFormError(null);

    setSaving(true);
    try {
      // An item defined by its sizes has no item-level list to write. One
      // written before the item had sizes is left exactly as it is: it still
      // stands behind any size nobody has mapped, and silently rewriting or
      // dropping it here would change what those sizes deduct.
      if (lines.length > 0) {
        const res = await fetch(
          recipe?._id
            ? `/api/inventory/item-recipes/${recipe._id}`
            : "/api/inventory/item-recipes",
          {
            method: recipe?._id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              lines: toPayload(lines),
              // An item with sizes packs per size, so its base recipe's own
              // packaging is left exactly as stored — the key absent is how
              // the API is told this says nothing about it. Sent otherwise,
              // empty included, because an empty list is how it gets cleared.
              ...(hasVariants ? {} : { packagingLines: toPayload(packaging) }),
            }),
          },
        );
        const data = await res.json();
        if (!data.success) {
          setFormError(data.message ?? "Could not save");
          return;
        }
      }

      const variantError = await saveVariants();
      if (variantError) {
        // The recipe itself is saved; say so rather than implying nothing was.
        setFormError(`Recipe saved, but its variants were not: ${variantError}`);
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
   * Writes a recipe for every size that has components.
   *
   * A size showing a copy of another is written too, not just the one that was
   * typed — the copy is what the screen promises that size is made of, and a
   * size with no recipe of its own deducts nothing.
   */
  const saveVariants = async (): Promise<string | null> => {
    for (const variant of variants) {
      const draft = variantDraft(variant);
      if (draft.length === 0 && !variant.recipeId) continue;

      const payload = toPayload(draft);

      // Cleared out: drop the recipe rather than store an empty one. Its
      // packaging goes with it — packaging alone is not a recipe.
      if (payload.length === 0) {
        if (!variant.recipeId) continue;
        const res = await fetch(
          `/api/inventory/item-recipes/${variant.recipeId}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!data.success) {
          return `“${variant.name}”: ${data.message ?? "could not be cleared"}`;
        }
        continue;
      }

      const res = await fetch(
        variant.recipeId
          ? `/api/inventory/item-recipes/${variant.recipeId}`
          : "/api/inventory/item-recipes",
        {
          method: variant.recipeId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            variantName: variant.name,
            lines: payload,
            // This size's own box — a Large does not go out in the Small's,
            // and a sale deducts from whichever recipe it resolved to.
            packagingLines: toPayload(variantPackagingDraft(variant)),
          }),
        },
      );
      const data = await res.json();
      if (!data.success) {
        return `“${variant.name}”: ${data.message ?? "could not be saved"}`;
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
              {hasVariants ? variantCostLabel : formatCurrency(breakdown.totalCost)}
            </div>
            <div className="mt-0.5 text-xs text-gray-600">
              {hasVariants
                ? `across ${variants.length} variant${variants.length === 1 ? "" : "s"}`
                : `across ${lines.length} component${lines.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {/* Packaging is not food cost, so it is quoted beside the figure
              above rather than folded into it — a food-cost percentage that
              silently included boxes would not be one. */}
          <div className="mt-3 flex items-baseline justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
            <span className="text-xs font-medium text-gray-600">
              Packaging
              <span className="ml-1 text-gray-400">
                {hasVariants
                  ? "(per variant)"
                  : `(${packaging.length} material${packaging.length === 1 ? "" : "s"})`}
              </span>
            </span>
            <span className="tabular-nums text-sm font-semibold text-gray-900">
              {hasVariants
                ? variantPackagingLabel
                : formatCurrency(packagingBreakdown.totalCost)}
            </span>
          </div>
        </section>
      </div>

      {/* An item is defined either by one list of components or by its sizes,
          never by both — an empty Components table above a full set of
          variants only invites the question of which one counts. */}
      {!hasVariants && (
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
              blockedItemIds={blockedFor(
                recipe?._id ? String(recipe._id) : null,
              )}
              onDuplicate={notifyDuplicate}
            />
          </div>
        </section>
      )}

      {hasVariants && (
        <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Variants
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              This item is ordered as one of these, so each carries its own
              components and its own packaging. Map the first and the rest open
              already filled in with a copy of it — change what differs.
            </p>
            {lines.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                This item also has a recipe of its own, written before it had
                variants. It is left untouched, and still stands behind any
                variant with no components below.
              </p>
            )}
          </div>

          <Collapse
            className="mt-4 bg-white"
            items={variants.map((variant) => {
              const draft = variantDraft(variant);
              const pack = variantPackagingDraft(variant);
              // Showing a copy of another size, which saving will make its own.
              const copied = !variantLines[variant.name] && draft.length > 0;
              const cost = computeItemRecipeCost(
                toLines(draft),
                costsByKey,
                itemCostsById,
              ).totalCost;
              const packCost = computeItemRecipeCost(
                toLines(pack),
                costsByKey,
              ).totalCost;

              return {
                key: variant.name,
                label: (
                  <div className="flex flex-wrap items-center justify-between gap-2 pr-2">
                    <span className="font-medium text-gray-900">
                      {variant.name}
                    </span>
                    <span className="flex items-center gap-2">
                      {draft.length === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          not mapped
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">
                          {copied ? "copied · " : ""}
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
                  <div>
                    {copied && (
                      <p className="mb-3 text-xs text-gray-500">
                        Copied from the first variant you mapped. Change what
                        differs — saving gives this variant its own recipe.
                      </p>
                    )}
                    <ComponentLinesEditor
                      lines={draft}
                      onChange={(next) => setVariant(variant.name, next)}
                      components={components}
                      allowItems
                      blockedItemIds={blockedFor(variant.recipeId)}
                      onDuplicate={notifyDuplicate}
                      dense
                    />

                    {/* This size's own box. Kept inside the panel rather than
                        in one list below, because a Large goes out in a bigger
                        container than a Small and the two are stocked apart. */}
                    <div className="mt-5 border-t border-gray-200 pt-4">
                      <div className="mb-3 flex items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Packaging
                        </h3>
                        <span className="tabular-nums text-xs font-semibold text-gray-700">
                          {formatCurrency(packCost)}
                        </span>
                      </div>
                      <ComponentLinesEditor
                        lines={pack}
                        onChange={(next) => setVariantPack(variant.name, next)}
                        components={components}
                        allowItems={false}
                        allowProduction={false}
                        noun="Packaging material"
                        onDuplicate={() =>
                          messageApi.info(
                            "That material is already in the packaging",
                          )
                        }
                        dense
                      />
                    </div>
                  </div>
                ),
              };
            })}
          />
        </section>
      )}

      {/* Only for an item with no sizes. One with them packs per size, up in
          the Variants section — a list down here as well would leave two
          answers to the same question. */}
      {!hasVariants && (
      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Packaging
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            What this item is packed in — containers, lids, bags, cutlery. Raw
            materials only, since packaging is bought rather than cooked. It is
            deducted per portion sold like any component, but kept out of the
            costing above: this is packaging cost, not food cost.
          </p>
        </div>

        <div className="mt-4">
          <ComponentLinesEditor
            lines={packaging}
            onChange={changePackaging}
            components={components}
            allowItems={false}
            allowProduction={false}
            noun="Packaging material"
            onDuplicate={() =>
              messageApi.info("That material is already in the packaging")
            }
          />
        </div>
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
