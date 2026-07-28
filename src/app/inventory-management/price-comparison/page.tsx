"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Collapse, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import EditableNumberCell from "@/components/inventory/EditableNumberCell";
import { formatCurrency } from "@/lib/rawMaterials";
import {
  PRICE_CHANNELS,
  costPercent,
  websitePrice,
  websitePriceDrifted,
  type PriceChannel,
  type PriceGroup,
  type PriceRow,
} from "@/lib/priceComparison";

/**
 * Food cost as a share of the selling price, coloured by how much room is
 * left. The bands are the ordinary restaurant rule of thumb — comfortable
 * below a third, tight past half, losing money past all of it — and exist to
 * make an outlier findable in a long table, not to grade anyone's pricing.
 */
function percentTone(pct: number): string {
  if (pct >= 100) return "text-red-700 bg-red-50 border-red-200";
  if (pct >= 50) return "text-amber-800 bg-amber-50 border-amber-200";
  if (pct >= 35) return "text-gray-700 bg-gray-50 border-gray-200";
  return "text-green-700 bg-green-50 border-green-200";
}

/** The "cost is N% of this price" badge under a price field. */
function PercentBadge({ cost, price }: { cost: number; price?: number }) {
  const pct = costPercent(cost, price);
  if (pct === null) {
    return (
      <span className="text-[11px] text-gray-400" title="No price to compare against">
        —
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${percentTone(pct)}`}
      title={`Cost is ${pct}% of this price`}
    >
      {pct}%
    </span>
  );
}

export default function PriceComparisonPage() {
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [messageApi, messageContextHolder] = message.useMessage();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/price-comparison", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) setGroups(data.groups ?? []);
      else messageApi.error(data.message ?? "Could not load prices");
    } catch {
      // Leave whatever is on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Save one cell and fold the result into local state.
   *
   * No refetch: the screen is a grid of inputs, and reloading it would discard
   * anything else being typed. Returns whether the write landed, so the cell
   * can keep the user's text when it did not.
   */
  const savePrice = useCallback(
    async (row: PriceRow, channel: PriceChannel, price: number) => {
      try {
        const res = await fetch("/api/inventory/price-comparison", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nameKey: row.nameKey,
            name: row.name,
            channel,
            price,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          messageApi.error(data.message ?? "Could not save that price");
          return false;
        }
        setGroups((current) =>
          current.map((group) => ({
            ...group,
            rows: group.rows.map((r) =>
              r.nameKey === row.nameKey
                ? { ...r, prices: { ...r.prices, [channel]: price } }
                : r,
            ),
          })),
        );
        return true;
      } catch {
        messageApi.error("Network error — please try again");
        return false;
      }
    },
    [messageApi],
  );

  const term = search.trim().toLowerCase();

  const visible = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          rows: term
            ? group.rows.filter((r) => r.name.toLowerCase().includes(term))
            : group.rows,
        }))
        .filter((group) => group.rows.length > 0),
    [groups, term],
  );

  const totals = useMemo(() => {
    const rows = visible.flatMap((g) => g.rows);
    const priced = rows.filter((r) => websitePrice(r) !== undefined);
    return { items: rows.length, priced: priced.length };
  }, [visible]);

  const columns: ColumnsType<PriceRow> = [
    {
      title: "Item",
      key: "name",
      render: (_: unknown, row) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      title: "Cost",
      key: "cost",
      align: "right",
      width: 120,
      render: (_: unknown, row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-900">
          {formatCurrency(row.cost)}
        </span>
      ),
    },
    ...PRICE_CHANNELS.map(({ key, label }) => ({
      title: label,
      key,
      align: "right" as const,
      width: 190,
      render: (_: unknown, row: PriceRow) => {
        // The Website column starts from what the Menu tab says, so nobody
        // retypes a price the admin console already holds.
        const value =
          key === "website" ? websitePrice(row) : row.prices[key];
        return (
          <div className="flex flex-col items-end gap-1">
            <EditableNumberCell
              value={value}
              prefix="₹"
              placeholder="—"
              ariaLabel={`${label} price for ${row.name}`}
              onSave={(next) => savePrice(row, key, next)}
            />
            <div className="flex items-center gap-1.5">
              <PercentBadge cost={row.cost} price={value} />
              {key === "website" && websitePriceDrifted(row) && (
                <span
                  className="text-[11px] text-amber-700"
                  title="This differs from the price on the Menu tab"
                >
                  menu {formatCurrency(row.menuPrice!)}
                </span>
              )}
            </div>
          </div>
        );
      },
    })),
  ];

  return (
    <div>
      {messageContextHolder}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
          Price Comparison
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Every item that has a recipe, by category, with what it costs to make
          against what it sells for on each channel. The badge under a price is
          that cost as a percentage of it. Website starts from the price set on
          the Menu tab; the other three are entered here. Each field saves when
          you leave it.
        </p>
      </div>

      {!loading && totals.items > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-semibold text-gray-700">
            {totals.items} costed item{totals.items === 1 ? "" : "s"}
          </span>
          <span className="text-gray-500">
            {totals.priced} with a website price
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item name…"
            aria-label="Search items by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            Loading prices…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center">
            <p className="text-sm font-medium text-gray-900">
              {term ? "No items match that search" : "No costed items yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {term
                ? "Try a different name."
                : "Map a recipe under Setup → Item Recipe, and its cost will appear here."}
            </p>
          </div>
        ) : (
          <Collapse
            // Everything open by default: the screen exists to be scanned for
            // an outlier, which a collapsed list hides.
            defaultActiveKey={visible.map(
              (g) => g.categoryId || g.categoryName,
            )}
            items={visible.map((group) => ({
              key: group.categoryId || group.categoryName,
              label: (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {group.categoryName}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {group.rows.length}
                  </span>
                </span>
              ),
              children: (
                <Table<PriceRow>
                  rowKey={(row) => row.nameKey}
                  columns={columns}
                  dataSource={group.rows}
                  size="small"
                  scroll={{ x: "max-content" }}
                  pagination={
                    group.rows.length > 25
                      ? { pageSize: 25, showSizeChanger: false }
                      : false
                  }
                />
              ),
            }))}
          />
        )}
      </div>
    </div>
  );
}
