import { describe, it, expect } from "vitest";
import {
  IST_OFFSET_MIN,
  toIstDate,
  istInstant,
  istToday,
  addIstDays,
  istDaysBetween,
  istWeekday,
} from "./ist";

describe("IST_OFFSET_MIN", () => {
  it("is UTC+05:30", () => {
    expect(IST_OFFSET_MIN).toBe(330);
  });
});

describe("istInstant", () => {
  it("maps noon IST to 06:30 UTC", () => {
    expect(istInstant("2026-07-09", 12, 0).toISOString()).toBe(
      "2026-07-09T06:30:00.000Z",
    );
  });

  it("maps 20:00 IST to 14:30 UTC", () => {
    expect(istInstant("2026-07-08", 20, 0).toISOString()).toBe(
      "2026-07-08T14:30:00.000Z",
    );
  });

  it("maps midnight IST to 18:30 UTC the previous day", () => {
    expect(istInstant("2026-07-09", 0, 0).toISOString()).toBe(
      "2026-07-08T18:30:00.000Z",
    );
  });
});

describe("toIstDate", () => {
  it("keeps the same day just before the 18:30 UTC boundary", () => {
    expect(toIstDate(new Date("2026-07-09T18:29:59.999Z"))).toBe("2026-07-09");
  });

  it("rolls to the next day at the 18:30 UTC boundary", () => {
    expect(toIstDate(new Date("2026-07-09T18:30:00.000Z"))).toBe("2026-07-10");
  });

  it("round-trips with istInstant", () => {
    expect(toIstDate(istInstant("2026-01-01", 0, 0))).toBe("2026-01-01");
    expect(toIstDate(istInstant("2026-01-01", 23, 59))).toBe("2026-01-01");
  });
});

describe("istToday", () => {
  it("is toIstDate of now", () => {
    const now = new Date("2026-07-09T19:00:00.000Z");
    expect(istToday(now)).toBe("2026-07-10");
  });
});

describe("addIstDays", () => {
  it("adds within a month", () => {
    expect(addIstDays("2026-07-09", 1)).toBe("2026-07-10");
  });

  it("crosses a month boundary", () => {
    expect(addIstDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("crosses a year boundary", () => {
    expect(addIstDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addIstDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addIstDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("skips the leap day in a non-leap year", () => {
    expect(addIstDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("subtracts with a negative delta", () => {
    expect(addIstDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds the 30-day credit validity window", () => {
    expect(addIstDays("2026-07-09", 30)).toBe("2026-08-08");
  });
});

describe("istDaysBetween", () => {
  it("is zero for the same date", () => {
    expect(istDaysBetween("2026-07-09", "2026-07-09")).toBe(0);
  });

  it("is positive when `to` is later", () => {
    expect(istDaysBetween("2026-07-09", "2026-08-08")).toBe(30);
  });

  it("is negative when `to` is earlier", () => {
    expect(istDaysBetween("2026-07-09", "2026-07-08")).toBe(-1);
  });

  it("crosses a year boundary", () => {
    expect(istDaysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("istWeekday", () => {
  it("names the weekday", () => {
    expect(istWeekday("2026-07-09")).toBe("Thursday");
    expect(istWeekday("2026-07-10")).toBe("Friday");
    expect(istWeekday("2026-07-12")).toBe("Sunday");
  });
});
