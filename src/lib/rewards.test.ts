import { describe, it, expect } from "vitest";
import {
  POINT_RATES,
  MAX_POINT_RATE,
  rateForStreak,
  isExemptDay,
  nextStreak,
  computePointsEarned,
  computePointsApplied,
  sanitizeExemptDates,
} from "./rewards";

const NO_HOLIDAYS = new Set<string>();

describe("the rate ladder", () => {
  it("climbs 10 → 20 across the first six streak days", () => {
    expect(POINT_RATES).toEqual([10, 12, 14, 16, 18, 20]);
    expect(rateForStreak(1)).toBe(10);
    expect(rateForStreak(2)).toBe(12);
    expect(rateForStreak(3)).toBe(14);
    expect(rateForStreak(4)).toBe(16);
    expect(rateForStreak(5)).toBe(18);
    expect(rateForStreak(6)).toBe(20);
  });

  it("caps at 20% however long the streak runs", () => {
    expect(MAX_POINT_RATE).toBe(20);
    expect(rateForStreak(7)).toBe(20);
    expect(rateForStreak(20)).toBe(20);
    expect(rateForStreak(365)).toBe(20);
  });

  it("treats a zero or negative streak as the first day", () => {
    expect(rateForStreak(0)).toBe(10);
    expect(rateForStreak(-3)).toBe(10);
  });
});

describe("isExemptDay", () => {
  it("exempts Saturday and Sunday", () => {
    expect(isExemptDay("2026-07-25", NO_HOLIDAYS)).toBe(true); // Saturday
    expect(isExemptDay("2026-07-26", NO_HOLIDAYS)).toBe(true); // Sunday
  });

  it("does not exempt a plain working day", () => {
    expect(isExemptDay("2026-07-22", NO_HOLIDAYS)).toBe(false); // Wednesday
  });

  it("exempts an admin holiday date", () => {
    expect(isExemptDay("2026-07-22", new Set(["2026-07-22"]))).toBe(true);
  });
});

describe("nextStreak", () => {
  it("starts a first-ever order at day 1", () => {
    expect(nextStreak(null, "2026-07-20", NO_HOLIDAYS)).toBe(1);
  });

  it("advances on consecutive working days", () => {
    expect(
      nextStreak({ count: 2, lastDate: "2026-07-20" }, "2026-07-21", NO_HOLIDAYS),
    ).toBe(3);
  });

  it("holds the streak for a second order on the same day", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-21" }, "2026-07-21", NO_HOLIDAYS),
    ).toBe(3);
  });

  it("resets when a working day was missed", () => {
    // Wednesday missed entirely: Tue → Thu.
    expect(
      nextStreak({ count: 5, lastDate: "2026-07-21" }, "2026-07-23", NO_HOLIDAYS),
    ).toBe(1);
  });

  it("survives the weekend: Friday → Monday advances", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-24" }, "2026-07-27", NO_HOLIDAYS),
    ).toBe(4);
  });

  it("breaks when Monday is also missed: Friday → Tuesday resets", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-24" }, "2026-07-28", NO_HOLIDAYS),
    ).toBe(1);
  });

  it("counts a weekend order: Friday → Saturday advances", () => {
    expect(
      nextStreak({ count: 3, lastDate: "2026-07-24" }, "2026-07-25", NO_HOLIDAYS),
    ).toBe(4);
  });

  it("skips an admin holiday: Tuesday → Thursday advances", () => {
    expect(
      nextStreak(
        { count: 4, lastDate: "2026-07-21" },
        "2026-07-23",
        new Set(["2026-07-22"]),
      ),
    ).toBe(5);
  });

  it("chains a holiday Friday into the weekend", () => {
    // Thu → Mon, with Friday declared a holiday and Sat/Sun exempt.
    expect(
      nextStreak(
        { count: 2, lastDate: "2026-07-23" },
        "2026-07-27",
        new Set(["2026-07-24"]),
      ),
    ).toBe(3);
  });

  it("treats a corrupt or empty stored streak as a fresh start", () => {
    expect(nextStreak({ count: 0, lastDate: "2026-07-20" }, "2026-07-21", NO_HOLIDAYS)).toBe(1);
    expect(nextStreak({ count: 3, lastDate: "" }, "2026-07-21", NO_HOLIDAYS)).toBe(1);
  });

  it("never punishes a lastDate in the future", () => {
    expect(
      nextStreak({ count: 4, lastDate: "2026-07-28" }, "2026-07-27", NO_HOLIDAYS),
    ).toBe(4);
  });
});

describe("computePointsEarned", () => {
  it("takes the rate off the pre-tax base, rounded to a whole point", () => {
    expect(computePointsEarned(450, 14)).toBe(63);
    expect(computePointsEarned(500, 10)).toBe(50);
    expect(computePointsEarned(500, 20)).toBe(100);
  });

  it("rounds a half point up", () => {
    expect(computePointsEarned(105, 10)).toBe(11); // 10.5
  });

  it("earns nothing on a zero or negative base", () => {
    expect(computePointsEarned(0, 20)).toBe(0);
    expect(computePointsEarned(-100, 20)).toBe(0);
  });

  it("earns nothing at a zero rate", () => {
    expect(computePointsEarned(500, 0)).toBe(0);
  });
});

describe("computePointsApplied", () => {
  it("applies the full balance when it fits under the payable minus ₹1", () => {
    expect(computePointsApplied(200, 493)).toEqual({
      pointsApplied: 200,
      amountPayable: 293,
    });
  });

  it("caps so ₹1 always remains payable for Razorpay", () => {
    expect(computePointsApplied(1000, 400)).toEqual({
      pointsApplied: 399,
      amountPayable: 1,
    });
  });

  it("applies nothing once the wallet already took the payable to ₹1", () => {
    expect(computePointsApplied(1000, 1)).toEqual({
      pointsApplied: 0,
      amountPayable: 1,
    });
  });

  it("floors a fractional balance and never goes negative", () => {
    expect(computePointsApplied(50.9, 500)).toEqual({
      pointsApplied: 50,
      amountPayable: 450,
    });
    expect(computePointsApplied(-20, 500)).toEqual({
      pointsApplied: 0,
      amountPayable: 500,
    });
  });

  it("applies nothing on a zero balance", () => {
    expect(computePointsApplied(0, 500)).toEqual({
      pointsApplied: 0,
      amountPayable: 500,
    });
  });
});

describe("sanitizeExemptDates", () => {
  it("keeps only well-formed dates, de-duplicated and sorted", () => {
    expect(
      sanitizeExemptDates([
        "2026-08-15",
        "2026-01-26",
        "2026-08-15",
        "15-08-2026",
        "not a date",
        42,
        null,
      ]),
    ).toEqual(["2026-01-26", "2026-08-15"]);
  });

  it("returns an empty list for a non-array", () => {
    expect(sanitizeExemptDates(undefined)).toEqual([]);
    expect(sanitizeExemptDates("2026-08-15")).toEqual([]);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeExemptDates([" 2026-08-15 "])).toEqual(["2026-08-15"]);
  });
});
