import { describe, it, expect } from "vitest";
import type { SubscriptionCredit } from "./types";
import {
  DELIVERY_CUTOFF_HOUR_IST,
  SUGGESTION_HOUR_IST,
  MIN_LEAD_HOURS,
  deliveryCutoffAt,
  suggestionVisibleFrom,
  isDateLocked,
  isDateBookable,
  isSuggestionVisible,
  schedulableWindow,
  schedulableDates,
  validateSchedule,
  validateReschedule,
  validateUnschedule,
  accountCredits,
  expireCredits,
  suggestItemForDate,
  hash32,
  type SuggestionCandidate,
} from "./subscriptionSchedule";

const D = "2026-07-09"; // a Thursday
const at = (iso: string) => new Date(iso);

describe("constants", () => {
  it("locks at noon IST and reveals suggestions at 20:00 IST the day before", () => {
    expect(DELIVERY_CUTOFF_HOUR_IST).toBe(12);
    expect(SUGGESTION_HOUR_IST).toBe(20);
    expect(MIN_LEAD_HOURS).toBe(0);
  });
});

describe("deliveryCutoffAt", () => {
  it("is noon IST on the delivery day, i.e. 06:30 UTC", () => {
    expect(deliveryCutoffAt(D).toISOString()).toBe("2026-07-09T06:30:00.000Z");
  });
});

describe("suggestionVisibleFrom", () => {
  it("is 20:00 IST the previous day, i.e. 14:30 UTC on D-1", () => {
    expect(suggestionVisibleFrom(D).toISOString()).toBe("2026-07-08T14:30:00.000Z");
  });
});

describe("isDateLocked", () => {
  it("is unlocked one millisecond before noon IST", () => {
    expect(isDateLocked(D, at("2026-07-09T06:29:59.999Z"))).toBe(false);
  });

  it("is locked exactly at noon IST", () => {
    expect(isDateLocked(D, at("2026-07-09T06:30:00.000Z"))).toBe(true);
  });

  it("is locked for any past date", () => {
    expect(isDateLocked("2026-07-08", at("2026-07-09T00:00:00.000Z"))).toBe(true);
  });

  it("is unlocked for a future date", () => {
    expect(isDateLocked("2026-07-10", at("2026-07-09T06:30:00.000Z"))).toBe(false);
  });
});

describe("isDateBookable", () => {
  it("tracks isDateLocked while MIN_LEAD_HOURS is 0", () => {
    expect(isDateBookable(D, at("2026-07-09T06:29:59.999Z"))).toBe(true);
    expect(isDateBookable(D, at("2026-07-09T06:30:00.000Z"))).toBe(false);
  });
});

describe("isSuggestionVisible", () => {
  it("is hidden one millisecond before 20:00 IST on D-1", () => {
    expect(isSuggestionVisible(D, at("2026-07-08T14:29:59.999Z"))).toBe(false);
  });

  it("is visible exactly at 20:00 IST on D-1", () => {
    expect(isSuggestionVisible(D, at("2026-07-08T14:30:00.000Z"))).toBe(true);
  });
});

describe("schedulableWindow", () => {
  it("starts today when it is still before noon IST", () => {
    // 11:59 IST on the 9th
    expect(schedulableWindow(at("2026-07-09T06:29:00.000Z"), "2026-08-08").from).toBe(
      "2026-07-09",
    );
  });

  it("starts tomorrow once noon IST has passed", () => {
    expect(schedulableWindow(at("2026-07-09T06:30:00.000Z"), "2026-08-08").from).toBe(
      "2026-07-10",
    );
  });

  it("ends on expiresOn", () => {
    expect(schedulableWindow(at("2026-07-09T00:00:00.000Z"), "2026-08-08").to).toBe(
      "2026-08-08",
    );
  });

  it("is closed (to < from) once the plan has expired", () => {
    const w = schedulableWindow(at("2026-08-09T00:00:00.000Z"), "2026-08-08");
    expect(w.to < w.from).toBe(true);
  });
});

