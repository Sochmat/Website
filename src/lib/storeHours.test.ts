import { describe, it, expect } from "vitest";
import { istToday, istWeekdayIndex } from "./ist";
import {
  emptyWeek,
  uniformWeek,
  hasAnyWindow,
  isOpenAt,
  nextOpenAt,
  nextBoundaryFrom,
  nextOpenLabel,
  normalizeWeeklyHours,
  type WeeklyHours,
} from "./storeHours";

const h = (hh: number, mm = 0) => hh * 60 + mm;

/**
 * A UTC instant whose IST wall-clock reads hh:mm on a chosen day of a known
 * week. 2026-07-19 is a Sunday, so `dayOffset` doubles as the weekday index.
 */
function istAt(dayOffset: number, hh: number, mm = 0): Date {
  return new Date(Date.UTC(2026, 6, 19 + dayOffset, hh, mm) - 330 * 60_000);
}

const SUN = 0, MON = 1, TUE = 2, FRI = 5, SAT = 6;

it("the test calendar really does start on a Sunday", () => {
  expect(istWeekdayIndex(istToday(istAt(SUN, 12)))).toBe(0);
  expect(istWeekdayIndex(istToday(istAt(SAT, 12)))).toBe(6);
});

/** Split lunch/dinner Mon–Fri, one long Saturday, closed Sunday. */
function schedule(): WeeklyHours {
  const week = emptyWeek();
  for (const d of [MON, TUE, 3, 4, FRI]) {
    week[d] = [
      { open: h(11), close: h(15) },
      { open: h(19), close: h(23) },
    ];
  }
  week[SAT] = [{ open: h(12), close: h(23, 30) }];
  return week; // Sunday stays closed
}

describe("isOpenAt", () => {
  const week = schedule();

  it("is open inside a window", () => {
    expect(isOpenAt(week, istAt(MON, 12))).toBe(true);
    expect(isOpenAt(week, istAt(MON, 20))).toBe(true);
  });

  it("is closed in the gap between the two services", () => {
    expect(isOpenAt(week, istAt(MON, 17))).toBe(false);
  });

  it("treats open as inclusive and close as exclusive", () => {
    expect(isOpenAt(week, istAt(MON, 11, 0))).toBe(true);
    expect(isOpenAt(week, istAt(MON, 14, 59))).toBe(true);
    expect(isOpenAt(week, istAt(MON, 15, 0))).toBe(false);
  });

  it("is closed before opening and after the last close", () => {
    expect(isOpenAt(week, istAt(MON, 10, 59))).toBe(false);
    expect(isOpenAt(week, istAt(MON, 23, 0))).toBe(false);
  });

  it("uses that day's own windows", () => {
    // Saturday opens at 12:00, so 11:30 is shut where Monday would be open.
    expect(isOpenAt(week, istAt(SAT, 11, 30))).toBe(false);
    expect(isOpenAt(week, istAt(SAT, 17))).toBe(true); // no midday break
  });

  it("is closed all day on a day with no windows", () => {
    for (const hh of [0, 8, 12, 20, 23]) {
      expect(isOpenAt(week, istAt(SUN, hh))).toBe(false);
    }
  });

  it("rolls over at IST midnight, not UTC midnight", () => {
    // 23:45 IST Saturday is 18:15 UTC — still Saturday, still open.
    expect(isOpenAt(week, istAt(SAT, 23, 15))).toBe(true);
    // 00:30 IST Sunday is 19:00 UTC Saturday, but the store is Sunday-closed.
    expect(isOpenAt(week, istAt(SUN + 7, 0, 30))).toBe(false);
  });

  it("honours a window closing at midnight", () => {
    const week = emptyWeek();
    week[MON] = [{ open: h(19), close: 1440 }];
    expect(isOpenAt(week, istAt(MON, 23, 59))).toBe(true);
    expect(isOpenAt(week, istAt(TUE, 0, 0))).toBe(false);
  });
});

describe("nextOpenAt", () => {
  const week = schedule();

  it("finds a later window on the same day", () => {
    const at = nextOpenAt(week, istAt(MON, 16));
    expect(at).toEqual(istAt(MON, 19));
  });

  it("finds the first window today when the store has not opened yet", () => {
    expect(nextOpenAt(week, istAt(MON, 9))).toEqual(istAt(MON, 11));
  });

  it("skips to the next day once today is done", () => {
    expect(nextOpenAt(week, istAt(MON, 23, 30))).toEqual(istAt(TUE, 11));
  });

  it("skips over a closed day", () => {
    // Saturday night → Sunday is closed → Monday morning.
    expect(nextOpenAt(week, istAt(SAT, 23, 45))).toEqual(istAt(MON + 7, 11));
  });

  it("is strictly after now, never now itself", () => {
    expect(nextOpenAt(week, istAt(MON, 11, 0))).toEqual(istAt(MON, 19));
  });

  it("is null when every day is closed", () => {
    expect(nextOpenAt(emptyWeek(), istAt(MON, 12))).toBeNull();
  });
});

