import { describe, it, expect } from "vitest";
import type { Society } from "./societies";
import { activeSlot, isDeliveryOpenNow, formatSlot } from "./societySlots";

const zomato: Society = {
  id: "zomato-office-sector-62",
  name: "Zomato office",
  sector: "Sector 62",
  label: "Zomato office, Sector 62",
  towers: ["T1", "T2"],
  collectRoom: false,
  deliveryCharge: 0,
  slots: [
    { orderBefore: "12:30", getTill: "13:00" },
    { orderBefore: "13:30", getTill: "14:00" },
    { orderBefore: "14:30", getTill: "15:00" },
  ],
};

const pivotal: Society = {
  id: "pivotal-paradise-sector-62",
  name: "Pivotal Paradise",
  sector: "Sector 62",
  label: "Pivotal Paradise, Sector 62",
  towers: ["T1"],
  collectRoom: true,
  deliveryCharge: 0,
  slots: [],
};

/** A UTC instant whose IST wall-clock reads hh:mm. IST = UTC + 5:30. */
function istAt(hh: number, mm: number): Date {
  return new Date(Date.UTC(2026, 6, 19, hh, mm) - 330 * 60_000);
}

describe("activeSlot", () => {
  it("returns the first slot well before any cutoff", () => {
    expect(activeSlot(zomato, istAt(11, 0))?.orderBefore).toBe("12:30");
  });

  it("stays on a slot right up to (but not at) its cutoff", () => {
    expect(activeSlot(zomato, istAt(12, 29))?.orderBefore).toBe("12:30");
  });

  it("rolls to the next slot once a cutoff is reached", () => {
    // 12:30 exactly — the 12:30 cutoff is no longer in the future.
    expect(activeSlot(zomato, istAt(12, 30))?.orderBefore).toBe("13:30");
  });

  it("returns the last slot between the middle and last cutoff", () => {
    expect(activeSlot(zomato, istAt(14, 0))?.orderBefore).toBe("14:30");
  });

  it("returns null once every cutoff has passed", () => {
    expect(activeSlot(zomato, istAt(14, 30))).toBeNull();
    expect(activeSlot(zomato, istAt(15, 45))).toBeNull();
  });

  it("returns null for a society with no slots", () => {
    expect(activeSlot(pivotal, istAt(11, 0))).toBeNull();
  });
});

describe("isDeliveryOpenNow", () => {
  it("is always true for a society with no slots", () => {
    expect(isDeliveryOpenNow(pivotal, istAt(3, 0))).toBe(true);
    expect(isDeliveryOpenNow(pivotal, istAt(23, 0))).toBe(true);
  });

  it("is true while a slot cutoff is still ahead", () => {
    expect(isDeliveryOpenNow(zomato, istAt(11, 0))).toBe(true);
    expect(isDeliveryOpenNow(zomato, istAt(14, 29))).toBe(true);
  });

  it("is false once all cutoffs have passed", () => {
    expect(isDeliveryOpenNow(zomato, istAt(14, 30))).toBe(false);
    expect(isDeliveryOpenNow(zomato, istAt(20, 0))).toBe(false);
  });
});

describe("formatSlot", () => {
  it("renders a human window label", () => {
    expect(formatSlot({ orderBefore: "12:30", getTill: "13:00" })).toBe(
      "Order before 12:30 PM · get by 1:00 PM",
    );
  });
});
