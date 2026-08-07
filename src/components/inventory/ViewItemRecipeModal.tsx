"use client";

import { useCallback, useMemo } from "react";
import { Modal, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, WarningOutlined } from "@ant-design/icons";
import {
  componentKey,
  computeItemRecipeCost,
  type ComponentType,
  type ItemRecipeCostLine,
} from "@/lib/itemRecipes";
import type { SoldRecipe } from "@/lib/menuRecipes";
import { formatCurrency } from "@/lib/rawMaterials";
import { useRecipeComponents } from "@/components/inventory/useRecipeComponents";

const TYPE_LABEL: Record<ComponentType, string> = {
  raw: "Raw material",
  production: "Production item",
  item: "Food item",
};

/** A menu item as this modal reads it: a name and every way it sells. */
export interface ViewedItem {
  name: string;
  /**
   * One per size, or a single unlabelled entry for an item with none. Built by
   * soldRecipes(), so each entry is the recipe a sale of that size actually
   * deducts — including a size riding the item's base recipe.
   */
  sections: SoldRecipe[];
}

/**
 * Read-only view of what a menu item is made of.
 *
 * An item sold in sizes has no single answer — each size draws down its own
 * components — so it gets one breakdown per size rather than one for the item.
 * Packaging is shown once, below them: the form keeps a single packaging list
 * for the whole item, sizes included.
 *
 * Costs are recomputed from current component prices rather than read from the
 * stored total, so the breakdown always reconciles with what the form shows.
 */
export default function ViewItemRecipeModal({
  open,
  item,
  onClose,
  onEdit,
}: {
  open: boolean;
  item: ViewedItem | null;
  onClose: () => void;
  /** Where the Edit button goes; the list screen owns the routing. */
  onEdit: () => void;
}) {
  const { optionsByKey, costsByKey, itemCostsById, loading } =
    useRecipeComponents();

  const toRows = useCallback(
    (lines: ItemRecipeCostLine[]) =>
      lines.map((line) => {
        const key = componentKey(line.refType, line.refId);
        const option = optionsByKey.get(key);
        return {
          key,
          refType: line.refType,
          name: option?.name ?? "(deleted component)",
          categoryName: option?.categoryName ?? "",
          unit: option?.consumptionUnit ?? "",
          qtyUsed: line.qtyUsed,
          cost: line.cost,
          share: line.share,
          found: line.found,
        };
      }),
    [optionsByKey],
  );

  type Row = ReturnType<typeof toRows>[number];

  /** Each way the item sells, priced and turned into table rows. */
  const sections = useMemo(
    () =>
      (item?.sections ?? []).map((section, index) => {
        const breakdown = computeItemRecipeCost(
          section.recipe.lines,
          costsByKey,
          itemCostsById,
        );
        return {
          // A size riding the base recipe repeats that recipe's id, so the
          // label is what keeps the two sections apart.
          key: `${section.label}-${index}`,
          label: section.label,
          fallback: section.fallback,
          rows: toRows(breakdown.lines),
          totalCost: breakdown.totalCost,
        };
      }),
    [item, costsByKey, itemCostsById, toRows],
  );

  /**
   * The item's packaging, from the first size that carries any.
   *
   * One list covers the whole item — see ItemRecipeForm, which writes the same
   * packaging onto every size — so showing it per size would repeat it.
   */
  const packaging = useMemo(() => {
    const carrying = (item?.sections ?? []).find(
      (s) => (s.recipe.packagingLines?.length ?? 0) > 0,
    );
    if (!carrying) return null;
    // Raw materials only, so it needs no item costs to price.
    const breakdown = computeItemRecipeCost(
      carrying.recipe.packagingLines ?? [],
      costsByKey,
    );
    return { rows: toRows(breakdown.lines), totalCost: breakdown.totalCost };
  }, [item, costsByKey, toRows]);

  const columns: ColumnsType<Row> = [
    {
      title: "Component",
      dataIndex: "name",
      render: (value: string, row) => (
        <span className="font-medium text-gray-900">
          {value}
          {!row.found && !loading && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              <WarningOutlined /> missing
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Type",
      dataIndex: "refType",
      width: 150,
      render: (value: ComponentType) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
            value === "production"
              ? "bg-[#024731]/10 text-[#024731]"
              : value === "item"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-700"
          }`}
        >
          {TYPE_LABEL[value]}
        </span>
      ),
    },
    {
      title: "Category",
      dataIndex: "categoryName",
      render: (value: string) =>
        value ? (
          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {value}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      title: "Qty Used",
      dataIndex: "qtyUsed",
      align: "right",
      render: (value: number, row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700">
          {value.toLocaleString("en-IN")} {row.unit}
        </span>
      ),
    },
    {
      title: "Cost",
      dataIndex: "cost",
      align: "right",
      render: (value: number) => (
        <span className="tabular-nums text-gray-900">{formatCurrency(value)}</span>
      ),
    },
    {
      title: "% of total",
      dataIndex: "share",
      align: "right",
      width: 110,
      render: (value: number) => (
        <span className="tabular-nums text-gray-600">
          {(value * 100).toFixed(1)}%
        </span>
      ),
    },
  ];

  /**
   * The same table minus the columns packaging cannot vary in: every row is a
   * raw material, and a share of a total that is itself quoted apart from the
   * food cost measures nothing anyone asked for.
   */
  const packagingColumns: ColumnsType<Row> = columns.filter(
    (c) => c.title !== "Type" && c.title !== "% of total",
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={800}
      title={
        item ? (
          <span>
            Components in <span className="font-bold">{item.name}</span>
          </span>
        ) : (
          "Components"
        )
      }
      footer={[
        <button
          key="close"
          onClick={onClose}
          className="mr-2 rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Close
        </button>,
        <button
          key="edit"
          onClick={() => {
            onClose();
            onEdit();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <EditOutlined />
          Edit
        </button>,
      ]}
    >
      {item && sections.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">
          Nothing is written for this item yet, so nothing would come off the
          shelf for it.
        </p>
      )}

      {sections.map((section) => (
        <div key={section.key} className="mt-4">
          {/* Unlabelled for an item with no sizes — there is only one list, and
              heading it would name a distinction the item does not have. */}
          {section.label && (
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {section.label}
              </h3>
              {section.fallback && (
                <span
                  className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                  title="No recipe has been written for this size, so a sale of it deducts the item's base recipe — shown here."
                >
                  base recipe
                </span>
              )}
            </div>
          )}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <Table<Row>
              columns={columns}
              dataSource={section.rows}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: "max-content" }}
              locale={{ emptyText: "This recipe has no components." }}
              summary={() =>
                section.rows.length > 0 ? (
                  <Table.Summary.Row className="bg-gray-50 font-semibold">
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <span className="text-gray-700">Total cost</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <span className="tabular-nums text-gray-900">
                        {formatCurrency(section.totalCost)}
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <span className="tabular-nums text-gray-600">100.0%</span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null
              }
            />
          </div>
        </div>
      ))}

      {/* Only when there is some: an empty packaging table under every recipe
          would read as a gap to fill rather than a thing not used here. */}
      {packaging && packaging.rows.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Packaging
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Deducted per portion sold, and costed separately from the components
            above.
          </p>
          <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
            <Table<Row>
              columns={packagingColumns}
              dataSource={packaging.rows}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: "max-content" }}
              summary={() => (
                <Table.Summary.Row className="bg-gray-50 font-semibold">
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <span className="text-gray-700">Packaging cost</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <span className="tabular-nums text-gray-900">
                      {formatCurrency(packaging.totalCost)}
                    </span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
