"use client";

import { useCallback, useEffect, useState } from "react";
import { DatePicker, Table, Tabs, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { FallOutlined, SearchOutlined } from "@ant-design/icons";
import { istToday } from "@/lib/ist";
import { formatCurrency } from "@/lib/rawMaterials";
import { StockQty, formatQty } from "@/components/inventory/VarianceTag";
import type { AuditKind } from "@/lib/stockAudits";
import type {
  ConsumptionEvent,
  ConsumptionRow,
  ConsumptionSource,
} from "@/lib/stockConsumption";

const { RangePicker } = DatePicker;

const KIND_TABS: { key: AuditKind; label: string }[] = [
  { key: "raw", label: "Raw Material" },
  { key: "production", label: "Production Item" },
];

/** How each counter is named and coloured wherever an event is listed. */
const SOURCE_STYLE: Record<
  ConsumptionSource,
  { label: string; className: string }
> = {
  order: {
    label: "Website order",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  petpooja: {
    label: "Petpooja",
    className: "border-purple-200 bg-purple-50 text-purple-700",
  },
  production: {
    label: "Production",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  wastage: {
    label: "Wastage",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

/** "27 Jul 2026, 4:35 pm" in IST, wherever the browser happens to be. */
function formatAt(iso: string): string {
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
    {
      label: "Yesterday",
      value: [today.subtract(1, "day"), today.subtract(1, "day")],
    },
    { label: "Last 7 days", value: [today.subtract(6, "day"), today] },
    { label: "Last 30 days", value: [today.subtract(29, "day"), today] },
    { label: "This month", value: [today.startOf("month"), today] },
    { label: "Last month", value: [
      today.subtract(1, "month").startOf("month"),
      today.subtract(1, "month").endOf("month"),
    ] },
  ];
}

/** A quantity with its unit, or the reason there is no quantity to show. */
function stockCell(value: number | null, unit: string, strong = false) {
  if (value === null) {
    return (
      <span
        className="text-xs text-gray-400"
        title="Nothing has ever been counted for this item"
      >
        Not tracked
      </span>
    );
  }
  return <StockQty value={value} unit={unit} strong={strong} />;
}

/**
 * A balance cell — Opening, Closing or Current.
 *
 * A made-to-order row says so instead of showing an empty quantity. "Not
 * tracked" would be a lie by omission here: the figure is not missing, there
 * is no shelf for it to be a figure OF.
 */
function balanceCell(
  value: number | null,
  row: ConsumptionRow,
  strong = false,
) {
  if (row.onSpot) {
    return (
      <span
        className="text-xs text-gray-400"
        title="Made to order — nothing is held, so there is no balance to report"
      >
        Not stocked
      </span>
    );
  }
  return stockCell(value, row.unit, strong);
}

/** The per-event breakdown behind one item's total. */
function eventColumns(unit: string): ColumnsType<ConsumptionEvent> {
  return [
    {
      title: "When",
      dataIndex: "at",
      width: 210,
      render: (value: string) => (
        <span className="whitespace-nowrap text-sm text-gray-700">
          {formatAt(value)}
        </span>
      ),
    },
    {
      title: "Source",
      dataIndex: "source",
      width: 150,
      render: (value: ConsumptionSource) => (
        <span
          className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[value].className}`}
        >
          {SOURCE_STYLE[value].label}
        </span>
      ),
    },
    {
      title: "Reference",
      dataIndex: "label",
      render: (value: string, row) => (
        <div>
          <div className="text-sm text-gray-700">{value}</div>
          {/* What the stock was consumed FOR — only a sale can say. */}
          {!!row.soldItems?.length && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {row.soldItems.map((sold) => (
                <span
                  key={`${sold.name} ${sold.variantName ?? ""}`}
                  title={
                    sold.qty === undefined
                      ? `Consumed for ${sold.name}`
                      : `${formatQty(sold.qty)} ${unit} of this went into ${sold.name}`
                  }
                  className="inline-flex whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600"
                >
                  <span className="font-medium text-gray-800">{sold.name}</span>
                  {sold.variantName && (
                    <span className="ml-1 text-gray-500">
                      ({sold.variantName})
                    </span>
                  )}
                  {sold.qty !== undefined && (
                    <span className="ml-1 tabular-nums">
                      · {formatQty(sold.qty)} {unit}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Consumed",
      dataIndex: "qty",
      align: "right",
      width: 170,
      render: (value: number, row) => (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-red-700">
            −{formatQty(value)} {unit}
          </span>
          {row.shortfall > 0 && (
            <span
              className="text-[11px] font-medium text-amber-700"
              title="More was called for than was on record, so the quantity stopped at zero"
            >
              {formatQty(row.shortfall)} {unit} short
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Value",
      dataIndex: "cost",
      align: "right",
      width: 140,
      render: (value: number | null) =>
        value === null ? (
          <span
            className="text-xs text-gray-400"
            title="No price was on record for this item when the stock moved"
          >
            No price
          </span>
        ) : (
          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-900">
            {formatCurrency(value)}
          </span>
        ),
    },
  ];
}

/**
 * Stock Consumption: what a date range took off the shelves, and where it went.
 *
 * One row per item that lost stock, expandable into the individual events
 * behind it — a line per website order, a line per Petpooja entry, a line per
 * production run and per wastage. Nothing here is aggregated across sources,
 * because "why is this down 4 kg" is only ever answered by the breakdown.
 *
 * The balances either side are read from the movement records themselves, so
 * Opening and Closing are what the stock genuinely was at those instants, not
 * a figure inferred by subtracting the totals on screen.
 */
export default function StockConsumptionPage() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [kind, setKind] = useState<AuditKind>("raw");
  const [rows, setRows] = useState<ConsumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Defaults to today alone. What left the shelves since this morning is the
  // question the kitchen actually opens this page with; a wider range is one
  // preset away, and starting wide buries today's figures among last week's.
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const today = dayjs(istToday(new Date()));
    return [today, today];
  });

  const from = pickedDate(range[0]);
  const to = pickedDate(range[1]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/inventory/stock-consumption?kind=${kind}&from=${from}&to=${to}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? "Could not load consumption");
        return;
      }
      setRows(data.rows ?? []);
    } catch {
      messageApi.error("Network error — could not load consumption");
    } finally {
      setLoading(false);
    }
  }, [kind, from, to, messageApi]);

  useEffect(() => {
    load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const visible = term
    ? rows.filter((row) => row.name.toLowerCase().includes(term))
    : rows;

  // Only the rows on screen are totalled, so the figure always answers the
  // question the current filter asks.
  const totalCost = visible.reduce((sum, row) => sum + (row.totalCost ?? 0), 0);
  const unvalued = visible.reduce((sum, row) => sum + row.unvaluedEvents, 0);
  const totalEvents = visible.reduce((sum, row) => sum + row.events.length, 0);

  const columns: ColumnsType<ConsumptionRow> = [
    {
      title: "Item",
      dataIndex: "name",
      // Not sortable. buildConsumptionRows already returns rows by name, so
      // the column reads the same as it always did — this only takes away a
      // header that re-sorted into the order it was already in.
      render: (value: string, row) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{value || "—"}</span>
            {/* Says why the three balance columns on this row are empty, and
                why its Consumed figure is a quantity MADE rather than taken. */}
            {row.onSpot && (
              <span
                className="inline-flex whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700"
                title="Made to order — no stock is held, so there is no balance either side. Its raw material was deducted on the Raw Material tab."
              >
                on spot
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {row.events.length} event{row.events.length === 1 ? "" : "s"}
          </div>
        </div>
      ),
    },
    {
      title: "Opening",
      dataIndex: "openingStock",
      align: "right",
      width: 150,
      render: (value: number | null, row) => balanceCell(value, row),
    },
    {
      title: "Added",
      dataIndex: "totalAdded",
      align: "right",
      width: 150,
      sorter: (a, b) => a.totalAdded - b.totalAdded,
      render: (value: number, row) =>
        // Most rows received nothing; a column of green zeroes would drown the
        // few that did, so only a real delivery is coloured in.
        value > 0 ? (
          <span className="whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-emerald-700">
            +{formatQty(value)} {row.unit}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        ),
    },
    {
      title: "Consumed",
      dataIndex: "totalQty",
      align: "right",
      width: 160,
      sorter: (a, b) => a.totalQty - b.totalQty,
      render: (value: number, row) =>
        // A made-to-order quantity was MADE, not taken off anything, so it
        // carries no minus sign — printing one would claim a draw-down that
        // never happened, against a shelf that does not exist.
        row.onSpot ? (
          <span
            className="whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-indigo-700"
            title="Made to order over this range. Its ingredients were deducted on the Raw Material tab."
          >
            {formatQty(value)} {row.unit}
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-red-700">
            −{formatQty(value)} {row.unit}
          </span>
        ),
    },
    {
      title: "Value",
      dataIndex: "totalCost",
      align: "right",
      width: 150,
      sorter: (a, b) => (a.totalCost ?? 0) - (b.totalCost ?? 0),
      render: (value: number | null, row) => (
        <div>
          {value === null ? (
            <span
              className="text-xs text-gray-400"
              title="No price was on record for this item when the stock moved"
            >
              No price
            </span>
          ) : (
            <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900">
              {formatCurrency(value)}
            </span>
          )}
          {value !== null && row.unvaluedEvents > 0 && (
            <div
              className="text-[11px] text-gray-400"
              title="Events with no price on record are left out of this total"
            >
              {row.unvaluedEvents} unpriced
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Closing",
      dataIndex: "closingStock",
      align: "right",
      width: 150,
      render: (value: number | null, row) => balanceCell(value, row),
    },
    {
      title: "Current",
      dataIndex: "currentStock",
      align: "right",
      width: 150,
      render: (value: number | null, row) => balanceCell(value, row, true),
    },
  ];

  const table = (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <Table<ConsumptionRow>
        rowKey="id"
        columns={columns}
        dataSource={visible}
        loading={loading}
        scroll={{ x: "max-content" }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total, shown) => `${shown[0]}–${shown[1]} of ${total}`,
        }}
        expandable={{
          // Every event is already in hand, so expanding is instant and needs
          // no second request.
          expandedRowRender: (row) => (
            <Table<ConsumptionEvent>
              rowKey="id"
              columns={eventColumns(row.unit)}
              dataSource={row.events}
              size="small"
              pagination={
                row.events.length > 10
                  ? { pageSize: 10, showSizeChanger: false }
                  : false
              }
            />
          ),
        }}
        locale={{
          emptyText: (
            <div className="py-10 text-center">
              <FallOutlined className="text-2xl text-gray-300" />
              <p className="mt-2 text-sm font-medium text-gray-900">
                {term
                  ? "No item matches that search"
                  : "Nothing was consumed in this range"}
              </p>
              {!term && (
                <p className="mt-1 text-sm text-gray-500">
                  Pick a wider date range, or check that orders have been marked
                  delivered.
                </p>
              )}
            </div>
          ),
        }}
      />
    </div>
  );

  return (
    <div>
      {messageContextHolder}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
          Stock Consumption
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Everything that left the shelves over a date range, item by item.
          Expand a row to see each deduction on its own — one line per delivered
          website order, one per Petpooja entry, plus the production runs and
          wastage that spent the same stock. Opening is what was on record the
          instant before the range began; Added is stock received over the
          range, which is why Closing is not simply Opening minus Consumed;
          Current is what is on record now. Made-to-order items appear with the
          quantity made and no balances — nothing is held for them, and their
          ingredients are deducted on the Raw Material tab.
        </p>
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search consumed items by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>

        <RangePicker
          value={range}
          onChange={(value) => {
            // Half-picked while the panel is still open, or cleared — neither
            // is a range worth refetching for, so the last one stands.
            if (value?.[0] && value?.[1]) setRange([value[0], value[1]]);
          }}
          presets={datePresets()}
          format="D MMM YY"
          allowClear={false}
          placeholder={["From", "To"]}
          aria-label="Consumption date range"
          maxDate={dayjs(istToday(new Date()))}
        />

        <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <span className="text-gray-600">
            {visible.length} item{visible.length === 1 ? "" : "s"} ·{" "}
            {totalEvents} event{totalEvents === 1 ? "" : "s"} ·
          </span>
          <span className="font-semibold tabular-nums text-gray-900">
            {formatCurrency(totalCost)}
          </span>
          {unvalued > 0 && (
            <span
              className="text-xs text-gray-400"
              title="Events with no price on record are not included in the total"
            >
              ({unvalued} unpriced)
            </span>
          )}
        </span>
      </div>

      <Tabs
        activeKey={kind}
        onChange={(key) => {
          // Blanked deliberately: the two tabs count different shelves, and
          // showing the old one's rows under the new one's heading while the
          // fetch is in flight reads as an answer when it is not.
          setRows([]);
          setKind(key as AuditKind);
        }}
        items={KIND_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          children: table,
        }))}
      />
    </div>
  );
}
