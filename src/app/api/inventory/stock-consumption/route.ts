// The Stock Consumption report: what left the shelves over a date range, and
// which counter took it.
//
// Read-only. Four collections record a deduction, each in its own shape, and
// this route normalizes all four into the flat movement list src/lib/
// stockConsumption.ts folds into rows. Additions and stock-takes are read too
// — not as consumption, but because the balances either side of the window are
// taken off whichever movement sits at the boundary, whatever kind it was.
//
// Everything from `from` onwards is fetched, not just the window: when nothing
// moved inside the range, the closing balance has to come from the next
// movement after it.

import { NextRequest, NextResponse } from "next/server";
import type { Document, ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  STOCK_AUDITS_COLLECTION,
  WASTAGES_COLLECTION,
} from "@/lib/inventoryDb";
import {
  ORDER_CONSUMPTIONS_COLLECTION,
  namedOrderItems,
} from "@/lib/orderStock";
import { orderedProducts, type StoredOrderItem } from "@/lib/orderConsumption";
import {
  loadItemRecipesByNameKey,
  loadOnSpotProductionItems,
} from "@/lib/stockSpend";
import {
  componentBreakdown,
  type ComponentBreakdown,
  type SoldItemShare,
} from "@/lib/recipeBreakdown";
import { PETPOOJA_UPLOADS_COLLECTION } from "@/lib/petpoojaUpload";
import { addIstDays, istDaysBetween, istInstant, istToday } from "@/lib/ist";
import type { AuditKind } from "@/lib/stockAudits";
import {
  buildConsumptionRows,
  type ConsumptionItem,
  type ConsumptionSource,
  type StockMovement,
} from "@/lib/stockConsumption";

/** yyyy-mm-dd, the only date shape this route speaks. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How wide a range may be.
 *
 * Every movement from the start date onwards is read to build the report, so
 * an unbounded range would scan the whole history on every keystroke of the
 * picker. A year covers any question this screen is meant to answer.
 */
const MAX_RANGE_DAYS = 366;

function isKind(value: string | null): value is AuditKind {
  return value === "raw" || value === "production";
}

/** A finite number, or null for anything else — including a missing field. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Stock lines are stored as AuditLine; only these fields are read back. */
interface StoredLine {
  id?: unknown;
  name?: unknown;
  previousStock?: unknown;
  closingStock?: unknown;
  addedQty?: unknown;
  consumedQty?: unknown;
  shortfall?: unknown;
  changeCost?: unknown;
}

function toLines(value: unknown): StoredLine[] {
  return Array.isArray(value) ? (value as StoredLine[]) : [];
}

/**
 * A consumption line as one movement.
 *
 * `changeCost` is signed the way the trail writes it — negative, because stock
 * went out. The report talks about what was consumed rather than which
 * direction it moved, so the sign is dropped here.
 */
function consumptionMovement(
  line: StoredLine,
  at: Date,
  docId: string,
  source: ConsumptionSource,
  label: string,
  soldItems?: SoldItemShare[],
): StockMovement | null {
  const itemId = typeof line.id === "string" ? line.id : String(line.id ?? "");
  if (!itemId) return null;

  const cost = num(line.changeCost);

  return {
    id: `${source}:${docId}:${itemId}`,
    itemId,
    at: at.getTime(),
    previousStock: num(line.previousStock),
    closingStock: num(line.closingStock),
    event: {
      source,
      label,
      qty: num(line.consumedQty) ?? 0,
      shortfall: num(line.shortfall) ?? 0,
      cost: cost === null ? null : Math.abs(cost),
      ...(soldItems && soldItems.length > 0 ? { soldItems } : {}),
    },
  };
}

/**
 * A line that only moves the balance — an addition, or a stock-take.
 *
 * `received` separates the two. A stock-take REPLACES the figure on record, so
 * one that comes out higher is a correction to a bad count, not stock arriving;
 * only an addition reports a quantity into the Added column. See AuditType.
 */
function balanceMovement(
  line: StoredLine,
  at: Date,
  docId: string,
  received: boolean,
): StockMovement | null {
  const itemId = typeof line.id === "string" ? line.id : String(line.id ?? "");
  if (!itemId) return null;
  const addedQty = num(line.addedQty);
  return {
    id: `audit:${docId}:${itemId}`,
    itemId,
    at: at.getTime(),
    previousStock: num(line.previousStock),
    closingStock: num(line.closingStock),
    // A negative would be a correction dressed as a delivery, and an absent
    // one is a line that never recorded what it took in — neither is a receipt.
    ...(received && addedQty !== null && addedQty > 0 ? { addedQty } : {}),
  };
}

