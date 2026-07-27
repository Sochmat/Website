"use client";

import { Checkbox, Select } from "antd";
import { SearchOutlined, HistoryOutlined } from "@ant-design/icons";
import type { RawMaterialCategory } from "@/lib/rawMaterials";

/**
 * Filters above a stock table, plus the way into that tab's history.
 *
 * Shared by the Audit and Add Stock screens so the two read identically; the
 * category filter appears only where it applies (raw materials).
 */
export default function StockToolbar({
  search,
  onSearch,
  belowAlertOnly,
  onBelowAlertOnly,
  belowAlertCount,
  categories,
  categoryId,
  onCategory,
  onHistory,
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
  /** Opens this tab's own save history. */
  onHistory: () => void;
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

      <button
        type="button"
        onClick={onHistory}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <HistoryOutlined />
        History
      </button>
    </div>
  );
}
