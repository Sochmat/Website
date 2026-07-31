"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import {
  componentKey,
  computeItemRecipeCost,
  type ComponentType,
  type ItemRecipe,
  type ItemRecipeLine,
} from "@/lib/itemRecipes";
import { formatCurrency } from "@/lib/rawMaterials";
import { useRecipeComponents } from "@/components/inventory/useRecipeComponents";

const LIST_PATH = "/inventory-management/setup/item-recipe";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

/** A row while it's being edited — qty stays a string so partial input survives. */
interface DraftLine {
  refType: ComponentType;
  refId: string;
  qtyUsed: string;
}

const TYPE_LABEL: Record<ComponentType, string> = {
  raw: "Raw material",
  production: "Production item",
};

/**
 * Add/edit form for an item recipe, shared by /new and /[id]/edit.
 *
 * Unlike a production item there are no units, conversion or batch yield —
 * a recipe is a name plus components, and its costing is simply the sum of
 * the component costs.
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
  const { options, optionsByKey, costsByKey, loading } = useRecipeComponents();

  const [name, setName] = useState(recipe?.name ?? initialName);
  const [lines, setLines] = useState<DraftLine[]>(
    recipe?.lines.map((l) => ({
      refType: l.refType,
      refId: l.refId,
      qtyUsed: String(l.qtyUsed),
    })) ?? [],
  );

  const [typeFilter, setTypeFilter] = useState<"" | ComponentType>("");
  const [pickerValue, setPickerValue] = useState<string | undefined>(undefined);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const highlightTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  /** Recomputed on every keystroke — the same function the API stores with. */
  const breakdown = useMemo(() => {
    const parsed: ItemRecipeLine[] = lines.map((l) => ({
      refType: l.refType,
      refId: l.refId,
      qtyUsed: Number(l.qtyUsed.replace(/,/g, "").trim()),
    }));
    return computeItemRecipeCost(parsed, costsByKey);
  }, [lines, costsByKey]);

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
        messageApi.info("That component is already in the recipe");
        return;
      }
      setLines((current) => [
        ...current,
        { refType: option.refType, refId: option.refId, qtyUsed: "" },
      ]);
      setFormError(null);
    },
    [lines, optionsByKey, messageApi],
  );

  const setQty = (key: string, value: string) => {
    setLines((current) =>
      current.map((l) =>
        componentKey(l.refType, l.refId) === key ? { ...l, qtyUsed: value } : l,
      ),
    );
    setFormError(null);
  };

  const removeLine = (key: string) => {
    setLines((current) =>
      current.filter((l) => componentKey(l.refType, l.refId) !== key),
    );
  };

  const handleSave = async () => {
    setNameError(name.trim() ? null : "Name is required");
    if (!name.trim()) return;

    if (lines.length === 0) {
      setFormError("Add at least one component to the recipe");
      return;
    }
    const bad = lines.find((l) => {
      const q = Number(l.qtyUsed.replace(/,/g, "").trim());
      return !l.qtyUsed.trim() || !Number.isFinite(q) || q <= 0;
    });
    if (bad) {
      const label =
        optionsByKey.get(componentKey(bad.refType, bad.refId))?.name ?? "a row";
      setFormError(`Enter a quantity greater than 0 for ${label}`);
      return;
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
      messageApi.success(recipe?._id ? "Item recipe updated" : "Item recipe added");
      window.setTimeout(() => router.push(LIST_PATH), 350);
    } catch {
      setFormError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const pickerOptions = useMemo(
    () =>
      options
        .filter((o) => !typeFilter || o.refType === typeFilter)
        .map((o) => ({
          value: o.key,
          label: o.name,
          // Searched against, so typing "production" or a category finds rows.
          search: `${o.name} ${o.categoryName} ${TYPE_LABEL[o.refType]}`,
        })),
    [options, typeFilter],
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
          {!row.found && (
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
            inputMode="decimal"
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
              across {rows.length} component{rows.length === 1 ? "" : "s"}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Components
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Raw materials and production items that make up this recipe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="min-w-[180px]"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              aria-label="Filter components by type"
              options={[
                { value: "", label: "All types" },
                { value: "raw", label: "Raw materials" },
                { value: "production", label: "Production items" },
              ]}
            />
            <Select
              className="min-w-[260px]"
              value={pickerValue}
              onChange={addLine}
              loading={loading}
              aria-label="Add a component to the recipe"
              placeholder={loading ? "Loading components…" : "+ Add Component"}
              showSearch
              optionFilterProp="search"
              options={pickerOptions}
              notFoundContent={loading ? "Loading…" : "Nothing found"}
              suffixIcon={<PlusOutlined />}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
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
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-gray-900">
                    No components yet
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Use “+ Add Component” above to build the recipe.
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

        {formError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}
      </section>

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
