"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import {
  componentKey,
  computeItemRecipeCost,
  type ComponentType,
  type ItemRecipeLine,
} from "@/lib/itemRecipes";
import { formatCurrency } from "@/lib/rawMaterials";
import type { useRecipeComponents } from "@/components/inventory/useRecipeComponents";

/** A row while it's being edited — qty stays a string so partial input survives. */
export interface DraftLine {
  refType: ComponentType;
  refId: string;
  qtyUsed: string;
}

export const TYPE_LABEL: Record<ComponentType, string> = {
  raw: "Raw material",
  production: "Production item",
  item: "Food item",
};

/** Everything loaded once by the page and shared by every editor on it. */
export type RecipeComponents = ReturnType<typeof useRecipeComponents>;

/** Draft rows as the costing functions want them. */
export function toLines(draft: DraftLine[]): ItemRecipeLine[] {
  return draft.map((l) => ({
    refType: l.refType,
    refId: l.refId,
    qtyUsed: Number(l.qtyUsed.replace(/,/g, "").trim()),
  }));
}

/**
 * The component list of one recipe: pick things, give each a quantity, see what
 * it costs.
 *
 * Extracted from the item-recipe form because an item's add-ons each need the
 * same editor, and they all read one shared load of the component lists —
 * `components` is passed in rather than fetched here, or a dish with six
 * add-ons would fetch the same three endpoints seven times.
 */
export default function ComponentLinesEditor({
  lines,
  onChange,
  components,
  allowItems,
  blockedItemIds,
  onDuplicate,
  dense = false,
}: {
  lines: DraftLine[];
  onChange: (next: DraftLine[]) => void;
  components: RecipeComponents;
  /** Offer food items. False for an add-on, which is only ever raw or made. */
  allowItems: boolean;
  /** Food items that would close a loop — never offered. */
  blockedItemIds?: ReadonlySet<string>;
  onDuplicate?: () => void;
  /** Tighter presentation for a panel nested inside the main form. */
  dense?: boolean;
}) {
  const {
    options,
    itemOptions,
    optionsByKey,
    costsByKey,
    itemCostsById,
    loading,
  } = components;

  const [typeFilter, setTypeFilter] = useState<"" | ComponentType>("");
  const [pickerValue, setPickerValue] = useState<string | undefined>(undefined);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  /** Recomputed on every keystroke — the same function the API stores with. */
  const breakdown = useMemo(
    () => computeItemRecipeCost(toLines(lines), costsByKey, itemCostsById),
    [lines, costsByKey, itemCostsById],
  );

  const costByKey = useMemo(
    () =>
      new Map(
        breakdown.lines.map((l) => [componentKey(l.refType, l.refId), l]),
      ),
    [breakdown],
  );

  const addLine = useCallback(
    (key: string) => {
      setPickerValue(undefined);
      const option = optionsByKey.get(key);
      if (!option) return;

      if (lines.some((l) => componentKey(l.refType, l.refId) === key)) {
        // Re-selecting something already in the recipe flashes its row rather
        // than creating an ambiguous duplicate.
        setHighlightKey(key);
        if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(
          () => setHighlightKey(null),
          1600,
        );
        onDuplicate?.();
        return;
      }
      onChange([
        ...lines,
        { refType: option.refType, refId: option.refId, qtyUsed: "" },
      ]);
    },
    [lines, onChange, optionsByKey, onDuplicate],
  );

  const setQty = (key: string, value: string) => {
    onChange(
      lines.map((l) =>
        componentKey(l.refType, l.refId) === key ? { ...l, qtyUsed: value } : l,
      ),
    );
  };

  const removeLine = (key: string) => {
    onChange(lines.filter((l) => componentKey(l.refType, l.refId) !== key));
  };

  const pickerOptions = useMemo(
    () =>
      [...options, ...(allowItems ? itemOptions : [])]
        .filter((o) => !typeFilter || o.refType === typeFilter)
        .filter((o) => o.refType !== "item" || !blockedItemIds?.has(o.refId))
        .map((o) => ({
          value: o.key,
          label: o.name,
          // Searched against, so typing "production" or a category finds rows.
          search: `${o.name} ${o.categoryName} ${TYPE_LABEL[o.refType]}`,
        })),
    [options, itemOptions, allowItems, typeFilter, blockedItemIds],
  );

  const rows = lines.map((l) => {
    const key = componentKey(l.refType, l.refId);
    const option = optionsByKey.get(key);
    const cost = costByKey.get(key);
    return {
      key,
      refType: l.refType,
      name: option?.name ?? "(deleted component)",
      categoryName: option?.categoryName ?? "",
      unit: option?.consumptionUnit ?? "",
      qtyUsed: l.qtyUsed,
      cost: cost?.cost ?? 0,
      found: cost?.found ?? false,
    };
  });

  type Row = (typeof rows)[number];

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
      width: 170,
      align: "right",
      render: (value: string, row) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <input
            value={value}
            onChange={(e) => setQty(row.key, e.target.value)}
            inputMode={row.refType === "item" ? "numeric" : "decimal"}
            aria-label={`Quantity of ${row.name}`}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
          <span className="text-sm text-gray-600">{row.unit}</span>
        </span>
      ),
    },
    {
      title: "Cost",
      dataIndex: "cost",
      width: 130,
      align: "right",
      render: (value: number) => (
        <span className="tabular-nums text-gray-800">{formatCurrency(value)}</span>
      ),
    },
    {
      title: "",
      key: "remove",
      width: 60,
      align: "right",
      render: (_, row) => (
        <button
          type="button"
          onClick={() => removeLine(row.key)}
          aria-label={`Remove ${row.name}`}
          title="Remove"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <DeleteOutlined />
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          className="min-w-[160px]"
          size={dense ? "small" : "middle"}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v)}
          aria-label="Filter components by type"
          options={[
            { value: "", label: "All types" },
            { value: "raw", label: "Raw materials" },
            { value: "production", label: "Production items" },
            ...(allowItems
              ? [{ value: "item", label: "Food items" }]
              : []),
          ]}
        />
        <Select
          className="min-w-[240px]"
          size={dense ? "small" : "middle"}
          value={pickerValue}
          onChange={addLine}
          loading={loading}
          aria-label="Add a component"
          placeholder={loading ? "Loading components…" : "+ Add Component"}
          showSearch
          optionFilterProp="search"
          options={pickerOptions}
          notFoundContent={loading ? "Loading…" : "Nothing found"}
          suffixIcon={<PlusOutlined />}
        />
      </div>

      <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
        <Table<Row>
          columns={columns}
          dataSource={rows}
          pagination={false}
          size="small"
          scroll={{ x: "max-content" }}
          rowClassName={(row) =>
            row.key === highlightKey ? "bg-amber-100 transition-colors" : ""
          }
          locale={{
            emptyText: (
              <div className={dense ? "py-4 text-center" : "py-8 text-center"}>
                <p className="text-sm font-medium text-gray-900">
                  No components yet
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Use “+ Add Component” above to build it.
                </p>
              </div>
            ),
          }}
          summary={() =>
            rows.length > 0 ? (
              <Table.Summary.Row className="bg-gray-50 font-semibold">
                <Table.Summary.Cell index={0} colSpan={4}>
                  <span className="text-gray-700">Total cost</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <span className="tabular-nums text-gray-900">
                    {formatCurrency(breakdown.totalCost)}
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            ) : null
          }
        />
      </div>
    </div>
  );
}
