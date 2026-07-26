"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Checkbox, Select, Tabs, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, WarningOutlined, UndoOutlined } from "@ant-design/icons";
import {
  isBelowAlert,
  type RawMaterial,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";
import type { ProductionItem } from "@/lib/productionItems";

/** Which collection a row belongs to — routes it on save. */
type RowKind = "raw" | "production";

interface AdjustRow {
  key: string;
  id: string;
  kind: RowKind;
  name: string;
  /** Blank for production items — they have no category. */
  categoryName: string;
  unit: string;
  /** What's currently stored. undefined = never counted. */
  savedStock?: number;
  alertQty: number;
}

/** A row's stored quantity as it appears in an input. */
function savedText(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

/** Parse an edited cell. null = not a usable number. */
function parseDraft(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function Toolbar({
  search,
  onSearch,
  belowAlertOnly,
  onBelowAlertOnly,
  belowAlertCount,
  categories,
  categoryId,
  onCategory,
}: {
  search: string;
  onSearch: (value: string) => void;
  belowAlertOnly: boolean;
  onBelowAlertOnly: (value: boolean) => void;
  /** How many rows in this tab qualify, shown alongside the label. */
  belowAlertCount: number;
  categories?: RawMaterialCategory[];
  categoryId?: string;
  onCategory?: (value: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search by name"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
        />
      </div>

      <Checkbox
        checked={belowAlertOnly}
        onChange={(e) => onBelowAlertOnly(e.target.checked)}
        className="whitespace-nowrap"
      >
        <span className="text-sm text-gray-700">
          Below Alert Level
          <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            {belowAlertCount}
          </span>
        </span>
      </Checkbox>

      {categories && onCategory && (
        <Select
          className="min-w-[190px]"
          value={categoryId || ""}
          onChange={onCategory}
          aria-label="Filter by category"
          options={[
            { value: "", label: "All Categories" },
            ...categories.map((c) => ({ value: String(c._id), label: c.name })),
          ]}
        />
      )}
    </div>
  );
}

export default function AdjustmentPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Shared across both tabs, like the search term.
  const [belowAlertOnly, setBelowAlertOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();

  // Edits live here until saved, keyed by row key. Only *changed* rows get an
  // entry, so a cell with no entry simply renders its stored value — there is
  // no draft state to seed or re-sync when the data reloads.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [mRes, pRes, cRes] = await Promise.all([
        fetch("/api/inventory/raw-materials", { cache: "no-store" }),
        fetch("/api/inventory/production-items", { cache: "no-store" }),
        fetch("/api/inventory/categories", { cache: "no-store" }),
      ]);
      const [mData, pData, cData] = await Promise.all([
        mRes.json(),
        pRes.json(),
        cRes.json(),
      ]);
      if (mData.success) setMaterials(mData.materials ?? []);
      if (pData.success) setItems(pData.items ?? []);
      if (cData.success) setCategories(cData.categories ?? []);
    } catch {
      // Leave whatever is on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const term = search.trim().toLowerCase();

  const materialRows = useMemo<AdjustRow[]>(
    () =>
      materials
        .filter((m) => !term || m.name.toLowerCase().includes(term))
        .filter((m) => !categoryId || m.categoryId === categoryId)
        // Filters on the SAVED quantity, not the draft: a row you are part-way
        // through fixing must not vanish under the cursor as you type.
        .filter((m) => !belowAlertOnly || isBelowAlert(m.currentStock, m.alertQty))
        .map((m) => ({
          key: `raw:${m._id}`,
          id: String(m._id),
          kind: "raw" as const,
          name: m.name,
          categoryName: m.categoryName ?? "",
          unit: m.consumptionUnit,
          savedStock: m.currentStock,
          alertQty: m.alertQty,
        })),
    [materials, term, categoryId, belowAlertOnly],
  );

  const itemRows = useMemo<AdjustRow[]>(
    () =>
      items
        .filter((i) => !term || i.name.toLowerCase().includes(term))
        .filter((i) => !belowAlertOnly || isBelowAlert(i.currentStock, i.alertQty))
        .map((i) => ({
          key: `production:${i._id}`,
          id: String(i._id),
          kind: "production" as const,
          name: i.name,
          categoryName: "",
          unit: i.consumptionUnit,
          savedStock: i.currentStock,
          alertQty: i.alertQty ?? 0,
        })),
    [items, term, belowAlertOnly],
  );

  const belowAlertCounts = useMemo(
    () => ({
      raw: materials.filter((m) => isBelowAlert(m.currentStock, m.alertQty))
        .length,
      production: items.filter((i) => isBelowAlert(i.currentStock, i.alertQty))
        .length,
    }),
    [materials, items],
  );

  /**
   * Rows whose draft differs from what's stored.
   *
   * Built from ALL rows, not the filtered ones — an edit made before you
   * changed the search must still be saved, not quietly abandoned because it
   * scrolled out of view.
   */
  const allRows = useMemo(
    () => [
      ...materials.map((m) => ({
        key: `raw:${m._id}`,
        id: String(m._id),
        kind: "raw" as const,
        name: m.name,
        savedStock: m.currentStock,
      })),
      ...items.map((i) => ({
        key: `production:${i._id}`,
        id: String(i._id),
        kind: "production" as const,
        name: i.name,
        savedStock: i.currentStock,
      })),
    ],
    [materials, items],
  );

  const changed = useMemo(
    () =>
      allRows.filter(
        (row) =>
          drafts[row.key] !== undefined &&
          drafts[row.key] !== savedText(row.savedStock),
      ),
    [allRows, drafts],
  );

  const invalid = useMemo(
    () => changed.filter((row) => parseDraft(drafts[row.key]) === null),
    [changed, drafts],
  );

  const dirtyCount = changed.length;

  // Browsers only honour this after a real interaction, but it turns an
  // accidental tab close into a prompt rather than silent data loss.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  const setDraft = (key: string, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const discardAll = () => {
    setDrafts({});
    messageApi.info("Changes discarded");
  };

  const handleSave = async () => {
    if (dirtyCount === 0) return;
    if (invalid.length > 0) {
      messageApi.error(
        `Fix ${invalid.length} invalid quantit${invalid.length === 1 ? "y" : "ies"} first — they must be 0 or more.`,
      );
      return;
    }

    setSaving(true);
    try {
      const updates = changed.map((row) => ({
        kind: row.kind,
        id: row.id,
        currentStock: parseDraft(drafts[row.key]),
      }));

      const res = await fetch("/api/inventory/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? "Could not save");
        return;
      }

      // Fold the saved values into local state and clear the drafts, so the
      // page settles without a refetch wiping anything still being typed.
      const byKey = new Map(
        changed.map((row) => [row.key, parseDraft(drafts[row.key]) as number]),
      );
      setMaterials((current) =>
        current.map((m) => {
          const next = byKey.get(`raw:${m._id}`);
          return next === undefined ? m : { ...m, currentStock: next };
        }),
      );
      setItems((current) =>
        current.map((i) => {
          const next = byKey.get(`production:${i._id}`);
          return next === undefined ? i : { ...i, currentStock: next };
        }),
      );
      setDrafts({});

      const suffix = data.rejected?.length
        ? `, ${data.rejected.length} rejected`
        : "";
      messageApi.success(`Saved ${data.saved} quantit${data.saved === 1 ? "y" : "ies"}${suffix}`);
    } catch {
      messageApi.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const buildColumns = (showCategory: boolean): ColumnsType<AdjustRow> => [
    {
      title: "Name",
      dataIndex: "name",
      render: (value: string) => (
        <span className="font-medium text-gray-900">{value}</span>
      ),
    },
    ...(showCategory
      ? [
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
          } as ColumnsType<AdjustRow>[number],
        ]
      : []),
    {
      title: "Qty Remaining",
      dataIndex: "savedStock",
      align: "right",
      width: 280,
      render: (_: number | undefined, row) => {
        const draft = drafts[row.key];
        const text = draft ?? savedText(row.savedStock);
        const isDirty = draft !== undefined && draft !== savedText(row.savedStock);
        const parsed = parseDraft(text);
        const isInvalid = isDirty && parsed === null;
        const low = isBelowAlert(parsed ?? row.savedStock, row.alertQty);

        return (
          <span className="inline-flex items-center justify-end gap-2">
            {low && !isInvalid && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                <WarningOutlined /> Low
              </span>
            )}
            {isDirty && !isInvalid && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                title="Unsaved change"
                aria-label="Unsaved change"
              />
            )}
            <input
              value={text}
              onChange={(e) => setDraft(row.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDrafts((current) => {
                    const next = { ...current };
                    delete next[row.key];
                    return next;
                  });
                  e.currentTarget.blur();
                }
              }}
              inputMode="decimal"
              placeholder="Not counted"
              aria-label={`Quantity remaining for ${row.name}`}
              aria-invalid={isInvalid || undefined}
              className={`w-28 rounded-lg border py-1 px-2 text-right text-sm tabular-nums outline-none transition-colors ${
                isInvalid
                  ? "border-red-400 ring-1 ring-red-300"
                  : isDirty
                    ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200"
                    : "border-gray-300 hover:border-gray-400 focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
              }`}
            />
            <span className="w-10 text-left text-sm text-gray-600">
              {row.unit}
            </span>
          </span>
        );
      },
    },
    {
      title: "Alert Qty",
      dataIndex: "alertQty",
      align: "right",
      width: 150,
      sorter: (a, b) => a.alertQty - b.alertQty,
      render: (value: number, row) =>
        value > 0 ? (
          <span className="whitespace-nowrap tabular-nums text-gray-600">
            {value.toLocaleString("en-IN")} {row.unit}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Not set</span>
        ),
    },
  ];

  const renderTable = (
    rows: AdjustRow[],
    showCategory: boolean,
    emptyText: string,
  ) => (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <Table<AdjustRow>
        rowKey="key"
        columns={buildColumns(showCategory)}
        dataSource={rows}
        loading={loading}
        scroll={{ x: "max-content" }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
        }}
        locale={{
          emptyText: (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-gray-900">{emptyText}</p>
            </div>
          ),
        }}
      />
    </div>
  );

  const tabLabel = (label: string, rows: AdjustRow[], kind: RowKind) => {
    const dirty = changed.filter((c) => c.kind === kind).length;
    return (
      <span className="inline-flex items-center gap-2">
        {label}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {rows.length}
        </span>
        {dirty > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {dirty} edited
          </span>
        )}
      </span>
    );
  };

  return (
    // Bottom padding clears the sticky save bar so the last row stays reachable.
    <div className={dirtyCount > 0 ? "pb-24" : ""}>
      {messageContextHolder}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
          Adjustment
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Set how much of each item is on hand. Edit as many rows as you like,
          across both tabs, then press Save — nothing is written until you do.
          Saved quantities appear on{" "}
          <Link
            href="/inventory-management/stocks"
            className="font-medium text-[#024731] hover:underline"
          >
            Stocks
          </Link>
          .
        </p>
      </div>

      <div className="mt-5">
        <Tabs
          defaultActiveKey="raw"
          items={[
            {
              key: "raw",
              label: tabLabel("Raw Material", materialRows, "raw"),
              children: (
                <>
                  <Toolbar
                    search={search}
                    onSearch={setSearch}
                    belowAlertOnly={belowAlertOnly}
                    onBelowAlertOnly={setBelowAlertOnly}
                    belowAlertCount={belowAlertCounts.raw}
                    categories={categories}
                    categoryId={categoryId}
                    onCategory={setCategoryId}
                  />
                  {renderTable(
                    materialRows,
                    true,
                    term || categoryId || belowAlertOnly
                      ? "No raw materials match those filters"
                      : "No raw materials yet",
                  )}
                </>
              ),
            },
            {
              key: "production",
              label: tabLabel("Production Items", itemRows, "production"),
              children: (
                <>
                  <Toolbar
                    search={search}
                    onSearch={setSearch}
                    belowAlertOnly={belowAlertOnly}
                    onBelowAlertOnly={setBelowAlertOnly}
                    belowAlertCount={belowAlertCounts.production}
                  />
                  {renderTable(
                    itemRows,
                    false,
                    term || belowAlertOnly
                      ? "No production items match those filters"
                      : "No production items yet",
                  )}
                </>
              ),
            },
          ]}
        />
      </div>

      {/* Sticky action bar — appears only once something has changed, and
          counts edits across BOTH tabs so nothing is saved by surprise or
          forgotten on the tab you're not looking at. */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] md:left-56">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium text-gray-900">
                {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
              </span>
              {invalid.length > 0 && (
                <span className="ml-2 text-red-600">
                  · {invalid.length} invalid — quantities must be 0 or more
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardAll}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <UndoOutlined />
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || invalid.length > 0}
                className="rounded-lg bg-[#1c1c1c] px-5 py-2 text-sm font-medium text-white hover:bg-[#024731] disabled:opacity-50 transition-colors"
              >
                {saving
                  ? "Saving…"
                  : `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
