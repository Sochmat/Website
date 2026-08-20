"use client";

import { useCallback, useEffect, useState } from "react";
import { Drawer, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  AuditEntry,
  AuditKind,
  AuditLine,
  AuditSummary,
  AuditType,
} from "@/lib/stockAudits";
import { formatCurrency } from "@/lib/rawMaterials";
import VarianceTag, { StockQty, formatQty } from "./VarianceTag";

/** "27 Jul 2026, 4:35 pm" in IST, wherever the browser happens to be. */
function formatSavedAt(iso: string): string {
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

function qtyCell(value: number, unit: string, strong = false) {
  return <StockQty value={value} unit={unit} strong={strong} />;
}

/** The "before" side, shared by both histories. */
const PREVIOUS_COLUMN: ColumnsType<AuditLine>[number] = {
  title: "Qty Remaining",
  dataIndex: "previousStock",
  align: "right",
  width: 150,
  render: (value: number | null, line) =>
    value === null ? (
      <span className="text-xs text-gray-400">Not tracked</span>
    ) : (
      qtyCell(value, line.unit)
    ),
};

/** "at ₹90.00 per kg", when the rate was captured with the line. */
function rateHint(line: AuditLine): string | undefined {
  return line.unitCost
    ? `${formatCurrency(line.unitCost)} per ${line.unit}`
    : undefined;
}

/** Nothing to show, said in the way that explains why. */
function noCost(line: AuditLine) {
  return line.unitCost ? (
    <span className="text-xs text-gray-400">—</span>
  ) : (
    <span
      className="text-xs text-gray-400"
      title="No price was on record for this item when the save was made"
    >
      No price
    </span>
  );
}

const NAME_COLUMN: ColumnsType<AuditLine>[number] = {
  title: "Item",
  dataIndex: "name",
  render: (value: string) => (
    <span className="font-medium text-gray-900">{value || "—"}</span>
  ),
};

/** A stock-take reads as "what we had → what we counted → the gap". */
const AUDIT_COLUMNS: ColumnsType<AuditLine> = [
  NAME_COLUMN,
  PREVIOUS_COLUMN,
  {
    title: "Closing Stock",
    dataIndex: "closingStock",
    align: "right",
    width: 150,
    render: (value: number, line) => qtyCell(value, line.unit, true),
  },
  {
    title: "% Difference",
    key: "difference",
    align: "right",
    width: 200,
    render: (_: unknown, line) => (
      <VarianceTag diff={line.diff} pctDiff={line.pctDiff} unit={line.unit} />
    ),
  },
  {
    // Priced when the save was made, not today — see AuditLine.unitCost.
    title: "Cost",
    dataIndex: "changeCost",
    align: "right",
    width: 150,
    render: (value: number | null, line) => {
      if (value === null) return noCost(line);
      if (value === 0) {
        return (
          <span
            className="whitespace-nowrap text-sm tabular-nums text-gray-500"
            title={rateHint(line)}
          >
            {formatCurrency(0)}
          </span>
        );
      }
      const surplus = value > 0;
      return (
        <span
          className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
            surplus ? "text-green-700" : "text-red-700"
          }`}
          title={rateHint(line)}
        >
          {surplus ? "+" : "−"}
          {formatCurrency(Math.abs(value))}
        </span>
      );
    },
  },
];

/** An addition reads as "what we had → what came in → what we have now". */
const ADDITION_COLUMNS: ColumnsType<AuditLine> = [
  NAME_COLUMN,
  PREVIOUS_COLUMN,
  {
    title: "Added",
    dataIndex: "addedQty",
    align: "right",
    width: 150,
    render: (value: number | null, line) => (
      <span className="whitespace-nowrap rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-green-700">
        +{formatQty(value ?? line.diff ?? 0)} {line.unit}
      </span>
    ),
  },
  {
    title: "Updated Qty",
    dataIndex: "closingStock",
    align: "right",
    width: 150,
    render: (value: number, line) => qtyCell(value, line.unit, true),
  },
  {
    // What came in was worth — priced when the save was made, not today.
    title: "Cost",
    dataIndex: "changeCost",
    align: "right",
    width: 150,
    render: (value: number | null, line) =>
      value === null ? (
        noCost(line)
      ) : (
        <span
          className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-900"
          title={rateHint(line)}
        >
          {formatCurrency(value)}
        </span>
      ),
  },
];

/** Raw material spent by a production run: what went out, and what it cost. */
const CONSUMED_COLUMNS: ColumnsType<AuditLine> = [
  NAME_COLUMN,
  PREVIOUS_COLUMN,
  {
    title: "Deducted",
    dataIndex: "consumedQty",
    align: "right",
    width: 170,
    render: (value: number | null, line) => (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-red-700">
          −{formatQty(value ?? 0)} {line.unit}
        </span>
        {!!line.shortfall && (
          <span
            className="text-[11px] font-medium text-amber-700"
            title="The recipe called for more than was on record, so the quantity stopped at zero"
          >
            {formatQty(line.shortfall)} {line.unit} short
          </span>
        )}
      </span>
    ),
  },
  {
    title: "Updated Qty",
    dataIndex: "closingStock",
    align: "right",
    width: 150,
    render: (value: number, line) => qtyCell(value, line.unit, true),
  },
  {
    title: "Cost",
    dataIndex: "changeCost",
    align: "right",
    width: 150,
    render: (value: number | null, line) =>
      value === null ? (
        noCost(line)
      ) : (
        <span
          className="whitespace-nowrap text-sm font-medium tabular-nums text-gray-900"
          title={rateHint(line)}
        >
          {formatCurrency(Math.abs(value))}
        </span>
      ),
  },
];

/**
 * Every save made from one stock screen, for one kind, newest first.
 *
 * Scoped to a single kind and type by design: raw materials and production
 * items are saved separately, and a stock-take is a different event from a
 * delivery — none of those histories should interleave.
 *
 * The list carries only headline counts; a save's per-item lines are fetched
 * the first time you expand it and then kept, so re-opening a row is instant
 * and a long history never pulls thousands of lines it may not show.
 */
export default function StockHistoryDrawer({
  open,
  kind,
  type,
  title,
  onClose,
}: {
  open: boolean;
  kind: AuditKind;
  type: AuditType;
  /** The tab this history belongs to, e.g. "Raw Material". */
  title: string;
  onClose: () => void;
}) {
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<Record<string, AuditEntry>>({});
  const [loadingDetail, setLoadingDetail] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string[]>([]);

  const isAddition = type === "addition";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/inventory/stock-audits?kind=${kind}&type=${type}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? "Could not load history");
        return;
      }
      setAudits(data.audits ?? []);
    } catch {
      setError("Network error — could not load history");
    } finally {
      setLoading(false);
    }
  }, [kind, type]);

  // Fetch on open, and again on re-open: a save made since the last look
  // should be there when you come back.
  useEffect(() => {
    if (!open) return;
    setExpanded([]);
    load();
  }, [open, load]);

  const loadDetail = async (id: string) => {
    if (details[id] || loadingDetail[id]) return;
    setLoadingDetail((current) => ({ ...current, [id]: true }));
    try {
      const res = await fetch(`/api/inventory/stock-audits/${id}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        setDetails((current) => ({ ...current, [id]: data.audit }));
      }
    } catch {
      // Leave the row expandable — reopening it retries.
    } finally {
      setLoadingDetail((current) => ({ ...current, [id]: false }));
    }
  };

  const columns: ColumnsType<AuditSummary> = [
    {
      title: "Saved",
      dataIndex: "savedAt",
      render: (value: string, row) => (
        <div>
          <div className="font-medium text-gray-900">{formatSavedAt(value)}</div>
          <div className="text-xs text-gray-500">
            {row.rowCount} item{row.rowCount === 1 ? "" : "s"} · {row.savedByRole}
          </div>
        </div>
      ),
    },
    {
      // The save's bottom line: a stock-take nets gains against losses, a
      // delivery totals what arrived.
      title: isAddition ? "Worth" : "Net",
      key: "netCost",
      align: "right",
      width: 140,
      render: (_: unknown, row) => {
        if (row.netCost === null) {
          return <span className="text-xs text-gray-400">Not valued</span>;
        }
        const positive = row.netCost > 0;
        return (
          <div>
            <span
              className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
                isAddition
                  ? "text-gray-900"
                  : row.netCost === 0
                    ? "text-gray-500"
                    : positive
                      ? "text-green-700"
                      : "text-red-700"
              }`}
            >
              {!isAddition && row.netCost !== 0 && (positive ? "+" : "−")}
              {formatCurrency(Math.abs(row.netCost))}
            </span>
            {row.unvaluedRows > 0 && (
              <div
                className="text-[11px] text-gray-400"
                title="Rows with no price, or nothing to compare against, are left out of this total"
              >
                {row.unvaluedRows} not valued
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Outcome",
      key: "outcome",
      align: "right",
      width: 260,
      render: (_: unknown, row) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {row.increases > 0 && (
            <span className="rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
              {row.increases} {isAddition ? "topped up" : "up"}
            </span>
          )}
          {row.decreases > 0 && (
            <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              {row.decreases} down
            </span>
          )}
          {row.unchanged > 0 && (
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
              {row.unchanged} no change
            </span>
          )}
          {row.firstCounts > 0 && (
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
              {row.firstCounts} {isAddition ? "newly tracked" : "first count"}
            </span>
          )}
          {row.consumedRows > 0 && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              {row.consumedRows} raw deducted
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${title} — ${isAddition ? "stock additions" : "audit history"}`}
      // Wide enough for the line detail on a desktop, never wider than a phone.
      width="min(880px, 100vw)"
      destroyOnHidden
    >
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="mb-3 text-sm text-gray-600">
        One row per save. Expand a row to see every item it covered, with the
        quantity it {isAddition ? "was added to" : "replaced"}.
      </p>

      <Table<AuditSummary>
        rowKey="_id"
        columns={columns}
        dataSource={audits}
        loading={loading}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        expandable={{
          expandedRowKeys: expanded,
          onExpandedRowsChange: (keys) => setExpanded(keys as string[]),
          onExpand: (isExpanded, row) => {
            if (isExpanded) loadDetail(row._id);
          },
          expandedRowRender: (row) => {
            const consumed = details[row._id]?.consumedLines ?? [];
            return (
              <>
                <Table<AuditLine>
                  rowKey="id"
                  columns={isAddition ? ADDITION_COLUMNS : AUDIT_COLUMNS}
                  dataSource={details[row._id]?.lines ?? []}
                  loading={!!loadingDetail[row._id]}
                  size="small"
                  pagination={
                    (details[row._id]?.lines.length ?? 0) > 10
                      ? { pageSize: 10, showSizeChanger: false }
                      : false
                  }
                />

                {/* Making something spends what it is made from, so the
                    ingredients this save drew down are shown with it. */}
                {consumed.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Raw materials deducted
                    </p>
                    <Table<AuditLine>
                      rowKey="id"
                      columns={CONSUMED_COLUMNS}
                      dataSource={consumed}
                      size="small"
                      pagination={
                        consumed.length > 10
                          ? { pageSize: 10, showSizeChanger: false }
                          : false
                      }
                    />
                  </div>
                )}
              </>
            );
          },
        }}
        locale={{
          emptyText: (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-gray-900">No saves yet</p>
              <p className="mt-1 text-sm text-gray-600">
                Every {title.toLowerCase()}{" "}
                {isAddition ? "stock addition" : "audit save"} from this screen
                will be listed here.
              </p>
            </div>
          ),
        }}
      />
    </Drawer>
  );
}
