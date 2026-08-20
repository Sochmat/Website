import { describe, expect, it } from "vitest";
import {
  buildConsumptionRows,
  type ConsumptionItem,
  type ConsumptionSource,
  type StockMovement,
} from "@/lib/stockConsumption";

const DAY = 86_400_000;
/** 1 Aug 2026, 00:00 IST — the window every test below runs over. */
const FROM = Date.UTC(2026, 6, 31, 18, 30);
/** 11 Aug 2026, 00:00 IST — exclusive, so all of the 10th is inside. */
const TO = FROM + 10 * DAY;

const PANEER: ConsumptionItem = {
  id: "paneer",
  name: "Paneer",
  unit: "gm",
  currentStock: 3200,
};

function consumed(
  at: number,
  qty: number,
  previousStock: number | null,
  closingStock: number,
  {
    source = "order" as ConsumptionSource,
    label = "Order #1",
    cost = null as number | null,
    shortfall = 0,
    id = `c${at}-${qty}`,
    itemId = "paneer",
  } = {},
): StockMovement {
  return {
    id,
    itemId,
    at,
    previousStock,
    closingStock,
    event: { source, label, qty, shortfall, cost },
  };
}

function balance(
  at: number,
  previousStock: number | null,
  closingStock: number,
  id = `b${at}`,
): StockMovement {
  return { id, itemId: "paneer", at, previousStock, closingStock };
}

/** A balance movement that was stock RECEIVED, not a stock-take. */
function received(
  at: number,
  addedQty: number,
  previousStock: number | null,
  closingStock: number,
  id = `r${at}-${addedQty}`,
): StockMovement {
  return { id, itemId: "paneer", at, previousStock, closingStock, addedQty };
}

function build(movements: StockMovement[], items = [PANEER]) {
  return buildConsumptionRows({ items, movements, from: FROM, to: TO });
}

describe("buildConsumptionRows", () => {
  it("lists every consumption event behind an item, newest first", () => {
    const [row] = build([
      consumed(FROM + DAY, 10, 5000, 4990, { label: "Order #1042" }),
      consumed(FROM + 3 * DAY, 100, 4990, 4890, {
        source: "petpooja",
        label: "Petpooja upload — items.xlsx",
      }),
    ]);

    expect(row.events.map((e) => e.label)).toEqual([
      "Petpooja upload — items.xlsx",
      "Order #1042",
    ]);
    expect(row.totalQty).toBe(110);
  });

  it("reads the opening balance off the first movement in the window", () => {
    const [row] = build([
      consumed(FROM + DAY, 10, 5000, 4990),
      consumed(FROM + 2 * DAY, 25, 4990, 4965),
    ]);

    expect(row.openingStock).toBe(5000);
    expect(row.closingStock).toBe(4965);
    expect(row.currentStock).toBe(3200);
  });

  it("takes the opening balance from an addition when that came first", () => {
    // Stock was topped up before anything was sold: 5000 is what the window
    // opened on, even though the first CONSUMPTION saw 6000.
    const [row] = build([
      balance(FROM + 1000, 5000, 6000),
      consumed(FROM + DAY, 10, 6000, 5990),
    ]);

    expect(row.openingStock).toBe(5000);
  });

  it("survives a stock-take that replaced the figure mid-window", () => {
    // Summing the deltas backwards would put the opening at 4990 + 10 = 5000
    // and miss that the count wrote off 2000 gm. Reading the boundary record
    // gets it right.
    const [row] = build([
      consumed(FROM + DAY, 10, 5000, 4990),
      balance(FROM + 2 * DAY, 4990, 3000),
      consumed(FROM + 3 * DAY, 40, 3000, 2960),
    ]);

    expect(row.openingStock).toBe(5000);
    expect(row.closingStock).toBe(2960);
    expect(row.totalQty).toBe(50);
  });

  it("falls back to the live quantity when nothing moved after the start", () => {
    // Consumption sits before the window; nothing since, so the shelf still
    // holds what it holds now — on both sides.
    const rows = build([consumed(FROM - DAY, 10, 5000, 4990)]);
    expect(rows).toEqual([]);
  });

  it("closes on the movement after the window when the window itself was empty", () => {
    // Consumed inside the range, then again after it. The closing balance is
    // what the in-range event left, not what the later one did.
    const [row] = build([
      consumed(FROM + DAY, 10, 5000, 4990),
      consumed(TO + DAY, 500, 4990, 4490),
    ]);

    expect(row.openingStock).toBe(5000);
    expect(row.closingStock).toBe(4990);
    expect(row.events).toHaveLength(1);
  });

  it("counts an event on the last day of the range as inside it", () => {
    // 10 Aug, 11:59 pm IST — `to` is exclusive at midnight, so this is in.
    const [row] = build([consumed(TO - 60_000, 10, 5000, 4990)]);
    expect(row.totalQty).toBe(10);
  });

  it("excludes an event at the instant the range ends", () => {
    expect(build([consumed(TO, 10, 5000, 4990)])).toEqual([]);
  });

  it("drops items whose only movements were additions or stock-takes", () => {
    expect(build([balance(FROM + DAY, 5000, 9000)])).toEqual([]);
  });

  it("totals the stock received in the window", () => {
    const [row] = build([
      received(FROM + DAY, 4000, 5000, 9000),
      consumed(FROM + 2 * DAY, 10, 9000, 8990),
      received(FROM + 3 * DAY, 500, 8990, 9490),
    ]);

    expect(row.totalAdded).toBe(4500);
    expect(row.totalQty).toBe(10);
  });

  it("reports nothing added when the range only saw consumption", () => {
    const [row] = build([consumed(FROM + DAY, 10, 5000, 4990)]);

    expect(row.totalAdded).toBe(0);
  });

  it("ignores a stock-take that happened to count higher", () => {
    // A count that comes out above the books is a correction, not a delivery —
    // it carries no addedQty, and must not report stock arriving.
    const [row] = build([
      balance(FROM + DAY, 5000, 9000),
      consumed(FROM + 2 * DAY, 10, 9000, 8990),
    ]);

    expect(row.totalAdded).toBe(0);
  });

  it("counts only the stock received inside the window", () => {
    const [row] = build([
      received(FROM - DAY, 1000, 4000, 5000),
      consumed(FROM + DAY, 10, 5000, 4990),
      received(TO, 2000, 4990, 6990),
    ]);

    expect(row.totalAdded).toBe(0);
  });

  it("totals the value and reports what could not be priced", () => {
    const [row] = build([
      consumed(FROM + DAY, 10, 5000, 4990, { cost: 12.5, id: "a" }),
      consumed(FROM + 2 * DAY, 20, 4990, 4970, { cost: 25, id: "b" }),
      consumed(FROM + 3 * DAY, 30, 4970, 4940, { cost: null, id: "c" }),
    ]);

    expect(row.totalCost).toBe(37.5);
    expect(row.unvaluedEvents).toBe(1);
  });

  it("leaves the value unstated when not one event could be priced", () => {
    const [row] = build([consumed(FROM + DAY, 10, 5000, 4990, { cost: null })]);
    expect(row.totalCost).toBeNull();
    expect(row.unvaluedEvents).toBe(1);
  });

  it("keeps an untracked item's balances null rather than guessing zero", () => {
    const [row] = build(
      [consumed(FROM + DAY, 10, null, 0, { shortfall: 10 })],
      [{ id: "paneer", name: "Paneer", unit: "gm", currentStock: null }],
    );

    expect(row.openingStock).toBeNull();
    expect(row.currentStock).toBeNull();
    expect(row.events[0].shortfall).toBe(10);
  });

  it("keeps each item's history to itself and sorts rows by name", () => {
    const rows = buildConsumptionRows({
      items: [
        PANEER,
        { id: "atta", name: "Atta", unit: "kg", currentStock: 40 },
      ],
      movements: [
        consumed(FROM + DAY, 10, 5000, 4990),
        consumed(FROM + DAY, 2, 50, 48, { itemId: "atta", id: "atta-1" }),
      ],
      from: FROM,
      to: TO,
    });

    expect(rows.map((r) => r.name)).toEqual(["Atta", "Paneer"]);
    expect(rows[0].totalQty).toBe(2);
    expect(rows[0].openingStock).toBe(50);
    expect(rows[1].totalQty).toBe(10);
  });

  it("rounds away float noise in the total", () => {
    const [row] = build([
      consumed(FROM + DAY, 0.1, 5000, 4999.9, { id: "a" }),
      consumed(FROM + 2 * DAY, 0.2, 4999.9, 4999.7, { id: "b" }),
    ]);
    expect(row.totalQty).toBe(0.3);
  });
});

