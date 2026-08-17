"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, message } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import ViewItemRecipeModal from "@/components/inventory/ViewItemRecipeModal";
import MenuRecipeTable, {
  confirmDeleteMenuRecipes,
} from "@/components/inventory/MenuRecipeTable";
import type { ItemRecipe } from "@/lib/itemRecipes";
import {
  menuRecipeRows,
  partitionAddOns,
  soldRecipes,
  type MenuItemSummary,
  type MenuRecipeRow,
} from "@/lib/menuRecipes";

const SEARCH_DEBOUNCE_MS = 300;
const RECIPE_PATH = "/inventory-management/setup/item-recipe";

/**
 * Add-ons and the recipes behind them.
 *
 * They were always here — an add-on is a menu item, so it landed in Item
 * Recipe with everything else, under Uncategorised because add-ons carry no
 * category. That heap is what this screen replaces: same records, same form,
 * just the slice of the menu that is only ever sold alongside something else.
 *
 * The recipes themselves live in the same collection and are edited by the
 * same form as any other item recipe — `?from=addons` is all that differs, so
 * saving returns here rather than to the Item Recipe list.
 */
export default function AddonRecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<ItemRecipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [viewing, setViewing] = useState<MenuRecipeRow | null>(null);

  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();

  useEffect(() => {
    const timer = window.setTimeout(
      () => setAppliedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const [rRes, mRes] = await Promise.all([
        fetch("/api/inventory/item-recipes", { cache: "no-store" }),
        fetch("/api/inventory/menu-items", { cache: "no-store" }),
      ]);
      const [rData, mData] = await Promise.all([rRes.json(), mRes.json()]);
      if (rData.success) setRecipes(rData.recipes ?? []);
      if (mData.success) setMenuItems(mData.items ?? []);
    } catch {
      // Leave the previous list on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const term = appliedSearch.trim().toLowerCase();

  const rows = useMemo(() => {
    const { addOns } = partitionAddOns(menuItems);
    const matching = term
      ? addOns.filter((item) => item.name.toLowerCase().includes(term))
      : addOns;
    return menuRecipeRows(matching, recipes);
  }, [menuItems, recipes, term]);

  const totals = useMemo(() => {
    const mapped = rows.filter((r) => r.mapped).length;
    return { mapped, unmapped: rows.length - mapped, total: rows.length };
  }, [rows]);

  /**
   * Where the form lives for this add-on.
   *
   * An add-on with a recipe opens that record; one with none goes to the blank
   * form seeded with its name, so the recipe matches back without anyone
   * retyping it. `from=addons` sends the form's Save and Cancel back here.
   */
  const editHref = (row: MenuRecipeRow) =>
    row.recipe?._id
      ? `${RECIPE_PATH}/${row.recipe._id}/edit?from=addons`
      : `${RECIPE_PATH}/new?from=addons&name=${encodeURIComponent(row.menuItem.name)}`;

  const filtersActive = !!term;

  return (
    <div>
      {modalContextHolder}
      {messageContextHolder}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
            Addons Recipe
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Every add-on from the admin console. An add-on is ordered as a
            product in its own right — a delivered order deducts its components
            just like the dish it was chosen on — so each one needs its own
            recipe here.
          </p>
        </div>
        <button
          onClick={() => router.push(`${RECIPE_PATH}/new?from=addons`)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <PlusOutlined />
          Add Addon Recipe
        </button>
      </div>

      {!loading && totals.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2.5 py-1 font-semibold text-green-700">
            {totals.mapped} mapped
          </span>
          <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
            {totals.unmapped} unmapped
          </span>
          <span className="text-gray-500">
            of {totals.total} add-on{totals.total === 1 ? "" : "s"}
            {filtersActive ? " matching that search" : ""}
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by add-on name…"
            aria-label="Search add-ons by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>
      </div>

      {totals.unmapped > 0 && !loading && (
        <p className="mt-3 text-xs text-amber-800">
          An unmapped add-on deducts nothing when an order is delivered — it is
          recorded against the order as unmapped rather than costed.
        </p>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            Loading add-ons…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center">
            <p className="text-sm font-medium text-gray-900">
              {filtersActive ? "No add-ons match that search" : "No add-ons yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {filtersActive
                ? "Try a different name."
                : "Add them under Menu → Addons in the admin console, then map each one here."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-2">
            <MenuRecipeTable
              rows={rows}
              showAddOnBadge={false}
              onEdit={(row) => router.push(editHref(row))}
              onView={setViewing}
              onDelete={(row) =>
                confirmDeleteMenuRecipes(row, {
                  modal,
                  messageApi,
                  onDone: load,
                  noun: "addon recipe",
                })
              }
            />
          </div>
        )}
      </div>

      <ViewItemRecipeModal
        open={!!viewing}
        item={
          viewing
            ? { name: viewing.menuItem.name, sections: soldRecipes(viewing) }
            : null
        }
        onClose={() => setViewing(null)}
        onEdit={() => viewing && router.push(editHref(viewing))}
      />
    </div>
  );
}
