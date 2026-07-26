import { describe, it, expect } from "vitest";
import {
  nextStreak,
  computePointsEarned,
  computePointsApplied,
  sanitizeExemptDates,
} from "./rewards";

describe("nextStreak", () => {
  it("starts a first-ever order at rung 1", () => {
    expect(nextStreak(null, "2026-08-12")).toBe(1);
  });

  it("advances on the next day", () => {
    expect(nextStreak({ count: 2, lastDate: "2026-08-12" }, "2026-08-13")).toBe(
      3,
    );
  });

  it("holds for a second order on the same day", () => {
    expect(nextStreak({ count: 3, lastDate: "2026-08-13" }, "2026-08-13")).toBe(
      3,
    );
  });

  it("advances across a gap of days — consecutiveness is not required", () => {
    expect(nextStreak({ count: 2, lastDate: "2026-08-12" }, "2026-08-20")).toBe(
      3,
    );
  });

  it("advances across a gap spanning a weekend", () => {
    // Fri 2026-08-14 → Tue 2026-08-18: two working days missed, still advances.
    expect(nextStreak({ count: 4, lastDate: "2026-08-14" }, "2026-08-18")).toBe(
      5,
    );
  });

  it("advances from the 1st to the 31st of the same month", () => {
    expect(nextStreak({ count: 5, lastDate: "2026-08-01" }, "2026-08-31")).toBe(
      6,
    );
  });

  it("keeps counting past the ladder's length", () => {
    // The rate caps at the 6th rung; the count itself is a real day tally.
    expect(nextStreak({ count: 6, lastDate: "2026-08-20" }, "2026-08-21")).toBe(
      7,
    );
    expect(nextStreak({ count: 12, lastDate: "2026-08-30" }, "2026-08-31")).toBe(
      13,
    );
  });

  it("resets on the 1st: 31 Aug → 1 Sep starts a new cycle", () => {
    expect(nextStreak({ count: 6, lastDate: "2026-08-31" }, "2026-09-01")).toBe(
      1,
    );
  });

  it("resets after a month away, however high the streak was", () => {
    expect(nextStreak({ count: 14, lastDate: "2026-08-05" }, "2026-10-02")).toBe(
      1,
    );
  });

  it("does not reset across a year boundary within the same month number", () => {
    // Dec 2026 → Dec 2027 is a different cycle, not the same December.
    expect(nextStreak({ count: 5, lastDate: "2026-12-10" }, "2027-12-10")).toBe(
      1,
    );
  });

  it("treats a corrupt or empty stored streak as a fresh start", () => {
    expect(nextStreak({ count: 0, lastDate: "2026-08-12" }, "2026-08-13")).toBe(
      1,
    );
    expect(nextStreak({ count: 3, lastDate: "" }, "2026-08-13")).toBe(1);
  });

  it("never punishes a lastDate in the future, even in a later month", () => {
    expect(nextStreak({ count: 4, lastDate: "2026-08-20" }, "2026-08-19")).toBe(
      4,
    );
    expect(nextStreak({ count: 4, lastDate: "2026-09-02" }, "2026-08-31")).toBe(
      4,
    );
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