describe("buildConsumptionRows — made-to-order items", () => {
  const GRAVY: ConsumptionItem = {
    id: "paneer",
    name: "Paneer Gravy",
    unit: "gm",
    // A figure left over from before the item was flagged. It must not surface.
    currentStock: 4000,
    onSpot: true,
  };

  /** A made-to-order event: a quantity made, with no balance either side. */
  const made = (at: number, qty: number, id = `m${at}-${qty}`): StockMovement => ({
    id,
    itemId: "paneer",
    at,
    previousStock: null,
    closingStock: null,
    event: { source: "order", label: "Order #1", qty, shortfall: 0, cost: null },
  });

  const buildOnSpot = (movements: StockMovement[]) =>
    buildConsumptionRows({ items: [GRAVY], movements, from: FROM, to: TO });

  it("totals what was made over the range", () => {
    const [row] = buildOnSpot([
      made(FROM + DAY, 500),
      made(FROM + 2 * DAY, 250),
    ]);

    expect(row.totalQty).toBe(750);
    expect(row.onSpot).toBe(true);
  });

  it("reports no balances at all, not even the stored one", () => {
    // 4000 is still on the document; showing it would be a figure nothing has
    // maintained since the item stopped being stocked.
    const [row] = buildOnSpot([made(FROM + DAY, 500)]);

    expect(row.openingStock).toBeNull();
    expect(row.closingStock).toBeNull();
    expect(row.currentStock).toBeNull();
  });

  it("is still dropped when nothing was made in the range", () => {
    expect(buildOnSpot([made(FROM - DAY, 500)])).toEqual([]);
  });

  it("leaves a stocked item's balances alone", () => {
    const [row] = buildConsumptionRows({
      items: [PANEER],
      movements: [consumed(FROM + DAY, 10, 5000, 4990)],
      from: FROM,
      to: TO,
    });

    expect(row.onSpot).toBeUndefined();
    expect(row.openingStock).toBe(5000);
  });
});
