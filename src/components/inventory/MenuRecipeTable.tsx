"use client";

import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import {
  soldRecipes,
  writtenRecipes,
  type MenuRecipeRow,
  type SoldRecipe,
} from "@/lib/menuRecipes";
import { formatCurrency } from "@/lib/rawMaterials";

/**
 * The menu-item-and-its-recipe table, shared by Item Recipe and Addons Recipe.
 *
 * Both screens list the same thing — a menu item, whether a recipe backs it,
 * what it is made of and what that costs — over different slices of the menu.
 * One table so a column added for one is never missing from the other.
 */

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

/** How many of a menu item's sizes carry a written recipe of their own. */
function sizedVariantCount(row: MenuRecipeRow): number {
  return row.variants.filter((v) => v.mapped).length;
}

/** The antd instances the confirm needs, without importing their types twice. */
interface DeleteDeps {
  modal: { confirm: (config: Record<string, unknown>) => void };
  messageApi: { success: (text: string) => void; error: (text: string) => void };
  /** Reload the list — called whether or not every delete succeeded. */
  onDone: () => void;
  /** What the row stands for, e.g. "item recipe" / "addon recipe". */
  noun?: string;
}

/**
 * Delete every recipe written for this item — its base and each of its sizes.
 *
 * The row IS the item, so the bin on it clears the item. Which records that
 * means depends on how the item is written, so the confirm names them all
 * rather than leaving the user to guess whether the sizes go too.
 */
export function confirmDeleteMenuRecipes(
  row: MenuRecipeRow,
  { modal, messageApi, onDone, noun = "item recipe" }: DeleteDeps,
): void {
  const written = writtenRecipes(row);
  if (written.length === 0) return;
  const labels = written.map((r) => r.variantName?.trim() || "base recipe");

  modal.confirm({
    title:
      written.length === 1
        ? `Delete this ${noun}?`
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
      // Each is its own record and its own request; one failing must not hide
      // that the others went, so the list reloads either way.
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
            ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`
            : `${written.length} recipes deleted`,
        );
      }
      onDone();
    },
  });
}

interface MenuRecipeTableProps {
  rows: MenuRecipeRow[];
  onEdit: (row: MenuRecipeRow) => void;
  onView: (row: MenuRecipeRow) => void;
  onDelete: (row: MenuRecipeRow) => void;
  /**
   * Show the "Add-on" chip. Off on a screen that lists nothing else, where a
   * badge on every row says nothing.
   */
  showAddOnBadge?: boolean;
  /** Label on the button for a row nobody has written a recipe for yet. */
  mapLabel?: string;
}

export default function MenuRecipeTable({
  rows,
  onEdit,
  onView,
  onDelete,
  showAddOnBadge = true,
  mapLabel = "Map recipe",
}: MenuRecipeTableProps) {
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
          {showAddOnBadge && row.menuItem.isAddOn && (
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
              onClick={() => onEdit(row)}
              aria-label={`Edit recipe for ${row.menuItem.name}`}
              title="Edit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <EditOutlined />
            </button>
            <button
              onClick={() => onView(row)}
              aria-label={`View components in ${row.menuItem.name}`}
              title="View components"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <UnorderedListOutlined />
            </button>
            <button
              onClick={() => onDelete(row)}
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
            onClick={() => onEdit(row)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-[#024731] transition-colors"
          >
            <PlusOutlined />
            {mapLabel}
          </button>
        ),
    },
  ];

  return (
    <Table<MenuRecipeRow>
      rowKey={(row) => row.menuItem._id}
      columns={columns}
      dataSource={rows}
      size="small"
      scroll={{ x: "max-content" }}
      pagination={
        rows.length > 25 ? { pageSize: 25, showSizeChanger: false } : false
      }
    />
  );
}
