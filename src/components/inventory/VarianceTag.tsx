import { roundQty } from "@/lib/stockAudits";

/** Readable quantity: no float noise, no zero-padding on whole numbers. */
export function formatQty(value: number): string {
  return roundQty(value).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/**
 * A stock quantity with its unit, red when it is in the red.
 *
 * Below zero is a real state, not a rounding artefact: stock went out that the
 * books did not have, and nothing on the deduction paths floors it away. It is
 * flagged the same on every screen that shows a quantity — the Stocks list, the
 * consumption report, the history drawers — so a debt is never mistaken for a
 * count just because of which screen it was met on.
 *
 * Callers handle a missing quantity themselves: "not tracked" is a different
 * statement from "none left", and each screen words it in its own voice.
 */
export function StockQty({
  value,
  unit,
  strong = false,
}: {
  value: number;
  unit: string;
  /** Emphasised — for the figure a row is really about, e.g. its closing one. */
  strong?: boolean;
}) {
  const negative = value < 0;
  return (
    <span
      className={`whitespace-nowrap tabular-nums ${
        negative
          ? "font-semibold text-red-600"
          : strong
            ? "font-medium text-gray-900"
            : "text-gray-600"
      }`}
      title={
        negative
          ? "Stock went out that the books did not have — this is a debt, not a count"
          : undefined
      }
    >
      {formatQty(value)} {unit}
    </span>
  );
}

/**
 * A counted quantity's gap from what was on record, in qty and percent.
 *
 * Shared by the Audit table (live, as you type) and the history drawer (as
 * recorded), so a variance reads identically wherever it appears. Green is a
 * surplus, red a shortfall; a first count is neither.
 */
export default function VarianceTag({
  diff,
  pctDiff,
  unit,
}: {
  /** null = there was no previous quantity to measure against. */
  diff: number | null;
  /** null = no base to divide by (previous absent, or zero). */
  pctDiff: number | null;
  unit: string;
}) {
  if (diff === null) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
        First count
      </span>
    );
  }

  if (diff === 0) {
    return (
      <span className="whitespace-nowrap text-sm tabular-nums text-gray-500">
        0 {unit} · 0%
      </span>
    );
  }

  const surplus = diff > 0;
  const sign = surplus ? "+" : "−";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-sm font-semibold tabular-nums ${
        surplus
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
      title={surplus ? "More on hand than recorded" : "Less on hand than recorded"}
    >
      <span>
        {sign}
        {formatQty(Math.abs(diff))} {unit}
      </span>
      <span className="opacity-60">·</span>
      <span>{pctDiff === null ? "—" : `${sign}${formatQty(Math.abs(pctDiff))}%`}</span>
    </span>
  );
}
