"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DatePicker, Segmented, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import ExportSalesReport from "@/components/admin/ExportSalesReport";
import FoodTypeDot from "@/components/FoodTypeDot";
import type { FoodType } from "@/lib/foodType";

const { RangePicker } = DatePicker;

/** Mirrors TOP_ITEMS_LIMIT in the dashboard API — display copy only. */
const TOP_ITEMS_SHOWN = 10;

interface StatusBucket {
  /** Billed on paid docs, incl. tax, before any balance was spent. */
  grossAmount: number;
  /** Actually charged — gross less wallet credit and reward points. */
  collectedAmount: number;
  /** Wallet credit + reward points spent on paid docs in range. */
  redeemedAmount: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
}

interface TopItem {
  productId: string;
  name: string;
  foodType?: FoodType;
  isVeg: boolean;
  quantity: number;
  revenue: number;
}

interface DashboardData {
  range: { from: string; to: string };
  sales: {
    orders: StatusBucket;
    subscriptions: StatusBucket;
    /** Billed across orders + subscriptions. */
    totalGrossAmount: number;
    /** Money actually taken — what a settlement report should match. */
    totalCollectedAmount: number;
    /** The gap: paid from wallet credit and reward points. */
    totalRedeemedAmount: number;
  };
  users: {
    total: number;
    newInRange: number;
    buyersInRange: number;
    newBuyers: number;
    repeatBuyers: number;
  };
  topItems: TopItem[];
  referrals: {
    signups: number;
    converted: number;
    /** Credit disbursed during the range — a different cohort to the two above. */
    creditPaidOut: number;
  };
  /** A right-now snapshot, not scoped to the selected range. */
  streaks: {
    total: number;
    longest: number;
    day1: number;
    day2: number;
    day3: number;
    day4plus: number;
  };
}

type Preset = "today" | "7d" | "30d" | "month";

const PRESET_OPTIONS = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "This month", value: "month" },
];

function presetRange(preset: Preset): [Dayjs, Dayjs] {
  const today = dayjs();
  switch (preset) {
    case "today":
      return [today, today];
    case "30d":
      return [today.subtract(29, "day"), today];
    case "month":
      return [today.startOf("month"), today];
    case "7d":
    default:
      return [today.subtract(6, "day"), today];
  }
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("en-IN");

const CHIP_TONE: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-600",
  gray: "bg-gray-100 text-gray-500",
  green: "bg-green-50 text-[#009940]",
};

