"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { WarningOutlined, UndoOutlined } from "@ant-design/icons";
import { isBelowAlert } from "@/lib/rawMaterials";
import type { AuditKind } from "@/lib/stockAudits";
import { formatQty } from "@/components/inventory/VarianceTag";
import StockToolbar from "@/components/inventory/StockToolbar";
import StockHistoryDrawer from "@/components/inventory/StockHistoryDrawer";
import {
  parseQtyDraft,
  useStockRows,
  type StockRow,
} from "@/components/inventory/useStockRows";

/** Stock the save spent, as the API reports it back. */
interface ConsumedRow {
  id: string;
  /** Which shelf it came off — a production recipe may spend either. */
  kind: AuditKind;
  name: string;
  unit: string;
  consumedQty: number;
  /** How much the recipe wanted but the shelf did not have. */
  shortfall: number;
  currentStock: number;
}

/** Tab labels, reused by the save bar and the history drawer's title. */
const KIND_LABEL: Record<AuditKind, string> = {
  raw: "Raw Material",
  production: "Production Items",
};

export default function AddStockPage() {
  const {
    loading,
    categories,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    belowAlertOnly,
    setBelowAlertOnly,
    term,
    materialRows,
    itemRows,
    allRows,
    belowAlertCounts,
    applySaved,
  } = useStockRows();

  const [messageApi, messageContextHolder] = message.useMessage();
  // Quantities to add live here until saved, keyed by row key. Only rows you
  // are actually topping up get an entry, so an untouched cell renders empty.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKind, setSavingKind] = useState<AuditKind | null>(null);
  const [activeTab, setActiveTab] = useState<AuditKind>("raw");
  const [historyKind, setHistoryKind] = useState<AuditKind | null>(null);

  /**
   * Rows with something typed in Add Stock.
   *
   * Built from ALL rows, not the filtered ones — an entry made before you
   * changed the search must still be saved, not quietly abandoned because it
   * scrolled out of view.
   */
  const pending = allRows.filter((row) => {
    const draft = drafts[row.key];
    return draft !== undefined && draft.trim() !== "";
  });

  // Zero parses fine as a quantity but is not a delivery — it would record a
  // history row saying nothing arrived. Flag it rather than ignore it, so a
  // half-typed "0.5" isn't silently dropped either.
  const isBadDraft = (row: StockRow) => {
    const parsed = parseQtyDraft(drafts[row.key] ?? "");
    return parsed === null || parsed === 0;
  };

  const pendingIn = (kind: AuditKind) => pending.filter((r) => r.kind === kind);
  const activePending = pendingIn(activeTab);
  const activeInvalid = activePending.filter(isBadDraft);
  const otherTab: AuditKind = activeTab === "raw" ? "production" : "raw";
  const otherPending = pendingIn(otherTab).length;

  // Browsers only honour this after a real interaction, but it turns an
  // accidental tab close into a prompt rather than silent data loss.
  const pendingCount = pending.length;
  useEffect(() => {
    if (pendingCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingCount]);

  const setDraft = (key: string, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const clearDrafts = (keys: Set<string>) => {
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !keys.has(key)),
      ),
    );
  };

  /** Drop this tab's entries only — the other tab's work is left alone. */
  const discardTab = (kind: AuditKind) => {
    const keys = new Set(pendingIn(kind).map((row) => row.key));
    if (keys.size === 0) return;
    clearDrafts(keys);
    messageApi.info(`${KIND_LABEL[kind]} additions discarded`);
  };

  const handleSave = async (kind: AuditKind) => {
    const rows = pendingIn(kind);
    const bad = rows.filter(isBadDraft);
    if (rows.length === 0) return;
    if (bad.length > 0) {
      messageApi.error(
        `Fix ${bad.length} invalid quantit${bad.length === 1 ? "y" : "ies"} first — they must be more than 0.`,
      );
      return;
    }

    setSavingKind(kind);
    try {
      // One kind per request: the server records the save as a single history
      // entry under that kind, which is what the history is grouped by.
      const res = await fetch("/api/inventory/stock-additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          updates: rows.map((row) => ({
            id: row.id,
            addQty: parseQtyDraft(drafts[row.key] ?? ""),
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? "Could not add stock");
        return;
      }

      // The server returns the resulting quantities — it owns the sum, so the
      // page takes them rather than recomputing its own.
      applySaved(
        kind,
        new Map(
          (data.updated ?? []).map(
            (u: { id: string; currentStock: number }) => [u.id, u.currentStock],
          ),
        ),
      );

      // Producing something spends what it is made from, so other rows have
      // moved too — raw materials, and any production item this one is built
      // on. Each tab is settled from its own share of the reply.
      const consumed: ConsumedRow[] = data.consumed ?? [];
      for (const consumedKind of ["raw", "production"] as const) {
        const rows = consumed.filter((c) => c.kind === consumedKind);
        if (rows.length === 0) continue;
        applySaved(
          consumedKind,
          new Map(rows.map((c) => [c.id, c.currentStock])),
        );
      }
      clearDrafts(new Set(rows.map((row) => row.key)));

      const suffix = data.rejected?.length
        ? `, ${data.rejected.length} rejected`
        : "";
      const deducted = consumed.length
        ? ` · ${consumed.length} component${consumed.length === 1 ? "" : "s"} deducted`
        : "";
      messageApi.success(
        `Added stock to ${data.saved} ${KIND_LABEL[kind]} item${data.saved === 1 ? "" : "s"}${suffix}${deducted}`,
      );

      // A recipe asking for more than was on record is worth saying out loud —
      // the quantity stopped at zero, so the raw count needs attention.
      const short = consumed.filter((c) => !!c.shortfall);
      if (short.length > 0) {
        messageApi.warning(
          `${short.map((c) => `${c.name} was ${c.shortfall} ${c.unit} short`).join("; ")} — stopped at 0. Check those counts.`,
          8,
        );
      }
    } catch {
      messageApi.error("Network error — please try again");
    } finally {
      setSavingKind(null);
    }
  };

  const buildColumns = (showCategory: boolean): ColumnsType<StockRow> => [
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
    // Read-only here: this screen only ever adds to it.
    {
      title: "Qty Remaining",
      dataIndex: "savedStock",
      align: "right",
      width: 190,
      render: (value: number | undefined, row) => {
        if (typeof value !== "number") {
          return <span className="text-xs text-gray-400">Not tracked</span>;
        }
        const low = isBelowAlert(value, row.alertQty);
        return (
          <span className="inline-flex items-center justify-end gap-2">
            {low && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                <WarningOutlined /> Low
              </span>
            )}
            <span
              className={`whitespace-nowrap tabular-nums ${
                low ? "font-semibold text-red-600" : "text-gray-900"
              }`}
            >
              {formatQty(value)} {row.unit}
            </span>
          </span>
        );
      },
    },
    {
      title: "Add Stock",
      key: "addStock",
      align: "right",
      width: 220,
      render: (_: unknown, row) => {
        const text = drafts[row.key] ?? "";
        const entered = text.trim() !== "";
        const parsed = parseQtyDraft(text);
        const isInvalid = entered && (parsed === null || parsed === 0);

        return (
          <span className="inline-flex items-center justify-end gap-2">
            {entered && !isInvalid && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                title="Not added yet"
                aria-label="Not added yet"
              />
            )}
            <input
              value={text}
              onChange={(e) => setDraft(row.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  clearDrafts(new Set([row.key]));
                  e.currentTarget.blur();
                }
              }}
              inputMode="decimal"
              placeholder="0"
              aria-label={`Stock to add for ${row.name}`}
              aria-invalid={isInvalid || undefined}
              className={`w-28 rounded-lg border py-1 px-2 text-right text-sm tabular-nums outline-none transition-colors ${
                isInvalid
                  ? "border-red-400 ring-1 ring-red-300"
                  : entered
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
      title: "Updated Qty",
      key: "updatedQty",
      align: "right",
      width: 180,
      render: (_: unknown, row) => {
        const add = parseQtyDraft(drafts[row.key] ?? "");
        // Nothing to add yet — the quantity is simply whatever it already was.
        if (add === null || add === 0) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        // An untracked item starts from zero, matching what the save will do.
        const updated = (row.savedStock ?? 0) + add;
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-green-700">
            {formatQty(updated)} {row.unit}
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
    rows: StockRow[],
    showCategory: boolean,
    emptyText: string,
  ) => (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <Table<StockRow>
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

  const tabLabel = (rows: StockRow[], kind: AuditKind) => {
    const count = pendingIn(kind).length;
    return (
      <span className="inline-flex items-center gap-2">
        {KIND_LABEL[kind]}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          {rows.length}
        </span>
        {count > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {count} to add
          </span>
        )}
      </span>
    );
  };

  return (
    // Bottom padding clears the sticky save bar so the last row stays reachable.
    <div className={activePending.length > 0 ? "pb-24" : ""}>
      {messageContextHolder}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
          Add Stock
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Record stock as it comes in. What you enter under Add Stock is added
          to the Qty Remaining already on record — Updated Qty shows where the
          row will land. Adding a production item also spends its recipe: the
          raw materials it is made from are deducted at the same time, and the
          save&rsquo;s History lists exactly what went out. Each tab is saved on
          its own and keeps its own History. To correct a quantity rather than
          top it up, use{" "}
          <Link
            href="/inventory-management/adjustment"
            className="font-medium text-[#024731] hover:underline"
          >
            Audit
          </Link>
          .
        </p>
      </div>

      <div className="mt-5">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as AuditKind)}
          items={[
            {
              key: "raw",
              label: tabLabel(materialRows, "raw"),
              children: (
                <>
                  <StockToolbar
                    search={search}
                    onSearch={setSearch}
                    belowAlertOnly={belowAlertOnly}
                    onBelowAlertOnly={setBelowAlertOnly}
                    belowAlertCount={belowAlertCounts.raw}
                    categories={categories}
                    categoryId={categoryId}
                    onCategory={setCategoryId}
                    onHistory={() => setHistoryKind("raw")}
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
              label: tabLabel(itemRows, "production"),
              children: (
                <>
                  <StockToolbar
                    search={search}
                    onSearch={setSearch}
                    belowAlertOnly={belowAlertOnly}
                    onBelowAlertOnly={setBelowAlertOnly}
                    belowAlertCount={belowAlertCounts.production}
                    onHistory={() => setHistoryKind("production")}
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

      {/* Sticky action bar — scoped to the tab you are on, because a save is
          per kind. Entries still pending on the other tab are named rather
          than folded in, so nothing is added by surprise. */}
      {activePending.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] md:left-56">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium text-gray-900">
                {activePending.length} item
                {activePending.length === 1 ? "" : "s"} to top up in{" "}
                {KIND_LABEL[activeTab]}
              </span>
              {activeInvalid.length > 0 && (
                <span className="ml-2 text-red-600">
                  · {activeInvalid.length} invalid — quantities must be more
                  than 0
                </span>
              )}
              {otherPending > 0 && (
                <span className="ml-2 text-gray-500">
                  · {otherPending} still pending in {KIND_LABEL[otherTab]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => discardTab(activeTab)}
                disabled={savingKind !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <UndoOutlined />
                Discard
              </button>
              <button
                type="button"
                onClick={() => handleSave(activeTab)}
                disabled={savingKind !== null || activeInvalid.length > 0}
                className="rounded-lg bg-[#1c1c1c] px-5 py-2 text-sm font-medium text-white hover:bg-[#024731] disabled:opacity-50 transition-colors"
              >
                {savingKind === activeTab
                  ? "Adding…"
                  : `Add to ${KIND_LABEL[activeTab]} (${activePending.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <StockHistoryDrawer
        open={historyKind !== null}
        // Falls back to the active tab for the frame the drawer spends closing,
        // so the title doesn't blank out mid-animation.
        kind={historyKind ?? activeTab}
        type="addition"
        title={KIND_LABEL[historyKind ?? activeTab]}
        onClose={() => setHistoryKind(null)}
      />
    </div>
  );
}
