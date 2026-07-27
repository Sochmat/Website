"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Collapse, Modal, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import ViewItemRecipeModal from "@/components/inventory/ViewItemRecipeModal";
import RecipeImportModal from "@/components/inventory/RecipeImportModal";
import type { ItemRecipe } from "@/lib/itemRecipes";
import {
  groupMenuItems,
  orphanRecipes,
  type MenuItemSummary,
  type MenuRecipeRow,
} from "@/lib/menuRecipes";
import { formatCurrency } from "@/lib/rawMaterials";

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
    mapped: recipe.lines.length > 0,
  };
}

export default function ItemRecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<ItemRecipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [viewing, setViewing] = useState<ItemRecipe | null>(null);
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

  const groups = useMemo(() => {
    const matching = term
      ? menuItems.filter((item) => item.name.toLowerCase().includes(term))
      : menuItems;
    return groupMenuItems(matching, recipes);
  }, [menuItems, recipes, term]);

  const orphans = useMemo(() => {
    const loose = orphanRecipes(menuItems, recipes);
    return (term
      ? loose.filter((r) => r.name.toLowerCase().includes(term))
      : loose
    ).map(orphanRow);
  }, [menuItems, recipes, term]);

  const totals = useMemo(() => {
    const mapped = groups.reduce((sum, g) => sum + g.mapped, 0);
    const unmapped = groups.reduce((sum, g) => sum + g.unmapped, 0);
    return { mapped, unmapped, total: mapped + unmapped };
  }, [groups]);

  const handleDelete = (recipe: ItemRecipe) => {
    modal.confirm({
      title: "Delete this item recipe?",
      content: (
        <span>
          <strong>{recipe.name}</strong> and its components will be removed
          permanently. The menu item itself is untouched.
        </span>
      ),
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/inventory/item-recipes/${recipe._id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!data.success) {
            messageApi.error(data.message ?? "Could not delete");
            return;
          }
          messageApi.success("Item recipe deleted");
          load();
        } catch {
          messageApi.error("Network error — please try again");
        }
      },
    });
  };

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

  const columns: ColumnsType<MenuRecipeRow> = [
    {
      title: "Item",
      key: "name",
      render: (_: unknown, row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-gray-900">{row.menuItem.name}</span>
          {row.menuItem.hidden && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600"
              title="Hidden on the storefront"
            >
              <EyeInvisibleOutlined /> Hidden
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 200,
      render: (_: unknown, row) =>
        row.mapped ? (
          <span className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
            Mapped
          </span>
        ) : (
          <span
            className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
            title={
              row.recipe
                ? "A recipe exists but lists no components"
                : "No recipe has been written for this item"
            }
          >
            {row.recipe ? "Unmapped · empty recipe" : "Unmapped"}
          </span>
        ),
    },
    {
      title: "Components",
      key: "components",
      align: "right",
      width: 140,
      render: (_: unknown, row) =>
        row.recipe ? (
          <span className="tabular-nums text-gray-700">
            {row.recipe.lines.length}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      title: "Costing",
      key: "totalCost",
      align: "right",
      width: 160,
      render: (_: unknown, row) =>
        row.recipe ? (
          <span className="whitespace-nowrap tabular-nums text-gray-900">
            {formatCurrency(row.recipe.totalCost)}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      width: 170,
      render: (_: unknown, row) =>
        row.recipe ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => router.push(`${BASE_PATH}/${row.recipe!._id}/edit`)}
              aria-label={`Edit recipe for ${row.menuItem.name}`}
              title="Edit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <EditOutlined />
            </button>
            <button
              onClick={() => setViewing(row.recipe)}
              aria-label={`View components in ${row.menuItem.name}`}
              title="View components"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <UnorderedListOutlined />
            </button>
            <button
              onClick={() => handleDelete(row.recipe!)}
              aria-label={`Delete recipe for ${row.menuItem.name}`}
              title="Delete"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <DeleteOutlined />
            </button>
          </div>
        ) : (
          // Straight into the form with the menu item's name filled in, so the
          // recipe matches back to it without anyone retyping it.
          <button
            onClick={() =>
              router.push(
                `${BASE_PATH}/new?name=${encodeURIComponent(row.menuItem.name)}`,
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-[#024731] transition-colors"
          >
            <PlusOutlined />
            Map recipe
          </button>
        ),
    },
  ];

  const renderTable = (rows: MenuRecipeRow[]) => (
    <Table<MenuRecipeRow>
      rowKey={(row) => row.menuItem._id}
      columns={columns}
      dataSource={rows}
      size="small"
      scroll={{ x: "max-content" }}
      pagination={
        rows.length > 25
          ? { pageSize: 25, showSizeChanger: false }
          : false
      }
    />
  );

  const filtersActive = !!term;

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
            it is made of; costing is calculated from those components.
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
            placeholder="Search by item name…"
            aria-label="Search menu items by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>

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
          Download Excel exports the recipes matching this search, not the menu.
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
                ? "No menu items match that search"
                : "No menu items yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {filtersActive
                ? "Try a different name."
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
        recipe={viewing}
        onClose={() => setViewing(null)}
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
