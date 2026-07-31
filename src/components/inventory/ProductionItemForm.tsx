"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import {
  computeCost,
  productionDependencies,
  type ProductionItem,
  type ProductionRecipeLine,
} from "@/lib/productionItems";
import { componentKey, type ComponentType } from "@/lib/itemRecipes";
import {
  formatCurrency,
  formatUnitConversion,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";
import { useRecipeComponents } from "./useRecipeComponents";

const CONSUMPTION_UNITS = ["gm", "ml", "pcs"];
const PURCHASE_UNITS = ["kg", "litre", "box", "packet", "pcs"];

const LIST_PATH = "/inventory-management/setup/production";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

/** A recipe row while it's being edited — qty is a string so partial input
 *  ("1.", "") survives typing without being coerced to 0. */
interface DraftLine {
  refType: ComponentType;
  refId: string;
  qtyUsed: string;
}

const TYPE_LABEL: Record<ComponentType, string> = {
  raw: "Raw material",
  production: "Production item",
};

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-gray-500">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Add/edit form for a production item, shared by /new and /[id]/edit.
 *
 * The price shown here is produced by the same `computeCost` the API uses to
 * store it, so the live preview and the saved value can never disagree.
 */
export default function ProductionItemForm({
  item,
}: {
  /** null = create mode. */
  item: ProductionItem | null;
}) {
  const router = useRouter();
  const [messageApi, messageContextHolder] = message.useMessage();

  // Raw materials AND production items, resolved and costed exactly as the
  // item-recipe form does — a production recipe may now name either.
  const {
    options,
    optionsByKey,
    costsByKey,
    productionRecipesById,
    loading: loadingComponents,
  } = useRecipeComponents();
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);

  const [name, setName] = useState(item?.name ?? "");
  const [consumptionUnit, setConsumptionUnit] = useState(
    item?.consumptionUnit ?? "gm",
  );
  const [purchaseUnit, setPurchaseUnit] = useState(item?.purchaseUnit ?? "kg");
  const [unitConversion, setUnitConversion] = useState(
    item ? String(item.unitConversion) : "",
  );
  const [batchYieldQty, setBatchYieldQty] = useState(
    item ? String(item.batchYieldQty) : "",
  );
  const [alertQty, setAlertQty] = useState(
    item?.alertQty ? String(item.alertQty) : "",
  );
  const [lines, setLines] = useState<DraftLine[]>(
    item?.recipe.map((r) => ({
      refType: r.refType,
      refId: r.refId,
      qtyUsed: String(r.qtyUsed),
    })) ?? [],
  );

  const [typeFilter, setTypeFilter] = useState<ComponentType | "">("");
  const [pickerCategory, setPickerCategory] = useState("");
  const [pickerValue, setPickerValue] = useState<string | undefined>(undefined);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inventory/categories", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data.success) setCategories(data.categories ?? []);
      } catch {
        /* the category filter simply stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  /** Recomputed on every keystroke — the same function the server stores with. */
  const breakdown = useMemo(() => {
    const recipe: ProductionRecipeLine[] = lines.map((l) => ({
      refType: l.refType,
      refId: l.refId,
      qtyUsed: Number(l.qtyUsed.replace(/,/g, "").trim()),
    }));
    return computeCost(
      recipe,
      Number(batchYieldQty.replace(/,/g, "").trim()),
      Number(unitConversion.replace(/,/g, "").trim()),
      costsByKey,
    );
  }, [lines, batchYieldQty, unitConversion, costsByKey]);

  const costByKey = useMemo(
    () =>
      new Map(breakdown.lines.map((l) => [componentKey(l.refType, l.refId), l])),
    [breakdown],
  );

  const addLine = useCallback(
    (key: string) => {
      setPickerValue(undefined);
      const option = optionsByKey.get(key);
      if (!option) return;

      if (lines.some((l) => componentKey(l.refType, l.refId) === key)) {
        // Re-selecting a component already in the recipe flashes its row
        // rather than silently doing nothing or creating an ambiguous double.
        setHighlightId(key);
        if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(
          () => setHighlightId(null),
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

  const validate = (): boolean => {
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Name is required";
    if (!consumptionUnit.trim())
      found.consumptionUnit = "Consumption unit is required";
    if (!purchaseUnit.trim()) found.purchaseUnit = "Purchase unit is required";

    const conversion = Number(unitConversion.replace(/,/g, ""));
    if (!unitConversion.trim()) found.unitConversion = "Required";
    else if (!Number.isFinite(conversion) || conversion <= 0)
      found.unitConversion = "Must be greater than 0";

    const yieldQty = Number(batchYieldQty.replace(/,/g, ""));
    if (!batchYieldQty.trim()) found.batchYieldQty = "Required";
    else if (!Number.isFinite(yieldQty) || yieldQty <= 0)
      found.batchYieldQty = "Must be greater than 0";

    // Optional — only validated when something was typed.
    if (alertQty.trim()) {
      const alert = Number(alertQty.replace(/,/g, ""));
      if (!Number.isFinite(alert)) found.alertQty = "Must be a number";
      else if (alert < 0) found.alertQty = "Cannot be negative";
    }

    setErrors(found);

    if (lines.length === 0) {
      setFormError("Add at least one component to the recipe");
      return false;
    }
    const badQty = lines.find((l) => {
      const q = Number(l.qtyUsed.replace(/,/g, "").trim());
      return !l.qtyUsed.trim() || !Number.isFinite(q) || q <= 0;
    });
    if (badQty) {
      const label =
        optionsByKey.get(componentKey(badQty.refType, badQty.refId))?.name ??
        "a row";
      setFormError(`Enter a quantity greater than 0 for ${label}`);
      return false;
    }

    setFormError(null);
    return Object.keys(found).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        consumptionUnit: consumptionUnit.trim(),
        purchaseUnit: purchaseUnit.trim(),
        unitConversion,
        batchYieldQty,
        alertQty,
        recipe: lines.map((l) => ({
          refType: l.refType,
          refId: l.refId,
          qtyUsed: l.qtyUsed,
        })),
      };
      const res = await fetch(
        item?._id
          ? `/api/inventory/production-items/${item._id}`
          : "/api/inventory/production-items",
        {
          method: item?._id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!data.success) {
        setFormError(data.message ?? "Could not save");
        return;
      }
      messageApi.success(
        item?._id ? "Production item updated" : "Production item added",
      );
      // Let the toast land before the route changes.
      window.setTimeout(() => router.push(LIST_PATH), 350);
    } catch {
      setFormError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Production items this one may NOT be built on: itself, and anything that
   * is already made from it. Either would leave the two waiting on each other
   * to be costed. The server rejects both regardless — this only keeps them
   * out of the picker, so the rule is visible before it is hit.
   */
  const blockedProductionIds = useMemo(() => {
    const blocked = new Set<string>();
    const selfId = item?._id ? String(item._id) : "";
    if (!selfId) return blocked;
    blocked.add(selfId);
    for (const id of productionRecipesById.keys()) {
      if (productionDependencies(id, productionRecipesById).has(selfId)) {
        blocked.add(id);
      }
    }
    return blocked;
  }, [item?._id, productionRecipesById]);

  const pickerOptions = useMemo(
    () =>
      options
        .filter((o) => !typeFilter || o.refType === typeFilter)
        // The category filter only narrows raw materials — production items
        // have no category, and hiding them all behind one would be a trap.
        .filter(
          (o) =>
            o.refType !== "raw" ||
            !pickerCategory ||
            o.categoryName ===
              categories.find((c) => String(c._id) === pickerCategory)?.name,
        )
        .filter(
          (o) => o.refType !== "production" || !blockedProductionIds.has(o.refId),
        )
        .map((o) => ({
          value: o.key,
          label: o.name,
          // Searched against, so typing a category or "production" finds rows.
          search: `${o.name} ${o.categoryName} ${TYPE_LABEL[o.refType]}`,
        })),
    [options, typeFilter, pickerCategory, categories, blockedProductionIds],
  );

  const recipeRows = lines.map((l) => {
    const key = componentKey(l.refType, l.refId);
    const option = optionsByKey.get(key);
    const cost = costByKey.get(key);
    return {
      key,
      refType: l.refType,
      name: option?.name ?? "(deleted component)",
      categoryName: option?.categoryName ?? "",
      consumptionUnit: option?.consumptionUnit ?? "",
      qtyUsed: l.qtyUsed,
      cost: cost?.cost ?? 0,
      found: cost?.found ?? false,
    };
  });

  type RecipeRow = (typeof recipeRows)[number];

  const recipeColumns: ColumnsType<RecipeRow> = [
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
      title: "Unit",
      dataIndex: "consumptionUnit",
      width: 90,
      render: (value: string) => <span className="text-gray-600">{value}</span>,
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
          <span className="text-sm text-gray-600">{row.consumptionUnit}</span>
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

  const yieldNumber = Number(batchYieldQty.replace(/,/g, "").trim());
  const conversionNumber = Number(unitConversion.replace(/,/g, "").trim());

  return (
    <div>
      {messageContextHolder}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Item details */}
        <section className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Item details
          </h2>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Item name" error={errors.name}>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dal Tadka Base"
                  autoFocus
                />
              </Field>
            </div>

            <Field
              label="Consumption unit"
              hint="Unit this item is used in"
              error={errors.consumptionUnit}
            >
              <Select
                className="w-full mt-0.5"
                value={consumptionUnit || undefined}
                onChange={(v) => setConsumptionUnit(v)}
                options={CONSUMPTION_UNITS.map((u) => ({ value: u, label: u }))}
                mode="tags"
                maxCount={1}
                onSelect={(v: string) => setConsumptionUnit(v)}
                placeholder="gm"
              />
            </Field>

            <Field
              label="Purchase unit"
              hint="Unit this item is tracked in"
              error={errors.purchaseUnit}
            >
              <Select
                className="w-full mt-0.5"
                value={purchaseUnit || undefined}
                onChange={(v) => setPurchaseUnit(v)}
                options={PURCHASE_UNITS.map((u) => ({ value: u, label: u }))}
                mode="tags"
                maxCount={1}
                onSelect={(v: string) => setPurchaseUnit(v)}
                placeholder="kg"
              />
            </Field>

            <Field
              label="Unit conversion"
              hint={`How many ${consumptionUnit || "consumption units"} in 1 ${purchaseUnit || "purchase unit"}`}
              error={errors.unitConversion}
            >
              <input
                className={inputClass}
                value={unitConversion}
                onChange={(e) => setUnitConversion(e.target.value)}
                placeholder="1000"
                inputMode="decimal"
              />
            </Field>

            <Field
              label="Batch yield qty"
              hint={`Final quantity of ${name.trim() || "this item"} produced from the recipe below, in ${consumptionUnit || "consumption units"}`}
              error={errors.batchYieldQty}
            >
              <input
                className={inputClass}
                value={batchYieldQty}
                onChange={(e) => setBatchYieldQty(e.target.value)}
                placeholder="5000"
                inputMode="decimal"
              />
            </Field>

            <Field
              label="Alert qty"
              hint={`Optional low-stock threshold, in ${consumptionUnit || "consumption units"}`}
              error={errors.alertQty}
            >
              <input
                className={inputClass}
                value={alertQty}
                onChange={(e) => setAlertQty(e.target.value)}
                placeholder="Leave blank for none"
                inputMode="decimal"
              />
            </Field>
          </div>
        </section>

        {/* Computed price */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Computed price
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Derived from the recipe — not editable.
          </p>

          <div className="mt-4 rounded-lg bg-[#024731]/5 border border-[#024731]/20 px-4 py-3">
            <div className="text-2xl font-bold tabular-nums text-[#024731]">
              {formatCurrency(breakdown.pricePerPurchaseUnit)}
              <span className="ml-1 text-sm font-medium text-gray-600">
                / {purchaseUnit || "purchase unit"}
              </span>
            </div>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-600">Total component cost</dt>
              <dd className="tabular-nums font-medium text-gray-900">
                {formatCurrency(breakdown.totalRecipeCost)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-600">
                ÷ batch yield
                {yieldNumber > 0 && (
                  <span className="text-gray-400">
                    {" "}
                    ({yieldNumber.toLocaleString("en-IN")}{" "}
                    {consumptionUnit || ""})
                  </span>
                )}
              </dt>
              <dd className="tabular-nums font-medium text-gray-900">
                {breakdown.costPerConsumptionUnit.toFixed(4)}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  / {consumptionUnit || "unit"}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2">
              <dt className="text-gray-600">
                × conversion
                {conversionNumber > 0 && (
                  <span className="text-gray-400">
                    {" "}
                    ({conversionNumber.toLocaleString("en-IN")})
                  </span>
                )}
              </dt>
              <dd className="tabular-nums font-semibold text-gray-900">
                {formatCurrency(breakdown.pricePerPurchaseUnit)}
              </dd>
            </div>
          </dl>

          {conversionNumber > 0 && consumptionUnit && purchaseUnit && (
            <p className="mt-3 text-xs text-gray-500">
              {formatUnitConversion({
                purchaseUnit,
                unitConversion: conversionNumber,
                consumptionUnit,
              })}
            </p>
          )}
        </section>
      </div>

      {/* Recipe */}
      <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Recipe
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Consumed to produce one batch — raw materials, and any production
              item this one is built on.
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
              className="min-w-[170px]"
              value={pickerCategory || ""}
              onChange={setPickerCategory}
              aria-label="Filter raw materials by category"
              options={[
                { value: "", label: "All Categories" },
                ...categories.map((c) => ({
                  value: String(c._id),
                  label: c.name,
                })),
              ]}
            />
            <Select
              className="min-w-[260px]"
              value={pickerValue}
              onChange={addLine}
              loading={loadingComponents}
              aria-label="Add a component to the recipe"
              placeholder={
                loadingComponents ? "Loading components…" : "+ Add Component"
              }
              showSearch
              optionFilterProp="search"
              options={pickerOptions}
              notFoundContent={
                loadingComponents ? "Loading…" : "Nothing found"
              }
              suffixIcon={<PlusOutlined />}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
          <Table<RecipeRow>
            columns={recipeColumns}
            dataSource={recipeRows}
            pagination={false}
            size="small"
            scroll={{ x: "max-content" }}
            rowClassName={(row) =>
              row.key === highlightId ? "bg-amber-100 transition-colors" : ""
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
              recipeRows.length > 0 ? (
                <Table.Summary.Row className="bg-gray-50 font-semibold">
                  <Table.Summary.Cell index={0} colSpan={5}>
                    <span className="text-gray-700">Total recipe cost</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <span className="tabular-nums text-gray-900">
                      {formatCurrency(breakdown.totalRecipeCost)}
                    </span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
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
          {saving
            ? "Saving…"
            : item
              ? "Save changes"
              : "Add production item"}
        </button>
      </div>
    </div>
  );
}
