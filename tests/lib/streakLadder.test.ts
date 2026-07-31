import { describe, it, expect } from "vitest";
import { SOCIETIES } from "@/lib/societies";
import {
  DEFAULT_LADDER,
  DEFAULT_LADDER_KEY,
  MAX_LADDER_LENGTH,
  isStreakDisabled,
  ladderFor,
  rateForStreak,
  sanitizeDisabledList,
  sanitizeLadder,
  sanitizeLadderMap,
  sanitizeStreakConfig,
} from "@/lib/streakLadder";

/** A real location id, so the map sanitiser accepts it. */
const SOCIETY_ID = SOCIETIES[0].id;

describe("the seed ladder", () => {
  it("is the 10 → 20 climb the feature launched with", () => {
    expect(DEFAULT_LADDER).toEqual([10, 12, 14, 16, 18, 20]);
  });
});

describe("rateForStreak", () => {
  it("walks the ladder rung by rung", () => {
    expect(rateForStreak(1, DEFAULT_LADDER)).toBe(10);
    expect(rateForStreak(2, DEFAULT_LADDER)).toBe(12);
    expect(rateForStreak(6, DEFAULT_LADDER)).toBe(20);
  });

  it("holds the last rung however high the count climbs", () => {
    expect(rateForStreak(7, DEFAULT_LADDER)).toBe(20);
    expect(rateForStreak(365, DEFAULT_LADDER)).toBe(20);
  });

  it("treats a zero or negative count as the first rung", () => {
    expect(rateForStreak(0, DEFAULT_LADDER)).toBe(10);
    expect(rateForStreak(-3, DEFAULT_LADDER)).toBe(10);
  });

  it("works on a ladder of any length", () => {
    expect(rateForStreak(1, [5])).toBe(5);
    expect(rateForStreak(9, [5])).toBe(5);
    expect(rateForStreak(3, [4, 8, 12, 16])).toBe(12);
    expect(rateForStreak(4, [4, 8, 12, 16])).toBe(16);
    expect(rateForStreak(5, [4, 8, 12, 16])).toBe(16);
  });

  it("does not require the ladder to ascend", () => {
    // Nothing stops an admin configuring a flat or falling ladder.
    expect(rateForStreak(2, [10, 10, 10])).toBe(10);
    expect(rateForStreak(3, [20, 15, 5])).toBe(5);
  });

  it("falls back to the seed rather than crashing on an empty ladder", () => {
    expect(rateForStreak(2, [])).toBe(12);
  });
});

describe("sanitizeLadder", () => {
  it("rounds and clamps each rate into 0–100", () => {
    expect(sanitizeLadder([10, 12.4, 12.6, -5, 140])).toEqual([10, 12, 13, 100]);
  });

  it("accepts a zero rate", () => {
    expect(sanitizeLadder([0, 10])).toEqual([0, 10]);
  });

  it("drops entries that are not numbers", () => {
    expect(sanitizeLadder([10, "x", null, 20])).toEqual([10, 20]);
  });

  it("truncates beyond the maximum length", () => {
    const long = Array.from({ length: MAX_LADDER_LENGTH + 6 }, () => 10);
    expect(sanitizeLadder(long)).toHaveLength(MAX_LADDER_LENGTH);
  });

  it("returns null when nothing usable survives", () => {
    expect(sanitizeLadder([])).toBeNull();
    expect(sanitizeLadder(["x", null])).toBeNull();
    expect(sanitizeLadder("10,12")).toBeNull();
    expect(sanitizeLadder(undefined)).toBeNull();
  });
});

describe("sanitizeLadderMap", () => {
  it("keeps the default key and known location ids", () => {
    expect(
      sanitizeLadderMap({
        [DEFAULT_LADDER_KEY]: [10, 20],
        [SOCIETY_ID]: [5, 15],
      }),
    ).toEqual({ [DEFAULT_LADDER_KEY]: [10, 20], [SOCIETY_ID]: [5, 15] });
  });

  it("drops unknown keys so a renamed location leaves no orphan", () => {
    expect(sanitizeLadderMap({ "no-such-society": [10, 20] })).toEqual({});
  });

  it("drops an unusable ladder so the location inherits the default", () => {
    expect(sanitizeLadderMap({ [SOCIETY_ID]: [] })).toEqual({});
    expect(sanitizeLadderMap({ [SOCIETY_ID]: "nope" })).toEqual({});
  });

  it("returns an empty map for a non-object", () => {
    expect(sanitizeLadderMap(null)).toEqual({});
    expect(sanitizeLadderMap([1, 2])).toEqual({});
  });
});