/**
 * A made-to-order item as one movement.
 *
 * The balances are null because there are none: nothing was drawn down, so
 * there is no before and no after. What it carries is how much was made and
 * what that was worth — see OnSpotLine and ConsumptionItem.onSpot.
 *
 * A shortfall is impossible for the same reason. The shelf could not fail to
 * cover this; there was no shelf, and whatever it is made of was drawn down on
 * its own lines, where a shortfall CAN be reported.
 */
function onSpotMovement(
  line: StoredLine & { qty?: unknown; cost?: unknown },
  at: Date,
  docId: string,
  source: ConsumptionSource,
  label: string,
): StockMovement | null {
  const itemId = typeof line.id === "string" ? line.id : String(line.id ?? "");
  if (!itemId) return null;

  return {
    id: `onspot:${source}:${docId}:${itemId}`,
    itemId,
    at: at.getTime(),
    previousStock: null,
    closingStock: null,
    event: {
      source,
      label,
      qty: num(line.qty) ?? 0,
      shortfall: 0,
      cost: num(line.cost),
    },
  };
}

/** The menu items behind each component of one order, keyed by component id. */
type SharesByRef = Map<string, SoldItemShare[]>;

/** A stored or freshly-built breakdown, narrowed to the shelf being reported. */
function sharesByRef(value: unknown, refType: AuditKind): SharesByRef {
  const map: SharesByRef = new Map();
  if (!Array.isArray(value)) return map;

  for (const entry of value as ComponentBreakdown[]) {
    if (entry?.refType !== refType) continue;
    const refId = String(entry.refId ?? "");
    const sold = Array.isArray(entry.sold) ? entry.sold : [];
    if (refId && sold.length > 0) map.set(refId, sold);
  }
  return map;
}

/**
 * Rebuilt shares, trusted with their figures only while they still add up.
 *
 * A breakdown worked out today from a recipe that has been rewritten since the
 * order was deducted would put confident numbers against a split that never
 * happened. The item NAMES came off the order itself and are right either way,
 * so those stay and the quantities go.
 */
function reconciled(
  shares: SoldItemShare[],
  consumedQty: number,
): SoldItemShare[] {
  const total = shares.reduce((sum, share) => sum + (share.qty ?? 0), 0);
  if (Math.abs(total - consumedQty) <= 0.001) return shares;

  return shares.map((share) => ({
    name: share.name,
    ...(share.variantName ? { variantName: share.variantName } : {}),
  }));
}

/** "Production run — Gravy, Sauce +2 more", from the items the save produced. */
function productionLabel(lines: StoredLine[]): string {
  const names = lines
    .map((l) => String(l.name ?? "").trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) return "Production run";
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length - 2;
  return `Production run — ${shown}${rest > 0 ? ` +${rest} more` : ""}`;
}

/** Where a Petpooja entry came from, said the way the tab says it. */
function petpoojaLabel(doc: Document): string {
  if (doc.source === "manual") return "Petpooja bulk entry";
  const fileName = String(doc.fileName ?? "").trim();
  return fileName ? `Petpooja upload — ${fileName}` : "Petpooja upload";
}

