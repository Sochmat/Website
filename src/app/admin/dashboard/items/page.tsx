"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Table, message } from "antd";
import { ArrowLeft } from "lucide-react";
import dayjs from "dayjs";

interface ItemSale {
  productId: string;
  name: string;
  isVeg: boolean;
  quantity: number;
  revenue: number;
}

interface ItemsData {
  range: { from: string; to: string };
  items: ItemSale[];
  totals: { quantity: number; revenue: number };
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-IN");

function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
        isVeg ? "border-green-600" : "border-red-600"
      }`}
      aria-label={isVeg ? "Veg" : "Non-veg"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`}
      />
    </span>
  );
}

function ItemsView() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const [data, setData] = useState<ItemsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The API applies the same last-7-days default when these are absent, so
      // an unparameterised visit still lands somewhere sensible.
      const res = await fetch(
        `/api/admin/dashboard/items?from=${from}&to=${to}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (json?.success) setData(json as ItemsData);
      else message.error(json?.message ?? "Failed to load items");
    } catch {
      message.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeLabel = data
    ? data.range.from === data.range.to
      ? dayjs(data.range.to).format("D MMM YYYY")
      : `${dayjs(data.range.from).format("D MMM")} – ${dayjs(data.range.to).format("D MMM YYYY")}`
    : "";

  const backHref = from && to ? `/admin/dashboard?from=${from}&to=${to}` : "/admin/dashboard";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#111] mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111]">
            Items sold
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rangeLabel}
            {data ? ` · ${num.format(data.items.length)} items` : ""}
          </p>
        </div>
        {data && (
          <div className="text-right">
            <div className="text-xl font-semibold text-[#111] tabular-nums">
              {inr.format(data.totals.revenue)}
            </div>
            <div className="text-xs text-gray-400">
              {num.format(data.totals.quantity)} units · paid orders
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <Table<ItemSale>
          loading={loading}
          dataSource={data?.items ?? []}
          rowKey="productId"
          pagination={false}
          size="middle"
          scroll={{ x: true }}
          locale={{ emptyText: "No paid orders in this range." }}
          columns={[
            {
              title: "#",
              key: "rank",
              width: 56,
              render: (_, __, i) => (
                <span className="text-gray-400 tabular-nums">{i + 1}</span>
              ),
            },
            {
              title: "Item",
              dataIndex: "name",
              key: "name",
              render: (name: string, row) => (
                <div className="flex items-center gap-2 min-w-0">
                  <VegDot isVeg={row.isVeg} />
                  <span className="truncate text-[#111]">{name}</span>
                </div>
              ),
              sorter: (a, b) => a.name.localeCompare(b.name),
            },
            {
              title: "Qty",
              dataIndex: "quantity",
              key: "quantity",
              align: "right",
              width: 110,
              defaultSortOrder: "descend",
              sorter: (a, b) => a.quantity - b.quantity,
              render: (q: number) => (
                <span className="font-medium tabular-nums text-[#111]">
                  {num.format(q)}
                </span>
              ),
            },
            {
              title: "Revenue",
              dataIndex: "revenue",
              key: "revenue",
              align: "right",
              width: 140,
              sorter: (a, b) => a.revenue - b.revenue,
              render: (r: number) => (
                <span className="tabular-nums text-[#111]">{inr.format(r)}</span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

export default function ItemsSoldPage() {
  // useSearchParams needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<div className="p-6 text-gray-500">Loading…</div>}>
      <ItemsView />
    </Suspense>
  );
}
