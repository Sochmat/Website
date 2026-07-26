/**
 * Per-location reward ladders.
 *
 * A ladder is the list of earn percentages by order day within a calendar
 * month: index 0 is a customer's first order day of the month, and the LAST
 * entry is the cap that holds for the rest of it. The length is configurable,
 * so one location can run a four-rung ladder and another a ten-rung one.
 *
 * Ladders live in the shared `settings` collection under `key: "streak-ladders"`,
 * mirroring society-discounts. A location without its own entry falls back to
 * the admin-editable `default` ladder, and that to the seed below.
 *
 * The day COUNT is per customer, not per location — a customer has one tally of
 * days ordered this month. The location of the order being placed only decides
 * which table converts that tally into a rate, exactly as the society discount
 * resolves from the order's societyId.
 *
 * Pure and client-safe (no DB): the cart previews the same ladder the award path
 * later applies.
 */

import { SOCIETIES } from "./societies";

/** `settings` document key. */
export const STREAK_LADDERS_KEY = "streak-ladders";

/** Map key holding the ladder used by every location without its own. */
export const DEFAULT_LADDER_KEY = "default";

/** Seed ladder — in force until an admin saves a default. */
export const DEFAULT_LADDER = [10, 12, 14, 16, 18, 20];

export const MIN_LADDER_LENGTH = 1;
export const MAX_LADDER_LENGTH = 15;
export const MAX_LADDER_RATE = 100;

/** Map of location id (or DEFAULT_LADDER_KEY) → earn percentages by day. */
export type LadderMap = Record<string, number[]>;

/** The whole stored config: the ladders, plus locations opted out entirely. */
export interface StreakConfig {
  ladders: LadderMap;
  /** Location ids where the streak does not run at all. */
  disabled: string[];
}

const SOCIETY_IDS = new Set<string>(SOCIETIES.map((s) => s.id));

const KNOWN_KEYS = new Set<string>([DEFAULT_LADDER_KEY, ...SOCIETY_IDS]);

/**
 * Coerce arbitrary input into a usable ladder: whole percentages 0–100, at most
 * MAX_LADDER_LENGTH of them. Returns null when nothing usable survives, so the
 * caller falls back to the default rather than storing an empty ladder that
 * would earn nobody anything.
 */
export function sanitizeLadder(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const rates: number[] = [];
  for (const raw of input.slice(0, MAX_LADDER_LENGTH)) {
    // A genuine 0% rung is allowed, so this cannot test truthiness — but
    // null/undefined/"" must not become 0 the way Number() would have them.
    if (typeof raw !== "number" && typeof raw !== "string") continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    const pct = Math.round(Number(raw));
    if (!Number.isFinite(pct) || pct < 0) continue;
    rates.push(Math.min(MAX_LADDER_RATE, pct));
  }
  return rates.length >= MIN_LADDER_LENGTH ? rates : null;
}

/**
 * Coerce a stored or posted map. Unknown keys are dropped so a renamed location
 * can't leave an orphan ladder behind, and unusable ladders are dropped so the
 * location cleanly inherits the default instead.
 */
export function sanitizeLadderMap(input: unknown): LadderMap {
  const out: LadderMap = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) continue;
    const ladder = sanitizeLadder(raw);
    if (ladder) out[key] = ladder;
  }
  return out;
}

/**
 * Keep only real location ids, de-duplicated and sorted. The default key is
 * deliberately NOT accepted — switching every location off at once should be an
 * explicit act on each, not one silent flag.
 */
export function sanitizeDisabledList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  for (const value of input) {
    if (typeof value === "string" && SOCIETY_IDS.has(value)) ids.add(value);
  }
  return [...ids].sort();
}

/** Coerce the whole stored document into a usable config. */
export function sanitizeStreakConfig(input: unknown): StreakConfig {
  const raw = (input ?? {}) as { ladders?: unknown; disabled?: unknown };
  return {
    ladders: sanitizeLadderMap(raw.ladders),
    disabled: sanitizeDisabledList(raw.disabled),
  };
}

/**
 * Is the streak switched off for this location? Orders there earn nothing and
 * do not advance the customer's day count — the location is out of the scheme
 * entirely. Redeeming points already earned is unaffected.
 */
export function isStreakDisabled(
  disabled: string[] | null | undefined,
  societyId: string | null | undefined,
): boolean {
  if (!disabled?.length || !societyId) return false;
  return disabled.includes(societyId);
}

/**
 * The ladder in force for a location: its own if configured, otherwise the
 * admin-set default, otherwise the seed. Never returns an empty array, so
 * callers can index it without guarding.
 *
 * Says nothing about whether the location participates — check
 * `isStreakDisabled` for that.
 */
export function ladderFor(
  map: LadderMap | null | undefined,
  societyId: string | null | undefined,
): number[] {
  const own = societyId ? map?.[societyId] : undefined;
  if (own?.length) return own;
  const fallback = map?.[DEFAULT_LADDER_KEY];
  if (fallback?.length) return fallback;
  return DEFAULT_LADDER;
}

/**
 * The earn rate for a given day count on a ladder. Day 1 takes the first rung;
 * anything at or past the last rung takes the cap, which is what holds a
 * maxed-out customer's rate for the rest of the month.
 */
export function rateForStreak(streak: number, ladder: number[]): number {
  const rungs = ladder.length ? ladder : DEFAULT_LADDER;
  if (!(streak > 0)) return rungs[0];
  return rungs[Math.min(Math.floor(streak), rungs.length) - 1];
}
