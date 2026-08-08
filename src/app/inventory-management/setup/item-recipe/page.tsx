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
  soldRecipes,
  writtenRecipes,
  type MenuItemSummary,
  type MenuRecipeRow,
  type SoldRecipe,
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

/**
 * One figure across every way an item sells, or the span when they differ.
 *
 * An item whose sizes carry different recipes has no single component count or
 * cost, and averaging them would invent one. The span says plainly that the
 * answer depends on which size sold.
 */
function spanOf(values: number[], format: (n: number) => string): string {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? format(low) : `${format(low)} – ${format(high)}`;
}

/** "Small: 6 components · ₹45.77" per line — the breakdown behind a span. */
function soldTooltip(sold: SoldRecipe[]): string {
  return sold
    .map(({ label, recipe }) =>
      [
        label ? `${label}: ` : "",
        `${recipe.lines.length} component${recipe.lines.length === 1 ? "" : "s"}`,
        ` · ${formatCurrency(recipe.totalCost)}`,
      ].join(""),
    )
    .join("\n");
}

export default function ItemRecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<ItemRecipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
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

  /**
   * Delete every recipe written for this item — its base and each of its
   * sizes.
   *
   * The row IS the item, so the bin on it clears the item. Which records that
   * means depends on how the item is written, so the confirm names them all
   * rather than leaving the user to guess whether the sizes go too.
   */
  const handleDelete = (row: MenuRecipeRow) => {
    const written = writtenRecipes(row);
    if (written.length === 0) return;
    const labels = written.map((r) => r.variantName?.trim() || "base recipe");

    modal.confirm({
      title:
        written.length === 1
          ? "Delete this item recipe?"
          : `Delete all ${written.length} recipes for this item?`,
      content: (
        <span>
          <strong>{row.menuItem.name}</strong> — {labels.join(", ")} — will be
          removed permanently, components and all. The menu item itself is
          untouched.
        </span>
      ),
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        // Each is its own record and its own request; one failing must not
        // hide that the others went, so the list reloads either way.
        const results = await Promise.all(
          written.map((r) =>
            fetch(`/api/inventory/item-recipes/${r._id}`, { method: "DELETE" })
              .then((res) => res.json())
              .catch(() => ({
                success: false,
                message: "Network error — please try again",
              })),
          ),
        );

        const failed = results.filter((d) => !d?.success);
        if (failed.length) {
          messageApi.error(failed[0]?.message ?? "Could not delete");
        } else {
          messageApi.success(
            written.length === 1
              ? "Item recipe deleted"
              : `${written.length} item recipes deleted`,
          );
        }
        load();
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

  /** How many of a menu item's sizes carry a written recipe of their own. */
  const sizedVariantCount = (row: MenuRecipeRow) =>
    row.variants.filter((v) => v.mapped).length;

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
          {row.variants.length > 0 && (
            <span
              className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600"
              title={`${row.variants.map((v) => v.name).join(", ")} — this item is ordered as one of these, and each carries its own components.`}
            >
              {sizedVariantCount(row)}/{row.variants.length} variants mapped
            </span>
          )}
          {row.menuItem.isAddOn && (
            <span
              className="inline-flex items-center rounded-md bg-[#024731]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#024731]"
              title="An add-on. It is ordered as a product in its own right, so it needs its own components — editable here, or from the recipe of any item that offers it."
            >
              Add-on
            </span>
          )}
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
      render: (_: unknown, row) => {
        // An item with variants is accounted for when its variants are: it is
        // never ordered as itself, so its own recipe says nothing about it.
        const total = row.variants.length;
        if (total > 0) {
          const sized = sizedVariantCount(row);
          if (sized === total) {
            return (
              <span className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                Mapped
              </span>
            );
          }
          return (
            <span
              className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
              title={`${total - sized} variant${total - sized === 1 ? "" : "s"} still without components`}
            >
              {sized === 0 ? "Unmapped" : `Unmapped · ${total - sized} left`}
            </span>
          );
        }

        return row.mapped ? (
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
        );
      },
    },
    {
      title: "Components",
      key: "components",
      align: "right",
      width: 140,
      // Read across every size the item sells in, not off its base recipe: an
      // item whose sizes each carry their own components has no base recipe to
      // read, and one that does is not sold at it.
      render: (_: unknown, row) => {
        const sold = soldRecipes(row);
        if (sold.length === 0) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        return (
          <span
            className="whitespace-nowrap tabular-nums text-gray-700"
            title={soldTooltip(sold)}
          >
            {spanOf(
              sold.map((s) => s.recipe.lines.length),
              String,
            )}
          </span>
        );
      },
    },
    {
      title: "Costing",
      key: "totalCost",
      align: "right",
      width: 200,
      render: (_: unknown, row) => {
        const sold = soldRecipes(row);
        if (sold.length === 0) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        return (
          <span
            className="whitespace-nowrap tabular-nums text-gray-900"
            title={soldTooltip(sold)}
          >
            {spanOf(
              sold.map((s) => s.recipe.totalCost),
              formatCurrency,
            )}
          </span>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      width: 170,
      // Written for at all — base or any size — earns the full set. An item
      // defined only by its sizes is edited, read and deleted like any other;
      // that it has no base recipe is a fact about its shape, not about how
      // much of it you are allowed to do.
      render: (_: unknown, row) =>
        writtenRecipes(row).length > 0 ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => router.push(editHref(row))}
              aria-label={`Edit recipe for ${row.menuItem.name}`}
              title="Edit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <EditOutlined />
            </button>
            <button
              onClick={() => setViewing(row)}
              aria-label={`View components in ${row.menuItem.name}`}
              title="View components"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <UnorderedListOutlined />
            </button>
            <button
              onClick={() => handleDelete(row)}
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
            onClick={() => router.push(editHref(row))}
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
