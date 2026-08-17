"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Collapse, Modal, message } from "antd";
import {
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import ViewItemRecipeModal from "@/components/inventory/ViewItemRecipeModal";
import RecipeImportModal from "@/components/inventory/RecipeImportModal";
import MenuRecipeTable, {
  confirmDeleteMenuRecipes,
} from "@/components/inventory/MenuRecipeTable";
import type { ItemRecipe } from "@/lib/itemRecipes";
import {
  groupMenuItems,
  orphanRecipes,
  partitionAddOns,
  soldRecipes,
  type MenuItemSummary,
  type MenuRecipeRow,
} from "@/lib/menuRecipes";

const SEARCH_DEBOUNCE_MS = 300;
const BASE_PATH = "/inventory-management/setup/item-recipe";

/** Recipes with no menu item behind them ride in the same table shape. */
function orphanRow(recipe: ItemRecipe): MenuRecipeRow {
  return {
    menuItem: {
      _id: `orphan:${recipe._id}`,
      name: recipe.name,
      categoryId: "",
      categoryName: "",
      type: "",
      hidden: false,
    },
    recipe,
    // A loose recipe is reached by name alone, so it has no sizes to offer.
    variants: [],
    mapped: recipe.lines.length > 0,
  };
}

/**
 * Where the form lives for this item.
 *
 * An item with a base recipe opens that record. One defined only by its sizes
 * has no record to open, so it goes to the blank form seeded with its name —
 * which loads the sizes already written and saves back onto them, rather than
 * starting over.
 */
function editHref(row: MenuRecipeRow): string {
  return row.recipe?._id
    ? `${BASE_PATH}/${row.recipe._id}/edit`
    : `${BASE_PATH}/new?name=${encodeURIComponent(row.menuItem.name)}`;
}

export default function ItemRecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<ItemRecipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  // A Category.id, or "" for all of them. Narrows the list to one section
  // without collapsing the rest away by hand.
  const [category, setCategory] = useState("");
  // The whole row, not one recipe: an item sold in sizes is read size by size.
  const [viewing, setViewing] = useState<MenuRecipeRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();

  useEffect(() => {
    const timer = window.setTimeout(
      () => setAppliedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  /**
   * Both lists, unfiltered.
   *
   * The search filters in the browser here, unlike the flat list this screen
   * used to be: a menu item with no recipe has nothing for the recipes
   * endpoint to match on, so server-side search would hide exactly the rows
   * this view exists to surface.
   */
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

  // Add-ons are listed on the Addons Recipe screen instead: they carry no
  // category, so every one of them landed in a single Uncategorised heap here.
  // Same records and the same form either way — only which screen lists them.
  const dishes = useMemo(() => partitionAddOns(menuItems).dishes, [menuItems]);

  // Built from every dish, not the filtered set: options that vanish while you
  // type would make the control unusable. Keyed by category id, which is what
  // a menu item actually stores.
  const categoryOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const item of dishes) {
      if (item.categoryId && !byId.has(item.categoryId)) {
        byId.set(item.categoryId, item.categoryName || item.categoryId);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dishes]);

  const groups = useMemo(() => {
    let matching = dishes;
    if (category) matching = matching.filter((i) => i.categoryId === category);
    if (term)
      matching = matching.filter((item) =>
        item.name.toLowerCase().includes(term),
      );
    return groupMenuItems(matching, recipes);
  }, [dishes, recipes, term, category]);

  // Against the whole menu, add-ons included: a recipe whose item moved to the
  // Addons screen is still on the menu, and calling it orphaned would list it
  // twice over.
  const orphans = useMemo(() => {
    // A loose recipe belongs to no category, so picking one excludes them all.
    if (category) return [];
    const loose = orphanRecipes(menuItems, recipes);
    return (term
      ? loose.filter((r) => r.name.toLowerCase().includes(term))
      : loose
    ).map(orphanRow);
  }, [menuItems, recipes, term, category]);

  const totals = useMemo(() => {
    const mapped = groups.reduce((sum, g) => sum + g.mapped, 0);
    const unmapped = groups.reduce((sum, g) => sum + g.unmapped, 0);
    return { mapped, unmapped, total: mapped + unmapped };
  }, [groups]);

  /** Exports whatever the current search selects; unfiltered exports all. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const query = appliedSearch.trim()
        ? `?search=${encodeURIComponent(appliedSearch.trim())}`
        : "";
      const res = await fetch(`/api/inventory/item-recipes/export${query}`);
      if (!res.ok) {
        messageApi.error("Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `item-recipes-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      messageApi.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImported = (text: string) => {
    setImportOpen(false);
    messageApi.success(`Import complete — ${text}`);
    load();
  };

  const renderTable = (rows: MenuRecipeRow[]) => (
    <MenuRecipeTable
      rows={rows}
      onEdit={(row) => router.push(editHref(row))}
      onView={setViewing}
      onDelete={(row) =>
        confirmDeleteMenuRecipes(row, {
          modal,
          messageApi,
          onDone: load,
          noun: "item recipe",
        })
      }
    />
  );

  const filtersActive = !!term || !!category;

  return (
    <div>
      {modalContextHolder}
      {messageContextHolder}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
            Item Recipe
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Every menu item from the admin console, by category. Mapped means
            the item has a recipe listing the raw materials and production items
            it is made of; costing is calculated from those components. Add-ons
            live under{" "}
            <a
              href="/inventory-management/setup/addon-recipe"
              className="font-medium text-[#024731] underline underline-offset-2"
            >
              Addons Recipe
            </a>
            .
          </p>
        </div>
        <button
          onClick={() => router.push(`${BASE_PATH}/new`)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <PlusOutlined />
          Add Item Recipe
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
            of {totals.total} menu item{totals.total === 1 ? "" : "s"}
            {filtersActive ? " matching these filters" : ""}
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item name…"
            aria-label="Search menu items by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
        >
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {filtersActive && (
          <button
            onClick={() => {
              setSearch("");
              setCategory("");
            }}
            className="text-sm font-medium text-[#f56215] hover:underline"
          >
            Clear filters
          </button>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          <DownloadOutlined />
          {exporting ? "Preparing…" : "Download Excel"}
        </button>

        <button
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <UploadOutlined />
          Upload Excel
        </button>
      </div>

      {filtersActive && !loading && (
        <p className="mt-3 text-xs text-gray-500">
          Download Excel exports the recipes matching this search, not the menu
          {category
            ? " — and it ignores the category, which lives on the menu item rather than the recipe"
            : ""}
          .
        </p>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            Loading menu…
          </div>
        ) : groups.length === 0 && orphans.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center">
            <p className="text-sm font-medium text-gray-900">
              {filtersActive
                ? "No menu items match these filters"
                : "No menu items yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {filtersActive
                ? "Try a different name, or another category."
                : "Add items under Menu in the admin console, then map each one here."}
            </p>
          </div>
        ) : (
          <Collapse
            // Everything open by default: the point of the screen is seeing at
            // a glance what is still unmapped, which a collapsed list hides.
            defaultActiveKey={[
              ...groups.map((g) => g.categoryId || g.categoryName),
              "orphans",
            ]}
            items={[
              ...groups.map((group) => ({
                key: group.categoryId || group.categoryName,
                label: (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {group.categoryName}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {group.rows.length}
                    </span>
                    {group.mapped > 0 && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        {group.mapped} mapped
                      </span>
                    )}
                    {group.unmapped > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {group.unmapped} unmapped
                      </span>
                    )}
                  </span>
                ),
                children: renderTable(group.rows),
              })),
              // Recipes whose menu item was renamed or removed. Listed so they
              // stay reachable instead of vanishing from a menu-shaped view.
              ...(orphans.length > 0
                ? [
                    {
                      key: "orphans",
                      label: (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            Not on the menu
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {orphans.length}
                          </span>
                          <span className="text-xs font-normal text-gray-500">
                            recipes with no matching menu item
                          </span>
                        </span>
                      ),
                      children: renderTable(orphans),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>

      <ViewItemRecipeModal
        open={!!viewing}
        item={
          viewing
            ? {
                name: viewing.menuItem.name,
                sections: soldRecipes(viewing),
              }
            : null
        }
        onClose={() => setViewing(null)}
        onEdit={() => viewing && router.push(editHref(viewing))}
      />

      <RecipeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCommitted={handleImported}
        resource="item-recipes"
        title="Upload item recipes"
        noun="item recipe"
      />
    </div>
  );
}
