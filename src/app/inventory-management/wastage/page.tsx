"use client";

import { useCallback, useEffect, useState } from "react";
import { DatePicker, Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { DeleteOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { istToday, toIstDate } from "@/lib/ist";
import { formatCurrency } from "@/lib/rawMaterials";
import type { WastageEntry, WastageKind } from "@/lib/wastage";
import { formatQty } from "@/components/inventory/VarianceTag";
import WastageFormModal from "@/components/inventory/WastageFormModal";
import { useStockRows } from "@/components/inventory/useStockRows";

const { RangePicker } = DatePicker;

const KIND_LABEL: Record<WastageKind, string> = {
  raw: "Raw Material",
  production: "Production Item",
};

/** A picked day as the yyyy-mm-dd the user meant, free of the browser's zone. */
function pickedDate(value: Dayjs): string {
  return value.format("YYYY-MM-DD");
}

/**
 * Quick ranges offered inside the picker, anchored to the IST day rather than
 * the browser's — the kitchen's "today" is the only today that matters here.
 */
function datePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs(istToday(new Date()));
  return [
    { label: "Today", value: [today, today] },
    { label: "Yesterday", value: [today.subtract(1, "day"), today.subtract(1, "day")] },
    { label: "Last 7 days", value: [today.subtract(6, "day"), today] },
    { label: "Last 30 days", value: [today.subtract(29, "day"), today] },
    { label: "This month", value: [today.startOf("month"), today] },
  ];
}

/** "27 Jul 2026, 4:35 pm" in IST, wherever the browser happens to be. */
function formatRecordedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/**
 * Wastage: stock that was thrown away, and what it cost.
 *
 * Recording one deducts the quantity from the item's Qty Remaining straight
 * away — this is the third way stock leaves the shelf, alongside a recipe
 * consuming it and an audit correcting it.
 */
export default function WastagePage() {
  // The item list the modal picks from. `allRows` is deliberately unfiltered —
  // it is the master list of everything stock is tracked against.
  const { allRows, applySaved } = useStockRows();

  const [messageApi, messageContextHolder] = message.useMessage();
  const [wastages, setWastages] = useState<WastageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  // null = every date, which is the honest default for a log nobody has
  // filtered yet.
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  // "" = both kinds. Wastage is recorded against raw materials and production
  // items alike, so the unfiltered list mixes them.
  const [kind, setKind] = useState<WastageKind | "">("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/wastages", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setWastages(data.wastages ?? []);
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
  // Both ends are inclusive, and both sides of the comparison are IST calendar
  // dates: a wastage recorded at 1 am IST belongs to that IST day, not to the
  // UTC day its instant happens to fall on. yyyy-mm-dd compares
  // lexicographically in date order, so plain string compare is the whole test.
  const from = range ? pickedDate(range[0]) : null;
  const to = range ? pickedDate(range[1]) : null;

  const rows = wastages
    .filter((w) => !term || w.name.toLowerCase().includes(term))
    .filter((w) => !kind || w.kind === kind)
    .filter((w) => {
      if (!from || !to) return true;
      const day = toIstDate(new Date(w.recordedAt));
      return day >= from && day <= to;
    });

  const filtered = term !== "" || range !== null || kind !== "";

  // Only the rows on screen are totalled, so the figure always answers the
  // question the current filter asks.
  const totalCost = rows.reduce((sum, w) => sum + (w.cost ?? 0), 0);
  const unvalued = rows.filter((w) => w.cost === null).length;

  const handleSaved = ({
    wastage,
    updated,
  }: {
    wastage: WastageEntry;
    updated: { id: string; kind: WastageKind; currentStock: number };
  }) => {
    setModalOpen(false);
    // Prepend rather than refetch: the list is sorted newest first, and this
    // is the newest.
    setWastages((current) => [wastage, ...current]);
    // The server owns the resulting quantity — the modal's "Qty remaining"
    // hint takes it rather than recomputing its own.
    applySaved(updated.kind, new Map([[updated.id, updated.currentStock]]));
    messageApi.success(
      `Recorded ${formatQty(wastage.qty)} ${wastage.unit} of ${wastage.name} as wastage`,
    );
    // A wastage bigger than the count is worth saying out loud — the quantity
    // stopped at zero, so that item's count needs attention.
    if (wastage.shortfall > 0) {
      messageApi.warning(
        `${wastage.name} was ${formatQty(wastage.shortfall)} ${wastage.unit} short — stopped at 0. Check that count.`,
        8,
      );
    }
  };

  const columns: ColumnsType<WastageEntry> = [
    {
      title: "Date & Time",
      dataIndex: "recordedAt",
      width: 210,
      defaultSortOrder: "descend",
      sorter: (a, b) => a.recordedAt.localeCompare(b.recordedAt),
      render: (value: string) => (
        <span className="whitespace-nowrap text-sm text-gray-700">
          {formatRecordedAt(value)}
        </span>
      ),
    },
    {
      title: "Name",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (value: string, row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-gray-900">{value || "—"}</span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {KIND_LABEL[row.kind]}
          </span>
        </span>
      ),
    },
    {
      title: "Qty",
      dataIndex: "qty",
      align: "right",
      width: 130,
      sorter: (a, b) => a.qty - b.qty,
      render: (value: number) => (
        <span className="whitespace-nowrap font-medium tabular-nums text-gray-900">
          {formatQty(value)}
        </span>
      ),
    },
    {
      title: "Unit",
      dataIndex: "unit",
      width: 110,
      render: (value: string) => (
        <span className="text-sm text-gray-600">{value || "—"}</span>
      ),
    },
    {
      title: "Cost",
      dataIndex: "cost",
      align: "right",
      width: 150,
      sorter: (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
      render: (value: number | null) =>
        value === null ? (
          <span
            className="text-xs text-gray-400"
            title="No price was on record for this item when the wastage was recorded"
          >
            No price
          </span>
        ) : (
          <span className="whitespace-nowrap font-semibold tabular-nums text-red-600">
            {formatCurrency(value)}
          </span>
        ),
    },
  ];

  return (
    <div>
      {messageContextHolder}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
            Wastage
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Stock that was thrown away — spoiled, spilled or damaged. Recording
            a wastage deducts the quantity from that item&rsquo;s Qty Remaining
            straight away, and values it at the price on record at the time.
            Quantities are entered in the item&rsquo;s consumption unit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <PlusOutlined />
          Add Wastage
        </button>
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search wastages by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>

        <Select
          className="min-w-[180px]"
          value={kind}
          onChange={setKind}
          aria-label="Filter by type"
          options={[
            { value: "", label: "All types" },
            { value: "raw", label: `${KIND_LABEL.raw}s` },
            { value: "production", label: `${KIND_LABEL.production}s` },
          ]}
        />

        <RangePicker
          value={range}
          onChange={(value) =>
            // Cleared, or half-picked while the panel is still open — either
            // way there is no range to filter by yet.
            setRange(value?.[0] && value?.[1] ? [value[0], value[1]] : null)
          }
          presets={datePresets()}
          format="D MMM YY"
          allowClear
          placeholder={["From", "To"]}
          aria-label="Filter wastages by date"
          maxDate={dayjs(istToday(new Date()))}
        />

        <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <span className="text-gray-600">
            {rows.length} wastage{rows.length === 1 ? "" : "s"} ·
          </span>
          <span className="font-semibold tabular-nums text-red-600">
            {formatCurrency(totalCost)}
          </span>
          {unvalued > 0 && (
            <span
              className="text-xs text-gray-400"
              title="Rows with no price on record are not included in the total"
            >
              ({unvalued} unpriced)
            </span>
          )}
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table<WastageEntry>
          rowKey="_id"
          columns={columns}
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
                <DeleteOutlined className="text-2xl text-gray-300" />
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {filtered
                    ? "No wastage matches those filters"
                    : "No wastage recorded yet"}
                </p>
                {!filtered && (
                  <p className="mt-1 text-sm text-gray-500">
                    Use Add Wastage to record spoiled or damaged stock.
                  </p>
                )}
              </div>
            ),
          }}
        />
      </div>

      <WastageFormModal
        open={modalOpen}
        rows={allRows}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
