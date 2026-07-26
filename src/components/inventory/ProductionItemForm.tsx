"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import {
  computeCost,
  type ProductionItem,
  type ProductionRecipeLine,
  type CostingMaterial,
} from "@/lib/productionItems";
import {
  formatCurrency,
  formatUnitConversion,
  type RawMaterial,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";

const CONSUMPTION_UNITS = ["gm", "ml", "pcs"];
const PURCHASE_UNITS = ["kg", "litre", "box", "packet", "pcs"];

const LIST_PATH = "/inventory-management/setup/production";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

/** A recipe row while it's being edited — qty is a string so partial input
 *  ("1.", "") survives typing without being coerced to 0. */
interface DraftLine {
  rawMaterialId: string;
  qtyUsed: string;
}

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

  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);

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
      rawMaterialId: r.rawMaterialId,
      qtyUsed: String(r.qtyUsed),
    })) ?? [],
  );

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
        const [mRes, cRes] = await Promise.all([
          fetch("/api/inventory/raw-materials", { cache: "no-store" }),
          fetch("/api/inventory/categories", { cache: "no-store" }),
        ]);
        const [mData, cData] = await Promise.all([mRes.json(), cRes.json()]);
        if (cancelled) return;
        if (mData.success) setMaterials(mData.materials ?? []);
        if (cData.success) setCategories(cData.categories ?? []);
      } catch {
        /* the picker simply stays empty */
      } finally {
        if (!cancelled) setLoadingMaterials(false);
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

  const materialsById = useMemo(
    () => new Map(materials.map((m) => [String(m._id), m])),
    [materials],
  );

  const costingById = useMemo<Map<string, CostingMaterial>>(
    () =>
      new Map(
        materials.map((m) => [
          String(m._id),
          {
            pricePerPurchaseUnit: m.pricePerPurchaseUnit,
            unitConversion: m.unitConversion,
          },
        ]),
      ),
    [materials],
  );

  /** Recomputed on every keystroke — the same function the server stores with. */
  const breakdown = useMemo(() => {
    const recipe: ProductionRecipeLine[] = lines.map((l) => ({
      rawMaterialId: l.rawMaterialId,
      qtyUsed: Number(l.qtyUsed.replace(/,/g, "").trim()),
    }));
    return computeCost(
      recipe,
      Number(batchYieldQty.replace(/,/g, "").trim()),
      Number(unitConversion.replace(/,/g, "").trim()),
      costingById,
    );
  }, [lines, batchYieldQty, unitConversion, costingById]);

  const costByMaterialId = useMemo(
    () => new Map(breakdown.lines.map((l) => [l.rawMaterialId, l])),
    [breakdown],
  );

  const addLine = useCallback(
    (rawMaterialId: string) => {
      setPickerValue(undefined);
      const existing = lines.some((l) => l.rawMaterialId === rawMaterialId);
      if (existing) {
        // Re-selecting an ingredient already in the recipe flashes its row
        // rather than silently doing nothing or creating an ambiguous double.
        setHighlightId(rawMaterialId);
        if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(
          () => setHighlightId(null),
          1600,
        );
        messageApi.info("That raw material is already in the recipe");
        return;
      }
      setLines((current) => [...current, { rawMaterialId, qtyUsed: "" }]);
      setFormError(null);
    },
    [lines, messageApi],
  );

  const setQty = (rawMaterialId: string, value: string) => {
    setLines((current) =>
      current.map((l) =>
        l.rawMaterialId === rawMaterialId ? { ...l, qtyUsed: value } : l,
      ),
    );
    setFormError(null);
  };

  const removeLine = (rawMaterialId: string) => {
    setLines((current) =>
      current.filter((l) => l.rawMaterialId !== rawMaterialId),
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
      setFormError("Add at least one raw material to the recipe");
      return false;
    }
    const badQty = lines.find((l) => {
      const q = Number(l.qtyUsed.replace(/,/g, "").trim());
      return !l.qtyUsed.trim() || !Number.isFinite(q) || q <= 0;
    });
    if (badQty) {
      const label = materialsById.get(badQty.rawMaterialId)?.name ?? "a row";
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
          rawMaterialId: l.rawMaterialId,
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

  const pickerOptions = useMemo(
    () =>
      materials
        .filter((m) => !pickerCategory || m.categoryId === pickerCategory)
        .map((m) => ({
          value: String(m._id),
          label: m.name,
          // Searched against, so typing a category name finds its materials.
          search: `${m.name} ${m.categoryName ?? ""}`,
        })),
    [materials, pickerCategory],
  );

  const recipeRows = lines.map((l) => {
    const material = materialsById.get(l.rawMaterialId);
    const cost = costByMaterialId.get(l.rawMaterialId);
    return {
      key: l.rawMaterialId,
      rawMaterialId: l.rawMaterialId,
      name: material?.name ?? "(deleted raw material)",
      categoryName: material?.categoryName ?? "",
      consumptionUnit: material?.consumptionUnit ?? "",
      qtyUsed: l.qtyUsed,
      cost: cost?.cost ?? 0,
      found: cost?.found ?? false,
    };
  });

  type RecipeRow = (typeof recipeRows)[number];

  const recipeColumns: ColumnsType<RecipeRow> = [
    {
      title: "Raw Material",
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
            onChange={(e) => setQty(row.rawMaterialId, e.target.value)}
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
          onClick={() => removeLine(row.rawMaterialId)}
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
              <dt className="text-gray-600">Total raw material cost</dt>
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
              Raw materials consumed to produce one batch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="min-w-[240px]"
              value={pickerValue}
              onChange={addLine}
              loading={loadingMaterials}
              aria-label="Add a raw material to the recipe"
              placeholder={
                loadingMaterials
                  ? "Loading raw materials…"
                  : "+ Add Raw Material"
              }
              showSearch
              optionFilterProp="search"
              options={pickerOptions}
              notFoundContent={
                loadingMaterials ? "Loading…" : "No raw materials found"
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
              row.rawMaterialId === highlightId
                ? "bg-amber-100 transition-colors"
                : ""
            }
            locale={{
              emptyText: (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-gray-900">
                    No raw materials yet
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Use “+ Add Raw Material” above to build the recipe.
                  </p>
                </div>
              ),
            }}
            summary={() =>
              recipeRows.length > 0 ? (
                <Table.Summary.Row className="bg-gray-50 font-semibold">
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <span className="text-gray-700">Total recipe cost</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <span className="tabular-nums text-gray-900">
                      {formatCurrency(breakdown.totalRecipeCost)}
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