describe("schedulableDates", () => {
  it("includes today as a locked card once noon IST has passed", () => {
    const days = schedulableDates(at("2026-07-09T06:30:00.000Z"), "2026-07-11");
    expect(days.map((d) => d.date)).toEqual(["2026-07-09", "2026-07-10", "2026-07-11"]);
    expect(days[0]).toMatchObject({ weekday: "Thursday", locked: true });
    expect(days[1].locked).toBe(false);
  });

  it("marks today unlocked before noon IST", () => {
    const days = schedulableDates(at("2026-07-09T06:29:00.000Z"), "2026-07-10");
    expect(days[0].locked).toBe(false);
  });

  it("flags suggestion visibility per day", () => {
    // 20:30 IST on the 9th → the 10th's suggestion is live, the 11th's is not.
    const days = schedulableDates(at("2026-07-09T15:00:00.000Z"), "2026-07-11");
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.suggestionVisible]));
    expect(byDate["2026-07-10"]).toBe(true);
    expect(byDate["2026-07-11"]).toBe(false);
  });

  it("stops at expiresOn", () => {
    const days = schedulableDates(at("2026-07-09T00:00:00.000Z"), "2026-07-09");
    expect(days).toHaveLength(1);
  });

  it("caps at maxDays", () => {
    const days = schedulableDates(at("2026-07-09T00:00:00.000Z"), "2026-12-31", 5);
    expect(days).toHaveLength(5);
  });

  it("is empty for an expired plan", () => {
    expect(schedulableDates(at("2026-08-09T00:00:00.000Z"), "2026-08-08")).toEqual([]);
  });
});

const baseSchedule = {
  now: at("2026-07-09T00:00:00.000Z"), // 05:30 IST on the 9th
  date: "2026-07-10",
  expiresOn: "2026-08-08",
  planStatus: "active" as const,
  takenDates: [] as string[],
  availableCredits: 3,
  itemAllowed: true,
};

describe("validateSchedule", () => {
  it("accepts the happy path", () => {
    expect(validateSchedule(baseSchedule)).toBeNull();
  });

  it("accepts today while it is still before noon IST", () => {
    expect(validateSchedule({ ...baseSchedule, date: "2026-07-09" })).toBeNull();
  });

  it("rejects a plan that is not active", () => {
    expect(validateSchedule({ ...baseSchedule, planStatus: "pending" })).toBe(
      "plan-not-active",
    );
    expect(validateSchedule({ ...baseSchedule, planStatus: "expired" })).toBe(
      "plan-not-active",
    );
  });

  it("rejects a past date", () => {
    expect(validateSchedule({ ...baseSchedule, date: "2026-07-08" })).toBe("date-in-past");
  });

  it("rejects today once noon IST has passed", () => {
    expect(
      validateSchedule({
        ...baseSchedule,
        date: "2026-07-09",
        now: at("2026-07-09T06:30:00.000Z"),
      }),
    ).toBe("date-locked");
  });

  it("rejects a date past expiry", () => {
    expect(validateSchedule({ ...baseSchedule, date: "2026-08-09" })).toBe(
      "date-after-expiry",
    );
  });

  it("accepts the expiry date itself (inclusive)", () => {
    expect(validateSchedule({ ...baseSchedule, date: "2026-08-08" })).toBeNull();
  });

  it("rejects a date this plan already uses", () => {
    expect(validateSchedule({ ...baseSchedule, takenDates: ["2026-07-10"] })).toBe(
      "date-taken",
    );
  });

  it("rejects when no credit is available", () => {
    expect(validateSchedule({ ...baseSchedule, availableCredits: 0 })).toBe(
      "no-credit-available",
    );
  });

  it("rejects an item outside the plan's bracket or diet", () => {
    expect(validateSchedule({ ...baseSchedule, itemAllowed: false })).toBe(
      "item-not-allowed",
    );
  });
});