describe("nextBoundaryFrom", () => {
  const week = schedule();

  it("returns the close while open", () => {
    expect(nextBoundaryFrom(week, istAt(MON, 12))).toEqual(istAt(MON, 15));
  });

  it("returns the next open while shut mid-day", () => {
    expect(nextBoundaryFrom(week, istAt(MON, 17))).toEqual(istAt(MON, 19));
  });

  it("crosses into the next open day when today is finished", () => {
    expect(nextBoundaryFrom(week, istAt(SAT, 23, 45))).toEqual(
      istAt(MON + 7, 11),
    );
  });

  it("is null when every day is closed, leaving the caller a fallback", () => {
    expect(nextBoundaryFrom(emptyWeek(), istAt(MON, 12))).toBeNull();
  });
});

describe("nextOpenLabel", () => {
  const week = schedule();

  it("gives a bare time when the store reopens today", () => {
    expect(nextOpenLabel(week, istAt(MON, 17))).toBe("7:00 PM");
  });

  it("says tomorrow when it reopens the next day", () => {
    expect(nextOpenLabel(week, istAt(MON, 23, 30))).toBe("tomorrow at 11:00 AM");
  });

  it("names the weekday when it is further out", () => {
    expect(nextOpenLabel(week, istAt(SAT, 23, 45))).toBe("Monday at 11:00 AM");
  });

  it("is null when the store never opens", () => {
    expect(nextOpenLabel(emptyWeek(), istAt(MON, 12))).toBeNull();
  });
});

describe("helpers", () => {
  it("uniformWeek applies one window to all seven days", () => {
    const week = uniformWeek(h(11), h(22, 30));
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.length === 1 && d[0].open === h(11))).toBe(true);
  });

  it("hasAnyWindow distinguishes a closed week from an open one", () => {
    expect(hasAnyWindow(emptyWeek())).toBe(false);
    expect(hasAnyWindow(schedule())).toBe(true);
  });
});

describe("normalizeWeeklyHours", () => {
  const ok = (v: unknown) => normalizeWeeklyHours(v);

  it("accepts a valid week and sorts each day's windows", () => {
    const raw = emptyWeek() as unknown as WeeklyHours;
    raw[MON] = [
      { open: h(19), close: h(23) },
      { open: h(11), close: h(15) },
    ];
    const res = ok(raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[MON].map((w) => w.open)).toEqual([h(11), h(19)]);
  });

  it("accepts a day closing at midnight", () => {
    const raw = emptyWeek();
    raw[MON] = [{ open: h(19), close: 1440 }];
    expect(ok(raw).ok).toBe(true);
  });

  it("rejects a week that is not seven days", () => {
    const res = ok([[], [], []]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/7 days/);
  });

  it("rejects a non-array week", () => {
    expect(ok(null).ok).toBe(false);
    expect(ok({ monday: [] }).ok).toBe(false);
  });

  it("rejects a window that closes before it opens", () => {
    const raw = emptyWeek();
    raw[FRI] = [{ open: h(19), close: h(2) }];
    const res = ok(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/^Friday: .*past midnight/);
  });

  it("rejects a zero-length window", () => {
    const raw = emptyWeek();
    raw[MON] = [{ open: h(11), close: h(11) }];
    expect(ok(raw).ok).toBe(false);
  });

  it("rejects overlapping windows rather than merging them", () => {
    const raw = emptyWeek();
    raw[TUE] = [
      { open: h(11), close: h(15) },
      { open: h(14), close: h(19) },
    ];
    const res = ok(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("Tuesday: windows overlap.");
  });

  it("allows windows that merely touch", () => {
    const raw = emptyWeek();
    raw[TUE] = [
      { open: h(11), close: h(15) },
      { open: h(15), close: h(19) },
    ];
    expect(ok(raw).ok).toBe(true);
  });

  it("rejects out-of-range and non-integer times", () => {
    const bad = [
      { open: -1, close: h(11) },
      { open: h(11), close: 1441 },
      { open: 1440, close: 1440 },
      { open: 11.5, close: h(15) },
      { open: "11:00", close: h(15) },
    ];
    for (const w of bad) {
      const raw = emptyWeek();
      raw[MON] = [w as never];
      expect(ok(raw).ok).toBe(false);
    }
  });
});
