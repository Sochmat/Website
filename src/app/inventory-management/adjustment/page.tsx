"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { WarningOutlined, UndoOutlined } from "@ant-design/icons";
import { formatCurrency, isBelowAlert } from "@/lib/rawMaterials";
import { auditVariance, type AuditKind } from "@/lib/stockAudits";
import VarianceTag, { formatQty } from "@/components/inventory/VarianceTag";
import StockToolbar from "@/components/inventory/StockToolbar";
import StockHistoryDrawer from "@/components/inventory/StockHistoryDrawer";
import {
  parseQtyDraft,
  useStockRows,
  type StockRow,
} from "@/components/inventory/useStockRows";

/** Tab labels, reused by the save bar and the history drawer's title. */
const KIND_LABEL: Record<AuditKind, string> = {
  raw: "Raw Material",
  production: "Production Items",
};

export default function AuditPage() {
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
  // Counts live here until saved, keyed by row key. Only rows you have
  // actually counted get an entry, so an untouched cell renders empty — there
  // is no draft state to seed or re-sync when the data reloads.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Saving is per kind, so the button on one tab can't appear busy because the
  // other tab is mid-save.
  const [savingKind, setSavingKind] = useState<AuditKind | null>(null);
  const [activeTab, setActiveTab] = useState<AuditKind>("raw");
  const [historyKind, setHistoryKind] = useState<AuditKind | null>(null);

  /**
   * Rows whose counted closing stock differs from what's stored.
   *
   * Built from ALL rows, not the filtered ones — a count made before you
   * changed the search must still be saved, not quietly abandoned because it
   * scrolled out of view.
   */
  const changed = allRows.filter((row) => {
    const draft = drafts[row.key];
    // A cleared cell means "not counted", not an edit — nothing to save.
    if (draft === undefined || draft.trim() === "") return false;
    const parsed = parseQtyDraft(draft);
    // Unparseable entries stay in the list so the save bar can flag them.
    return parsed === null || parsed !== row.savedStock;
  });

  const invalid = changed.filter(
    (row) => parseQtyDraft(drafts[row.key] ?? "") === null,
  );

  // Everything below the save bar works per kind: a tab is counted, reviewed
  // and committed on its own, and lands in its own history.
  const changedIn = (kind: AuditKind) => changed.filter((c) => c.kind === kind);

  const activeChanged = changedIn(activeTab);
  const activeInvalid = invalid.filter((c) => c.kind === activeTab);
  const otherTab: AuditKind = activeTab === "raw" ? "production" : "raw";
  const otherPending = changedIn(otherTab).length;

  // Browsers only honour this after a real interaction, but it turns an
  // accidental tab close into a prompt rather than silent data loss. Counted
  // across BOTH tabs — closing the page would lose the other tab's work too.
  const dirtyCount = changed.length;
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

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

  /** Drop this tab's counts only — the other tab's work is left alone. */
  const discardTab = (kind: AuditKind) => {
    const keys = new Set(changedIn(kind).map((row) => row.key));
    if (keys.size === 0) return;
    clearDrafts(keys);
    messageApi.info(`${KIND_LABEL[kind]} counts discarded`);
  };

  const handleSave = async (kind: AuditKind) => {
    const rows = changedIn(kind);
    const bad = rows.filter(
      (row) => parseQtyDraft(drafts[row.key] ?? "") === null,
    );
    if (rows.length === 0) return;
    if (bad.length > 0) {
      messageApi.error(
        `Fix ${bad.length} invalid quantit${bad.length === 1 ? "y" : "ies"} first — they must be 0 or more.`,
      );
      return;
    }

    setSavingKind(kind);
    try {
      // One kind per request: the server records the save as a single audit
      // entry under that kind, which is what the history is grouped by.
      const res = await fetch("/api/inventory/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          updates: rows.map((row) => ({
            id: row.id,
            currentStock: parseQtyDraft(drafts[row.key] ?? ""),
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? "Could not save");
        return;
      }

      // Fold the saved values into local state and clear just this tab's
      // drafts, so the page settles without a refetch wiping anything still
      // being typed on the other tab.
      applySaved(
        kind,
        new Map(
          rows.map((row) => [
            row.id,
            parseQtyDraft(drafts[row.key] ?? "") as number,
          ]),
        ),
      );
      clearDrafts(new Set(rows.map((row) => row.key)));

      const suffix = data.rejected?.length
        ? `, ${data.rejected.length} rejected`
        : "";
      messageApi.success(
        `Saved ${data.saved} ${KIND_LABEL[kind]} quantit${data.saved === 1 ? "y" : "ies"}${suffix}`,
      );
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
    // Read-only: this is the system's record, the thing the count is measured
    // against. It only moves when a saved count overwrites it.
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
      title: "Closing Stock",
      key: "closingStock",
      align: "right",
      width: 220,
      render: (_: unknown, row) => {
        const text = drafts[row.key] ?? "";
        const parsed = parseQtyDraft(text);
        const isInvalid = text.trim() !== "" && parsed === null;
        const isDirty = parsed !== null && parsed !== row.savedStock;

        return (
          <span className="inline-flex items-center justify-end gap-2">
            {isDirty && (
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
                  clearDrafts(new Set([row.key]));
                  e.currentTarget.blur();
                }
              }}
              inputMode="decimal"
              placeholder="Not counted"
              aria-label={`Closing stock for ${row.name}`}
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
      title: "% Difference",
      key: "difference",
      align: "right",
      width: 200,
      render: (_: unknown, row) => {
        const closing = parseQtyDraft(drafts[row.key] ?? "");
        // Nothing counted yet — there is no variance to report.
        if (closing === null) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        const { diff, pctDiff } = auditVariance(row.savedStock ?? null, closing);
        return <VarianceTag diff={diff} pctDiff={pctDiff} unit={row.unit} />;
      },
    },
    // What the discrepancy is worth: the gap in qty, priced at the item's own
    // cost per consumption unit. A shortfall is money gone missing, a surplus
    // is stock the books did not know it had.
    {
      title: "Cost",
      key: "cost",
      align: "right",
      width: 170,
      render: (_: unknown, row) => {
        const closing = parseQtyDraft(drafts[row.key] ?? "");
        if (closing === null) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        const { diff } = auditVariance(row.savedStock ?? null, closing);
        // A first count has no gap to value.
        if (diff === null) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        if (!row.unitCost) {
          return (
            <span
              className="text-xs text-gray-400"
              title="No price or unit conversion set for this item"
            >
              No price
            </span>
          );
        }

        const worth = Math.abs(diff) * row.unitCost;
        const priceHint = `${formatCurrency(row.unitCost)} per ${row.unit}`;
        if (diff === 0) {
          return (
            <span
              className="whitespace-nowrap text-sm tabular-nums text-gray-500"
              title={priceHint}
            >
              {formatCurrency(0)}
            </span>
          );
        }

        const surplus = diff > 0;
        return (
          <span
            className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
              surplus ? "text-green-700" : "text-red-700"
            }`}
            title={priceHint}
          >
            {surplus ? "+" : "−"}
            {formatCurrency(worth)}
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
    const dirty = changedIn(kind).length;
    return (
      <span className="inline-flex items-center gap-2">
        {KIND_LABEL[kind]}
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
    <div className={activeChanged.length > 0 ? "pb-24" : ""}>
      {messageContextHolder}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
          Audit
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Count what is physically on hand and enter it as Closing Stock — the
          gap against the recorded Qty Remaining is shown per row. Each tab is
          saved on its own and keeps its own History, so a raw-material count
          never commits alongside a production count. Nothing is written until
          you press Save; saved quantities appear on{" "}
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
          per kind. Counts still pending on the other tab are named rather than
          folded in, so nothing is saved by surprise or silently forgotten. */}
      {activeChanged.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] md:left-56">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium text-gray-900">
                {activeChanged.length} unsaved count
                {activeChanged.length === 1 ? "" : "s"} in{" "}
                {KIND_LABEL[activeTab]}
              </span>
              {activeInvalid.length > 0 && (
                <span className="ml-2 text-red-600">
                  · {activeInvalid.length} invalid — quantities must be 0 or more
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
                  ? "Saving…"
                  : `Save ${KIND_LABEL[activeTab]} (${activeChanged.length})`}
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
        type="audit"
        title={KIND_LABEL[historyKind ?? activeTab]}
        onClose={() => setHistoryKind(null)}
      />
    </div>
  );
}
