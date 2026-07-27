"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Select, Tabs, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, WarningOutlined } from "@ant-design/icons";
import {
  isBelowAlert,
  type RawMaterial,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";
import type { ProductionItem } from "@/lib/productionItems";

/** One row of either tab, flattened so both tables share a renderer. */
interface StockRow {
  key: string;
  name: string;
  /** Blank for production items — they have no category. */
  categoryName: string;
  unit: string;
  currentStock?: number;
  alertQty: number;
  low: boolean;
}

/**
 * Quantity cell.
 *
 * Red only when stock is genuinely tracked AND at or below a threshold that
 * was actually set. Untracked stock reads "Not tracked" in grey rather than
 * rendering as a red zero — an unknown quantity is not a critical one.
 */
function QtyCell({ row }: { row: StockRow }) {
  if (typeof row.currentStock !== "number") {
    return <span className="text-sm text-gray-400">Not tracked</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums ${
        row.low ? "font-semibold text-red-600" : "text-gray-800"
      }`}
    >
      {row.low && <WarningOutlined aria-hidden="true" />}
      {row.currentStock.toLocaleString("en-IN")} {row.unit}
    </span>
  );
}

/**
 * Filters for a stock tab, rendered inside the tab panel so it sits below the
 * tab strip. The category select is omitted on the production tab — those
 * items have no category.
 */
function Toolbar({
  search,
  onSearch,
  categories,
  categoryId,
  onCategory,
}: {
  search: string;
  onSearch: (value: string) => void;
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
          aria-label="Search stocks by name"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
        />
      </div>

      {categories && onCategory && (
        <Select
          className="min-w-[190px]"
          value={categoryId || ""}
          onChange={onCategory}
          aria-label="Filter by category"
          options={[
            { value: "", label: "All Categories" },
            ...categories.map((c) => ({
              value: String(c._id),
              label: c.name,
            })),
          ]}
        />
      )}
    </div>
  );
}

function StockTable({
  rows,
  loading,
  showCategory,
  emptyText,
}: {
  rows: StockRow[];
  loading: boolean;
  showCategory: boolean;
  emptyText: string;
}) {
  const columns: ColumnsType<StockRow> = [
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
          } as ColumnsType<StockRow>[number],
        ]
      : []),
    {
      title: "Qty Remaining",
      dataIndex: "currentStock",
      align: "right",
      width: 190,
      // Untracked rows sort to the bottom rather than mixing in as zeros.
      sorter: (a, b) =>
        (a.currentStock ?? Number.POSITIVE_INFINITY) -
        (b.currentStock ?? Number.POSITIVE_INFINITY),
      render: (_: number | undefined, row) => <QtyCell row={row} />,
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <Table<StockRow>
        rowKey="key"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: "max-content" }}
        rowClassName={(row) => (row.low ? "bg-red-50/60" : "")}
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
}

export default function StocksPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Raw-material tab only — production items have no category.
  const [categoryId, setCategoryId] = useState("");

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

  const materialRows = useMemo<StockRow[]>(
    () =>
      materials
        .filter((m) => !term || m.name.toLowerCase().includes(term))
        .filter((m) => !categoryId || m.categoryId === categoryId)
        .map((m) => ({
          key: String(m._id),
          name: m.name,
          categoryName: m.categoryName ?? "",
          unit: m.consumptionUnit,
          currentStock: m.currentStock,
          alertQty: m.alertQty,
          low: isBelowAlert(m.currentStock, m.alertQty),
        })),
    [materials, term, categoryId],
  );

  const itemRows = useMemo<StockRow[]>(
    () =>
      items
        .filter((i) => !term || i.name.toLowerCase().includes(term))
        .map((i) => ({
          key: String(i._id),
          name: i.name,
          categoryName: "",
          unit: i.consumptionUnit,
          currentStock: i.currentStock,
          alertQty: i.alertQty ?? 0,
          low: isBelowAlert(i.currentStock, i.alertQty),
        })),
    [items, term],
  );

  const lowCount =
    materialRows.filter((r) => r.low).length +
    itemRows.filter((r) => r.low).length;
  // Stock is written by the Audit screen, which isn't built yet — say so
  // once rather than leaving a page full of "Not tracked" unexplained.
  const anyTracked = [...materialRows, ...itemRows].some(
    (r) => typeof r.currentStock === "number",
  );

  const tabLabel = (label: string, rows: StockRow[]) => {
    const low = rows.filter((r) => r.low).length;
    return (
      <span className="inline-flex items-center gap-2">
        {label}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {rows.length}
        </span>
        {low > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            {low} low
          </span>
        )}
      </span>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
            Stocks
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Quantity remaining for each raw material and production item.
            Anything at or below its alert qty is shown in red.
          </p>
        </div>
        {lowCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm font-medium text-red-700">
            <WarningOutlined />
            {lowCount} item{lowCount === 1 ? "" : "s"} low on stock
          </span>
        )}
      </div>

      {!loading && !anyTracked && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          No stock quantities have been recorded yet, so every row reads “Not
          tracked”. Quantities will appear here once the Audit screen is
          in place.
        </div>
      )}

      <div className="mt-5">
        <Tabs
          defaultActiveKey="raw"
          items={[
            {
              key: "raw",
              label: tabLabel("Raw Material", materialRows),
              children: (
                <>
                  <Toolbar
                    search={search}
                    onSearch={setSearch}
                    categories={categories}
                    categoryId={categoryId}
                    onCategory={setCategoryId}
                  />
                  <StockTable
                    rows={materialRows}
                    loading={loading}
                    showCategory
                    emptyText={
                      term || categoryId
                        ? "No raw materials match those filters"
                        : "No raw materials yet"
                    }
                  />
                </>
              ),
            },
            {
              key: "production",
              label: tabLabel("Production Items", itemRows),
              children: (
                <>
                  <Toolbar search={search} onSearch={setSearch} />
                  <StockTable
                    rows={itemRows}
                    loading={loading}
                    showCategory={false}
                    emptyText={
                      term
                        ? "No production items match that search"
                        : "No production items yet"
                    }
                  />
                </>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