describe("validateReschedule", () => {
  const base = {
    now: at("2026-07-09T00:00:00.000Z"),
    fromDate: "2026-07-10",
    toDate: "2026-07-11",
    expiresOn: "2026-08-08",
    planStatus: "active" as const,
    takenDates: ["2026-07-10"],
    itemAllowed: true,
  };

  it("accepts the happy path", () => {
    expect(validateReschedule(base)).toBeNull();
  });

  it("rejects when the SOURCE date is locked, even though the target is free", () => {
    // Noon on the 10th has passed; the 11th is still wide open.
    expect(
      validateReschedule({ ...base, now: at("2026-07-10T06:30:00.000Z") }),
    ).toBe("date-locked");
  });

  it("rejects when the target date is locked", () => {
    expect(
      validateReschedule({ ...base, fromDate: "2026-07-11", toDate: "2026-07-10",
        takenDates: ["2026-07-11"], now: at("2026-07-10T06:30:00.000Z") }),
    ).toBe("date-locked");
  });

  it("allows a no-op move onto its own date (item swap)", () => {
    expect(validateReschedule({ ...base, toDate: "2026-07-10" })).toBeNull();
  });

  it("rejects a target date already taken by another credit", () => {
    expect(
      validateReschedule({ ...base, takenDates: ["2026-07-10", "2026-07-11"] }),
    ).toBe("date-taken");
  });

  it("rejects a target past expiry", () => {
    expect(validateReschedule({ ...base, toDate: "2026-08-09" })).toBe(
      "date-after-expiry",
    );
  });

  it("rejects a disallowed item", () => {
    expect(validateReschedule({ ...base, itemAllowed: false })).toBe("item-not-allowed");
  });
});

describe("validateUnschedule", () => {
  it("accepts an unlocked date", () => {
    expect(
      validateUnschedule({
        now: at("2026-07-09T00:00:00.000Z"),
        date: "2026-07-10",
        planStatus: "active",
      }),
    ).toBeNull();
  });

  it("rejects a locked date", () => {
    expect(
      validateUnschedule({
        now: at("2026-07-10T06:30:00.000Z"),
        date: "2026-07-10",
        planStatus: "active",
      }),
    ).toBe("date-locked");
  });

  it("rejects an inactive plan", () => {
    expect(
      validateUnschedule({
        now: at("2026-07-09T00:00:00.000Z"),
        date: "2026-07-10",
        planStatus: "cancelled",
      }),
    ).toBe("plan-not-active");
  });
});

const credits = (...statuses: SubscriptionCredit["status"][]): SubscriptionCredit[] =>
  statuses.map((status, i) => ({ id: `c${i + 1}`, status }));

describe("accountCredits", () => {
  it("counts every status", () => {
    const a = accountCredits(
      credits("available", "available", "scheduled", "delivered", "expired", "cancelled"),
      "2026-08-08",
      at("2026-07-09T00:00:00.000Z"),
    );
    expect(a).toMatchObject({
      total: 6,
      available: 2,
      scheduled: 1,
      delivered: 1,
      expired: 1,
      cancelled: 1,
    });
  });

  it("computes daysLeft to expiry", () => {
    const a = accountCredits(credits("available"), "2026-08-08", at("2026-07-09T00:00:00.000Z"));
    expect(a.daysLeft).toBe(30);
  });

  it("clamps daysLeft at 0 once expired", () => {
    const a = accountCredits(credits("expired"), "2026-08-08", at("2026-09-01T00:00:00.000Z"));
    expect(a.daysLeft).toBe(0);
  });

  it("is exhausted only when nothing is available and nothing is scheduled", () => {
    const now = at("2026-07-09T00:00:00.000Z");
    expect(accountCredits(credits("delivered", "delivered"), "2026-08-08", now).exhausted).toBe(true);
    expect(accountCredits(credits("delivered", "scheduled"), "2026-08-08", now).exhausted).toBe(false);
    expect(accountCredits(credits("delivered", "available"), "2026-08-08", now).exhausted).toBe(false);
  });
});