function Chip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-xs ${CHIP_TONE[tone] ?? CHIP_TONE.gray}`}
    >
      <span className="font-semibold tabular-nums">{num.format(value)}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="mt-1 text-3xl font-bold tracking-tight text-[#111] tabular-nums">
        {value}
      </span>
      {sub && <span className="mt-0.5 text-sm text-gray-500">{sub}</span>}
      {children && <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse">
      <div className="h-3 w-20 bg-gray-100 rounded" />
      <div className="h-8 w-28 bg-gray-100 rounded mt-3" />
      <div className="h-3 w-24 bg-gray-100 rounded mt-3" />
    </div>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The range to open on. A `?from=&to=` pair wins so the view is linkable — and
 * so returning from the items page lands back on the range you left. Anything
 * missing or malformed falls back to the default preset.
 */
function initialRange(
  from: string | null,
  to: string | null,
): { preset: Preset | null; range: [Dayjs, Dayjs] } {
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
    const f = dayjs(from);
    const t = dayjs(to);
    if (f.isValid() && t.isValid()) {
      return { preset: null, range: f.isAfter(t) ? [t, f] : [f, t] };
    }
  }
  return { preset: "7d", range: presetRange("7d") };
}

function DashboardView() {
  const params = useSearchParams();
  // First render only — after that the picker owns the range.
  const initial = useMemo(
    () => initialRange(params.get("from"), params.get("to")),
    [params],
  );
  const [preset, setPreset] = useState<Preset | null>(initial.preset);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(initial.range);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [from, to] = range;
  const fromStr = from.format("YYYY-MM-DD");
  const toStr = to.format("YYYY-MM-DD");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dashboard?from=${fromStr}&to=${toStr}`);
      const json = await res.json();
      if (json?.success) setData(json as DashboardData);
      else message.error(json?.message ?? "Failed to load dashboard");
    } catch {
      message.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [fromStr, toStr]);

  useEffect(() => {
    load();
  }, [load]);

  const onPreset = (value: string | number) => {
    const p = value as Preset;
    setPreset(p);
    setRange(presetRange(p));
  };

  const onRange = (values: [Dayjs | null, Dayjs | null] | null) => {
    if (values && values[0] && values[1]) {
      setPreset(null); // manual range no longer matches a preset
      setRange([values[0], values[1]]);
    }
  };

  const rangeLabel = useMemo(() => {
    const f = from.format("D MMM");
    const t = to.format("D MMM YYYY");
    return from.isSame(to, "day") ? t : `${f} – ${t}`;
  }, [from, to]);

  const sales = data?.sales;
  const users = data?.users;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111]">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={PRESET_OPTIONS}
            value={preset ?? ""}
            onChange={onPreset}
          />
          <RangePicker
            value={range}
            onChange={onRange}
            allowClear={false}
            format="D MMM YY"
            maxDate={dayjs()}
          />
          <ExportSalesReport defaultRange={range} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        sales &&
        users && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Gross is the headline (it's what was sold); the sub-line says
                how much of it was actually money in, since balances spent are
                sales that never reach a settlement report. */}
            <StatCard
              label="Total sales"
              value={inr.format(sales.totalGrossAmount)}
              sub={
                sales.totalRedeemedAmount > 0
                  ? `${inr.format(sales.totalCollectedAmount)} collected · ${inr.format(sales.totalRedeemedAmount)} from balances`
                  : "Gross billed in range · all collected"
              }
            >
              <Chip label="orders" value={sales.orders.paidCount} tone="green" />
              <Chip label="subs" value={sales.subscriptions.paidCount} tone="green" />
            </StatCard>

            <StatCard
              label="Orders"
              value={num.format(sales.orders.paidCount)}
              sub={`${inr.format(sales.orders.grossAmount)} gross · ${inr.format(sales.orders.collectedAmount)} collected`}
            >
              {sales.orders.pendingCount > 0 && (
                <Chip label="pending" value={sales.orders.pendingCount} tone="amber" />
              )}
              {sales.orders.failedCount > 0 && (
                <Chip label="failed" value={sales.orders.failedCount} tone="red" />
              )}
              {sales.orders.refundedCount > 0 && (
                <Chip label="refunded" value={sales.orders.refundedCount} tone="gray" />
              )}
            </StatCard>

            <StatCard
              label="Subscriptions"
              value={num.format(sales.subscriptions.paidCount)}
              sub={`${inr.format(sales.subscriptions.grossAmount)} gross · ${inr.format(sales.subscriptions.collectedAmount)} collected`}
            >
              {sales.subscriptions.pendingCount > 0 && (
                <Chip label="pending" value={sales.subscriptions.pendingCount} tone="amber" />
              )}
              {sales.subscriptions.failedCount > 0 && (
                <Chip label="failed" value={sales.subscriptions.failedCount} tone="red" />
              )}
              {sales.subscriptions.refundedCount > 0 && (
                <Chip label="refunded" value={sales.subscriptions.refundedCount} tone="gray" />
              )}
            </StatCard>

            <StatCard
              label="Users"
              value={num.format(users.total)}
              sub="Registered · all time"
            >
              <Chip label="new" value={users.newInRange} tone="green" />
              <Chip label="buyers" value={users.buyersInRange} tone="gray" />
              <Chip label="repeat" value={users.repeatBuyers} tone="amber" />
            </StatCard>

            {data?.referrals && (
              <StatCard
                label="Referred signups"
                value={num.format(data.referrals.signups)}
                sub={`${inr.format(data.referrals.creditPaidOut)} credit paid out in range`}
              >
                <Chip
                  label="converted"
                  value={data.referrals.converted}
                  tone="green"
                />
                <Chip
                  label="pending"
                  value={Math.max(
                    0,
                    data.referrals.signups - data.referrals.converted,
                  )}
                  tone="amber"
                />
              </StatCard>
            )}

            {data?.streaks && (
              <StatCard
                label="Live streaks"
                value={num.format(data.streaks.total)}
                // Not range-scoped: a streak is a right-now fact, so this tile
                // deliberately ignores the date picker above.
                sub={
                  data.streaks.total
                    ? `Right now · longest ${data.streaks.longest} days`
                    : "Right now"
                }
              >
                {data.streaks.day1 > 0 && (
                  <Chip label="day 1" value={data.streaks.day1} tone="gray" />
                )}
                {data.streaks.day2 > 0 && (
                  <Chip label="day 2" value={data.streaks.day2} tone="amber" />
                )}
                {data.streaks.day3 > 0 && (
                  <Chip label="day 3" value={data.streaks.day3} tone="green" />
                )}
                {data.streaks.day4plus > 0 && (
                  <Chip label="day 4+" value={data.streaks.day4plus} tone="green" />
                )}
              </StatCard>
            )}
          </div>
        )
      )}

      {/* Most ordered items */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-[#111]">Most ordered items</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Top {TOP_ITEMS_SHOWN} by quantity across paid orders in range
            </p>
          </div>
          {/* Carries the range in the URL, so the full list is linkable. */}
          <Link
            href={`/admin/dashboard/items?from=${fromStr}&to=${toStr}`}
            className="shrink-0 text-sm font-medium text-[#f56215] hover:underline whitespace-nowrap"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !data?.topItems.length ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            No paid orders in this range.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-5 py-2 font-medium w-10">#</th>
                <th className="px-2 py-2 font-medium">Item</th>
                <th className="px-5 py-2 font-medium text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.topItems.map((item, i) => (
                <tr
                  key={item.productId}
                  className="border-t border-gray-50 hover:bg-gray-50/60"
                >
                  <td className="px-5 py-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FoodTypeDot item={item} size={12} />
                      <span className="truncate text-[#111]">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums text-[#111]">
                    {num.format(item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  // useSearchParams needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<div className="p-6 text-gray-500">Loading…</div>}>
      <DashboardView />
    </Suspense>
  );
}
