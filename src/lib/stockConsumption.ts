// What a date range took off the shelves, item by item, and where each bit of
// it went.
//
// Nothing new is recorded for this report. Every deduction in the console
// already leaves a per-item line behind it — a delivered website order, a
// Petpooja entry, a production run spending its ingredients, a wastage — and
// this module is the read side of those four trails, folded into one row per
// item with the events that made it up.
//
// The balances are taken from the SAME records rather than summed backwards.
// Each line carries the quantity it started from and the one it left behind,
// so the opening balance is simply what the first movement in the window saw.
// Adding deltas up in reverse would go wrong the moment a stock-take REPLACED
// a figure instead of nudging it, which is exactly what an audit does.
//
// Pure logic — no Mongo, no Next. See stockConsumption.test.ts.

import { roundQty } from "./stockAudits";
import { roundCurrency } from "./productionItems";
import type { SoldItemShare } from "./recipeBreakdown";

/** Which counter took the stock. */
export type ConsumptionSource = "order" | "petpooja" | "production" | "wastage";

/** One item as the catalogue has it today. */
export interface ConsumptionItem {
  id: string;
  name: string;
  unit: string;
  /** null = nothing has ever been counted for this item. */
  currentStock: number | null;
}

/** The consumption half of a movement — absent on stock coming in. */
export interface MovementEvent {
  source: ConsumptionSource;
  /** What to show in the Reference column, e.g. "Order #1042". */
  label: string;
  /** How much left the shelf, in the item's consumption unit. Positive. */
  qty: number;
  /** How much of `qty` the shelf could not cover. 0 when it was fine. */
  shortfall: number;
  /**
   * What that quantity was worth, priced when the stock moved. Positive.
   * null = the item had no price on record then, so it cannot be valued.
   */
  cost: number | null;
  /**
   * The menu items this quantity was consumed FOR, biggest share first.
   *
   * Only a sale can answer this, so it is carried on website-order events and
   * left off the rest — a production run names what it made in `label`, and
   * wastage was not consumed for anything.
   */
  soldItems?: SoldItemShare[];
}

/**
 * One stock movement, lifted out of whichever collection recorded it.
 *
 * Movements with no `event` (an addition, a stock-take) are still needed: they
 * are not consumption, but they are what the opening and closing balances are
 * read off when they happen to sit at the edge of the window.
 */
export interface StockMovement {
  /** Unique across the whole set — the source doc's id plus the item's. */
  id: string;
  itemId: string;
  /** Epoch ms, so ordering is plain arithmetic. */
  at: number;
  /** null = nothing was on record when this movement happened. */
  previousStock: number | null;
  closingStock: number | null;
  event?: MovementEvent;
  /**
   * Stock RECEIVED by this movement, for an addition. Positive.
   *
   * Only a save of type "addition" carries one. A stock-take is left without
   * it on purpose: it REPLACES the figure on record rather than topping it up,
   * so a count that happens to come out higher is a correction, not a delivery,
   * and adding it here would report stock arriving that never did.
   */
  addedQty?: number;
}

/** One consumption line, as the expanded row shows it. */
export interface ConsumptionEvent extends MovementEvent {
  id: string;
  /** ISO instant. */
  at: string;
}

/** One item's consumption over the window, with its balances either side. */
export interface ConsumptionRow {
  id: string;
  name: string;
  unit: string;
  /** Stock as it stood the instant before the range began. */
  openingStock: number | null;
  /** Stock as it stood at the end of the range's last day. */
  closingStock: number | null;
  /** Stock right now — the same figure the Stocks screen shows. */
  currentStock: number | null;
  /** Everything consumed in the window, across all four sources. */
  totalQty: number;
  /**
   * Stock received in the window. 0 when none was — which is most rows, since
   * a delivery is a far rarer event than a sale.
   *
   * The other half of why Closing is not simply Opening minus Consumed.
   */
  totalAdded: number;
  /** What that came to. null = not one event could be priced. */
  totalCost: number | null;
  /** Events left out of totalCost because the item had no price then. */
  unvaluedEvents: number;
  /** Newest first — the order the expanded row reads in. */
  events: ConsumptionEvent[];
}