describe("expireCredits", () => {
  it("returns null on the expiry date itself — expiry is inclusive", () => {
    expect(
      expireCredits(credits("available"), "2026-08-08", at("2026-08-08T12:00:00.000Z")),
    ).toBeNull();
  });

  it("returns null before expiry", () => {
    expect(
      expireCredits(credits("available"), "2026-08-08", at("2026-07-09T00:00:00.000Z")),
    ).toBeNull();
  });

  it("returns null when the plan is not yet paid (no expiresOn)", () => {
    expect(expireCredits(credits("available"), "", at("2026-07-09T00:00:00.000Z"))).toBeNull();
  });

  it("returns null when there is nothing available to expire", () => {
    expect(
      expireCredits(credits("delivered", "scheduled"), "2026-08-08", at("2026-08-09T00:00:00.000Z")),
    ).toBeNull();
  });

  it("flips only `available` credits the day after expiry", () => {
    const now = at("2026-08-09T00:00:00.000Z");
    const out = expireCredits(
      credits("available", "scheduled", "delivered", "cancelled"),
      "2026-08-08",
      now,
    );
    expect(out).not.toBeNull();
    expect(out!.map((c) => c.status)).toEqual([
      "expired",
      "scheduled",
      "delivered",
      "cancelled",
    ]);
    expect(out![0].expiredAt).toEqual(now);
  });
});

const cand = (id: string): SuggestionCandidate => ({
  id,
  name: `item-${id}`,
  isVeg: true,
  protein: 30,
  kcal: 400,
  image: "",
});

describe("hash32", () => {
  it("is a stable FNV-1a", () => {
    expect(hash32("")).toBe(2166136261);
    expect(hash32("a")).toBe(0xe40c292c);
    expect(hash32("foobar")).toBe(0xbf9cf968);
  });
});

describe("suggestItemForDate", () => {
  const candidates = ["a", "b", "c", "d", "e"].map(cand);

  it("returns null when there are no candidates", () => {
    expect(suggestItemForDate({ date: D, candidates: [], history: [], seed: "p1" })).toBeNull();
  });

  it("is deterministic for the same inputs", () => {
    const one = suggestItemForDate({ date: D, candidates, history: [], seed: "p1" });
    const two = suggestItemForDate({ date: D, candidates, history: [], seed: "p1" });
    expect(one!.id).toBe(two!.id);
  });

  it("varies by date and by seed", () => {
    const byDate = new Set(
      ["2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"].map(
        (d) => suggestItemForDate({ date: d, candidates, history: [], seed: "p1" })!.id,
      ),
    );
    expect(byDate.size).toBeGreaterThan(1);
  });

  it("does not depend on the order of the candidate array", () => {
    const shuffled = [candidates[3], candidates[0], candidates[4], candidates[1], candidates[2]];
    const a = suggestItemForDate({ date: D, candidates, history: [], seed: "p1" });
    const b = suggestItemForDate({ date: D, candidates: shuffled, history: [], seed: "p1" });
    expect(a!.id).toBe(b!.id);
  });

  it("avoids the 3 most recently scheduled items", () => {
    const history = [
      { date: "2026-07-06", productId: "a" },
      { date: "2026-07-07", productId: "b" },
      { date: "2026-07-08", productId: "c" },
      { date: "2026-07-01", productId: "d" }, // older — not excluded
    ];
    const picked = suggestItemForDate({ date: D, candidates, history, seed: "p1" });
    expect(["d", "e"]).toContain(picked!.id);
  });

  it("still suggests something when the only candidate was just eaten", () => {
    const history = [{ date: "2026-07-08", productId: "a" }];
    const picked = suggestItemForDate({
      date: D,
      candidates: [cand("a")],
      history,
      seed: "p1",
    });
    expect(picked!.id).toBe("a");
  });

  it("never excludes so much that the pool empties", () => {
    const history = ["a", "b", "c", "d", "e"].map((productId, i) => ({
      date: `2026-07-0${i + 1}`,
      productId,
    }));
    expect(suggestItemForDate({ date: D, candidates, history, seed: "p1" })).not.toBeNull();
  });

  it("ignores history entries for items no longer on the menu", () => {
    const history = [{ date: "2026-07-08", productId: "gone" }];
    expect(suggestItemForDate({ date: D, candidates, history, seed: "p1" })).not.toBeNull();
  });
});