/**
 * One item's consumption over a date range, broken down per website order and
 * per Petpooja entry, with the balance either side of the window.
 *
 * Raw materials and production items are reported separately — they are
 * counted separately everywhere else in the console, and a single list mixing
 * grams of paneer with portions of gravy would not add up to anything.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const kind = params.get("kind");
    if (!isKind(kind)) {
      return NextResponse.json(
        { success: false, message: "kind must be raw or production" },
        { status: 400 },
      );
    }

    const today = istToday(new Date());
    const from = params.get("from") ?? today;
    const to = params.get("to") ?? today;

    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return NextResponse.json(
        { success: false, message: "from and to must be yyyy-mm-dd dates" },
        { status: 400 },
      );
    }
    if (to < from) {
      return NextResponse.json(
        { success: false, message: "to cannot be before from" },
        { status: 400 },
      );
    }
    if (istDaysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
      return NextResponse.json(
        {
          success: false,
          message: `Pick a range of ${MAX_RANGE_DAYS} days or fewer`,
        },
        { status: 400 },
      );
    }

    // IST day boundaries: the kitchen's day, not the browser's or the server's.
    // `to` is exclusive, so a deduction at 11:59 pm on the last day is inside.
    const fromInstant = istInstant(from, 0, 0);
    const toInstant = istInstant(addIstDays(to, 1), 0, 0);

    const { db } = await connectToDatabase();

    const itemCollection =
      kind === "raw" ? RAW_MATERIALS_COLLECTION : PRODUCTION_ITEMS_COLLECTION;
    // The field the order and Petpooja trails keep this kind's lines under.
    const linesField = kind === "raw" ? "rawLines" : "productionLines";

    const [itemDocs, orderDocs, petpoojaDocs, auditDocs, wastageDocs] =
      await Promise.all([
        db
          .collection(itemCollection)
          .find(
            {},
            {
              projection: {
                name: 1,
                consumptionUnit: 1,
                currentStock: 1,
                // Production items only; absent on every raw material, which
                // reads as false and is exactly right — a raw material is
                // always stocked.
                onSpot: 1,
              },
            },
          )
          .toArray(),
        db
          .collection(ORDER_CONSUMPTIONS_COLLECTION)
          .find(
            { consumedAt: { $gte: fromInstant } },
            {
              projection: {
                orderId: 1,
                orderNumber: 1,
                consumedAt: 1,
                breakdown: 1,
                [linesField]: 1,
                // Made-to-order items are production items whatever shelf is
                // being reported, so this is read only on that tab.
                ...(kind === "production" ? { onSpotLines: 1 } : {}),
              },
            },
          )
          .toArray(),
        db
          .collection(PETPOOJA_UPLOADS_COLLECTION)
          .find(
            { uploadedAt: { $gte: fromInstant } },
            {
              projection: {
                uploadedAt: 1,
                source: 1,
                fileName: 1,
                [`consumption.${linesField}`]: 1,
                ...(kind === "production"
                  ? { "consumption.onSpotLines": 1 }
                  : {}),
              },
            },
          )
          .toArray(),
        db
          .collection(STOCK_AUDITS_COLLECTION)
          .find(
            { savedAt: { $gte: fromInstant } },
            {
              projection: {
                kind: 1,
                // Tells an addition from a stock-take, which is what decides
                // whether a line counts as stock received.
                type: 1,
                savedAt: 1,
                lines: 1,
                consumedLines: 1,
              },
            },
          )
          .toArray(),
        db
          .collection(WASTAGES_COLLECTION)
          .find(
            { kind, recordedAt: { $gte: fromInstant } },
            {
              projection: {
                refId: 1,
                recordedAt: 1,
                qty: 1,
                cost: 1,
                shortfall: 1,
                previousStock: 1,
                closingStock: 1,
              },
            },
          )
          .toArray(),
      ]);

    const items: ConsumptionItem[] = itemDocs.map((doc) => ({
      id: String(doc._id),
      name: String(doc.name ?? ""),
      unit: String(doc.consumptionUnit ?? ""),
      currentStock: num(doc.currentStock),
      // A stock figure may still be stored from before the item was flagged;
      // buildConsumptionRows drops it rather than showing a number nothing has
      // maintained since.
      ...(doc.onSpot === true ? { onSpot: true } : {}),
    }));
    // What belongs to this kind. A production run's consumedLines mix both
    // shelves in one array, so membership is the only thing that separates
    // them — and it drops lines for an item that has since been deleted, whose
    // consumption there is no longer anywhere to show.
    const ofThisKind = new Set(items.map((item) => item.id));

    const movements: StockMovement[] = [];
    const push = (movement: StockMovement | null) => {
      if (movement && ofThisKind.has(movement.itemId)) movements.push(movement);
    };

    // Orders deducted before the breakdown was recorded still have their item
    // list on the order itself, so the attribution can be worked out now. Done
    // in one pass for all of them, and it shrinks to nothing as those orders
    // age out of the ranges anyone looks at.
    const rebuilt = new Map<string, SharesByRef>();
    const missing = orderDocs.filter(
      (doc) => !Array.isArray(doc.breakdown) && doc.orderId,
    );

    if (missing.length > 0) {
      const [orders, recipes, onSpot] = await Promise.all([
        db
          .collection("orders")
          .find(
            { _id: { $in: missing.map((doc) => doc.orderId as ObjectId) } },
            { projection: { orderItems: 1 } },
          )
          .toArray(),
        loadItemRecipesByNameKey(db),
        loadOnSpotProductionItems(db),
      ]);

      const itemsByOrder = new Map(
        orders.map((order) => [String(order._id), order.orderItems]),
      );
      const productsPerDoc = missing.map((doc) => {
        const stored = itemsByOrder.get(String(doc.orderId));
        return orderedProducts(
          Array.isArray(stored) ? (stored as StoredOrderItem[]) : [],
        );
      });

      // Named in one go rather than per order — the menu lookup is the same
      // for all of them, and one query beats a hundred.
      const named = await namedOrderItems(db, productsPerDoc.flat());

      let cursor = 0;
      missing.forEach((doc, index) => {
        const sold = named.slice(cursor, cursor + productsPerDoc[index].length);
        cursor += productsPerDoc[index].length;
        if (sold.length === 0) return;
        rebuilt.set(
          String(doc._id),
          sharesByRef(componentBreakdown(sold, recipes, onSpot), kind),
        );
      });
    }

    for (const doc of orderDocs) {
      const docId = String(doc._id);
      const at = new Date(doc.consumedAt);
      const orderNumber = String(doc.orderNumber ?? "").trim();
      const label = orderNumber ? `Order #${orderNumber}` : "Website order";
      const stored = Array.isArray(doc.breakdown)
        ? sharesByRef(doc.breakdown, kind)
        : undefined;
      const derived = rebuilt.get(docId);

      for (const line of toLines(doc[linesField])) {
        const itemId = String(line.id ?? "");
        const recorded = stored?.get(itemId);
        const shares =
          recorded ??
          (derived
            ? reconciled(derived.get(itemId) ?? [], num(line.consumedQty) ?? 0)
            : undefined);
        push(consumptionMovement(line, at, docId, "order", label, shares));
      }

      for (const line of toLines(doc.onSpotLines)) {
        push(onSpotMovement(line, at, docId, "order", label));
      }
    }

    for (const doc of petpoojaDocs) {
      const at = new Date(doc.uploadedAt);
      const label = petpoojaLabel(doc);
      const consumption = doc.consumption as Document | undefined;
      const docId = String(doc._id);
      for (const line of toLines(consumption?.[linesField])) {
        push(consumptionMovement(line, at, docId, "petpooja", label));
      }

      for (const line of toLines(consumption?.onSpotLines)) {
        push(onSpotMovement(line, at, docId, "petpooja", label));
      }
    }

    for (const doc of auditDocs) {
      const at = new Date(doc.savedAt);
      const docId = String(doc._id);
      // The items this save added or counted — stock coming in, or a figure
      // being corrected. Never consumption, but it moves the balance, and an
      // addition is also what the Added column reports.
      if (doc.kind === kind) {
        const received = doc.type === "addition";
        for (const line of toLines(doc.lines)) {
          push(balanceMovement(line, at, docId, received));
        }
      }
      // The ingredients that save spent. Making a batch is the third way stock
      // leaves the shelf, and for a raw material it is usually the biggest.
      const produced = toLines(doc.lines);
      for (const line of toLines(doc.consumedLines)) {
        push(
          consumptionMovement(
            line,
            at,
            docId,
            "production",
            productionLabel(produced),
          ),
        );
      }
    }

    for (const doc of wastageDocs) {
      const itemId = String(doc.refId ?? "");
      if (!itemId) continue;
      const at = new Date(doc.recordedAt);
      push({
        id: `wastage:${String(doc._id)}`,
        itemId,
        at: at.getTime(),
        previousStock: num(doc.previousStock),
        closingStock: num(doc.closingStock),
        event: {
          source: "wastage",
          label: "Wastage",
          qty: num(doc.qty) ?? 0,
          shortfall: num(doc.shortfall) ?? 0,
          cost: num(doc.cost),
        },
      });
    }

    const rows = buildConsumptionRows({
      items,
      movements,
      from: fromInstant.getTime(),
      to: toInstant.getTime(),
    });

    return NextResponse.json(
      { success: true, from, to, rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error building stock consumption report:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build the consumption report" },
      { status: 500 },
    );
  }
}