/** Movements for one item, oldest first and stable on ties. */
function chronological(movements: StockMovement[]): StockMovement[] {
  return [...movements].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * Stock as it stood the instant before `from`.
 *
 * Read off the first movement at or after the boundary: whatever quantity that
 * movement started from IS the opening balance, however many audits and
 * additions came before it. With nothing on or after the boundary, nothing has
 * moved since, so the live quantity is still the one from back then.
 */
function openingStock(
  movements: StockMovement[],
  from: number,
  currentStock: number | null,
): number | null {
  const first = movements.find((m) => m.at >= from);
  return first ? first.previousStock : currentStock;
}

/**
 * Stock as it stood at `to` (exclusive — the instant the range's last day ends).
 *
 * The last movement inside the window left it where it left it. Failing that
 * the window itself was empty, so the balance is whatever the next movement
 * later found — and if there is no later one either, the live quantity.
 */
function closingStock(
  movements: StockMovement[],
  to: number,
  currentStock: number | null,
): number | null {
  for (let i = movements.length - 1; i >= 0; i -= 1) {
    if (movements[i].at < to) return movements[i].closingStock;
  }
  const next = movements.find((m) => m.at >= to);
  return next ? next.previousStock : currentStock;
}

/**
 * Fold every movement into one row per item that lost stock in the window.
 *
 * Items with no consumption are dropped: this screen answers "what went out",
 * and a list padded with untouched items buries the answer. An item whose only
 * movement was an addition or a stock-take is therefore absent by design.
 *
 * `from` is inclusive and `to` exclusive, both epoch ms — pass the instant the
 * day after the range's last day begins, so a movement at 11:59 pm on the last
 * day counts.
 */
export function buildConsumptionRows({
  items,
  movements,
  from,
  to,
}: {
  items: ConsumptionItem[];
  movements: StockMovement[];
  from: number;
  to: number;
}): ConsumptionRow[] {
  const byItem = new Map<string, StockMovement[]>();
  for (const movement of movements) {
    const list = byItem.get(movement.itemId);
    if (list) list.push(movement);
    else byItem.set(movement.itemId, [movement]);
  }

  const rows: ConsumptionRow[] = [];

  for (const item of items) {
    const history = chronological(byItem.get(item.id) ?? []);
    const consumed = history.filter(
      (m) => m.event && m.at >= from && m.at < to,
    );
    if (consumed.length === 0) continue;

    const valued = consumed.filter((m) => m.event!.cost !== null);
    // Additions inside the window, on the same terms as the consumption above.
    // Read from the same movement list, so a delivery at 11:59 pm on the last
    // day counts exactly as a sale at that hour does.
    const added = history.reduce(
      (sum, m) =>
        m.addedQty !== undefined && m.at >= from && m.at < to
          ? sum + m.addedQty
          : sum,
      0,
    );

    rows.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      openingStock: openingStock(history, from, item.currentStock),
      closingStock: closingStock(history, to, item.currentStock),
      currentStock: item.currentStock,
      totalQty: roundQty(
        consumed.reduce((sum, m) => sum + m.event!.qty, 0),
      ),
      totalAdded: roundQty(added),
      totalCost: valued.length
        ? roundCurrency(
            valued.reduce((sum, m) => sum + (m.event!.cost as number), 0),
          )
        : null,
      unvaluedEvents: consumed.length - valued.length,
      // Newest first: the most recent thing to touch an item is what someone
      // opening the row is usually looking for.
      events: [...consumed]
        .reverse()
        .map((m) => ({
          id: m.id,
          at: new Date(m.at).toISOString(),
          ...m.event!,
        })),
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** The report as the API returns it. */
export interface ConsumptionReport {
  from: string;
  to: string;
  rows: ConsumptionRow[];
}