describe("ladderFor", () => {
  it("prefers the location's own ladder", () => {
    const map = {
      [DEFAULT_LADDER_KEY]: [10, 20],
      [SOCIETY_ID]: [5, 8, 11],
    };
    expect(ladderFor(map, SOCIETY_ID)).toEqual([5, 8, 11]);
  });

  it("falls back to the configured default", () => {
    const map = { [DEFAULT_LADDER_KEY]: [7, 14] };
    expect(ladderFor(map, SOCIETY_ID)).toEqual([7, 14]);
  });

  it("falls back to the seed when nothing is configured", () => {
    expect(ladderFor({}, SOCIETY_ID)).toEqual(DEFAULT_LADDER);
    expect(ladderFor(null, SOCIETY_ID)).toEqual(DEFAULT_LADDER);
    expect(ladderFor(undefined, undefined)).toEqual(DEFAULT_LADDER);
  });

  it("uses the default when no location is given", () => {
    const map = { [DEFAULT_LADDER_KEY]: [7, 14], [SOCIETY_ID]: [5] };
    expect(ladderFor(map, null)).toEqual([7, 14]);
  });
});

describe("sanitizeDisabledList", () => {
  it("keeps known location ids, de-duplicated and sorted", () => {
    expect(sanitizeDisabledList([SOCIETY_ID, SOCIETY_ID])).toEqual([SOCIETY_ID]);
  });

  it("drops unknown ids and non-strings", () => {
    expect(sanitizeDisabledList(["no-such-society", 7, null])).toEqual([]);
  });

  it("refuses the default key — switching every location off must be explicit", () => {
    expect(sanitizeDisabledList([DEFAULT_LADDER_KEY])).toEqual([]);
  });

  it("returns an empty list for a non-array", () => {
    expect(sanitizeDisabledList(undefined)).toEqual([]);
    expect(sanitizeDisabledList({ a: 1 })).toEqual([]);
  });
});

describe("isStreakDisabled", () => {
  it("is true only for a listed location", () => {
    expect(isStreakDisabled([SOCIETY_ID], SOCIETY_ID)).toBe(true);
    expect(isStreakDisabled([SOCIETY_ID], "other")).toBe(false);
  });

  it("is false when nothing is disabled or no location is given", () => {
    expect(isStreakDisabled([], SOCIETY_ID)).toBe(false);
    expect(isStreakDisabled(null, SOCIETY_ID)).toBe(false);
    expect(isStreakDisabled([SOCIETY_ID], null)).toBe(false);
  });
});

describe("sanitizeStreakConfig", () => {
  it("cleans both halves of the document", () => {
    expect(
      sanitizeStreakConfig({
        ladders: { [SOCIETY_ID]: [5, 10], bogus: [1] },
        disabled: [SOCIETY_ID, "bogus"],
      }),
    ).toEqual({ ladders: { [SOCIETY_ID]: [5, 10] }, disabled: [SOCIETY_ID] });
  });

  it("yields an empty config for junk", () => {
    expect(sanitizeStreakConfig(null)).toEqual({ ladders: {}, disabled: [] });
    expect(sanitizeStreakConfig({})).toEqual({ ladders: {}, disabled: [] });
  });

  it("lets a location keep a ladder while disabled, so re-enabling restores it", () => {
    const config = sanitizeStreakConfig({
      ladders: { [SOCIETY_ID]: [5, 10] },
      disabled: [SOCIETY_ID],
    });
    expect(config.ladders[SOCIETY_ID]).toEqual([5, 10]);
    expect(config.disabled).toEqual([SOCIETY_ID]);
  });
});
