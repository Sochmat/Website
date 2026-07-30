import { istToday, addIstDays, istInstant } from "./ist";

/** An inclusive IST date range, with the half-open instants to query on. */
export interface IstRange {
  /** Inclusive first day, yyyy-mm-dd. */
  from: string;
  /** Inclusive last day, yyyy-mm-dd. */
  to: string;
  /** 00:00 IST on `from`. */
  gte: Date;
  /** 00:00 IST on the day after `to` — exclusive upper bound. */
  lt: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive default span when the caller sends nothing usable: the last 7 days. */
const DEFAULT_SPAN_DAYS = 7;

/**
 * The `?from=&to=` range every admin stats endpoint reads, defaulting to the
 * last 7 days and tolerating the two ways callers get it wrong: a missing or
 * malformed date, and a range handed over backwards.
 *
 * Built on `ist.ts` rather than another hand-rolled +05:30 conversion, so the
 * day boundaries here agree with the ones the rest of the app already uses.
 */
export function parseIstRange(
  rawFrom: string | null | undefined,
  rawTo: string | null | undefined,
  now: Date,
): IstRange {
  const today = istToday(now);

  let from = String(rawFrom ?? "");
  let to = String(rawTo ?? "");
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    to = today;
    from = addIstDays(today, -(DEFAULT_SPAN_DAYS - 1));
  }
  // yyyy-mm-dd compares lexicographically the same way it compares
  // chronologically, so this is a plain swap.
  if (from > to) [from, to] = [to, from];

  return {
    from,
    to,
    gte: istInstant(from, 0, 0),
    lt: istInstant(addIstDays(to, 1), 0, 0),
  };
}
