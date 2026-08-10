// Stock leaving the building with a delivered order.
//
// Resolves an order's lines (and their add-ons) to menu-item names, then hands
// the rest to the shared spend path: src/lib/recipeDemand.ts works out what the
// recipes call for, src/lib/stockSpend.ts takes it off the shelves.
//
// Runs once per order, ever. Delivery is a one-way door for stock: re-picking
// "Delivered" on an order that already spent its stock must not spend it twice.

import { ObjectId, type Db } from "mongodb";
import {
  orderedProducts,
  type OrderedProduct,
  type StoredOrderItem,
} from "@/lib/orderConsumption";
import { componentDemand, type SoldItem } from "@/lib/recipeDemand";
import { componentBreakdown } from "@/lib/recipeBreakdown";
import { loadItemRecipesByNameKey, spendComponentDemand } from "@/lib/stockSpend";

/** One document per order that spent stock — the trail behind the deduction. */
export const ORDER_CONSUMPTIONS_COLLECTION = "inventoryOrderConsumptions";

export interface OrderStockResult {
  /** False when this order had already spent its stock, or has no lines. */
  consumed: boolean;
  /** Raw material rows written. */
  rawRows: number;
  /** Production item rows written. */
  productionRows: number;
  /** Rows the shelf could not cover in full — see AuditLine.shortfall. */
  shortfallRows: number;
  /** Ordered items with no recipe behind them; nothing was deducted for these. */
  unmapped: string[];
}

/** "Nothing happened" — a fresh object, so no caller can mutate a shared one. */
function nothing(): OrderStockResult {
  return {
    consumed: false,
    rawRows: 0,
    productionRows: 0,
    shortfallRows: 0,
    unmapped: [],
  };
}

/**
 * Name the ordered products against the live menu.
 *
 * Product ids are matched as ObjectIds and as plain strings, the same way the
 * admin orders list resolves them — older orders carry either. A product that
 * has since been deleted falls back to the name recorded on the order, and an
 * id-less add-on only ever had that; either way the demand step reports what
 * it cannot match rather than deducting a guess.
 */
export async function namedOrderItems(
  db: Db,
  products: OrderedProduct[],
): Promise<SoldItem[]> {
  const objectIds: ObjectId[] = [];
  const rawIds: string[] = [];
  for (const { productId } of products) {
    if (!productId) continue;
    if (ObjectId.isValid(productId) && String(new ObjectId(productId)) === productId) {
      objectIds.push(new ObjectId(productId));
    } else {
      rawIds.push(productId);
    }
  }

  const orQuery: Record<string, unknown>[] = [];
  if (objectIds.length) orQuery.push({ _id: { $in: objectIds } });
  if (rawIds.length) orQuery.push({ _id: { $in: rawIds } });

  const docs = orQuery.length
    ? await db
        .collection("menuItems")
        .find({ $or: orQuery }, { projection: { name: 1 } })
        .toArray()
    : [];

  const nameById = new Map(docs.map((d) => [String(d._id), String(d.name ?? "")]));

  return products.map(({ productId, name, variantName, quantity }) => ({
    name: (productId ? nameById.get(productId) : "") || name,
    // Carried through untouched: the size sold is what picks the recipe.
    variantName,
    quantity,
  }));
}

/**
 * Spend the stock a delivered order used up.
 *
 * The order is claimed first, in one atomic update: `stockConsumedAt` is set
 * only if it was absent, so two admins marking the same order delivered at
 * once leave exactly one of them holding the right to deduct. A claim that
 * then fails mid-way is left claimed and the error recorded on the order —
 * under-deducting once is recoverable by hand on the Audit screen, whereas an
 * automatic retry over a partly-applied bulk write would deduct twice.
 *
 * Throws only on an unexpected Mongo failure; the caller decides whether that
 * should fail the status update (it should not — the food is delivered either
 * way).
 */
export async function consumeStockForOrder(
  db: Db,
  orderId: ObjectId,
): Promise<OrderStockResult> {
  const orders = db.collection("orders");

  const claimedAt = new Date();
  const order = await orders.findOneAndUpdate(
    { _id: orderId, stockConsumedAt: { $exists: false } },
    { $set: { stockConsumedAt: claimedAt } },
    { projection: { orderItems: 1, orderNumber: 1 } },
  );
  // Already spent (or the order is gone) — nothing more to do.
  if (!order) return nothing();

  try {
    const products = orderedProducts(
      Array.isArray(order.orderItems)
        ? (order.orderItems as StoredOrderItem[])
        : [],
    );
    if (products.length === 0) return nothing();

    const [items, recipes] = await Promise.all([
      namedOrderItems(db, products),
      loadItemRecipesByNameKey(db),
    ]);

    const { demand, unmapped } = componentDemand(items, recipes);
    const spent = await spendComponentDemand(db, demand, claimedAt);

    // Which dish ate what, worked out from the same walk that produced the
    // demand above. Recorded now rather than reconstructed later: the recipe
    // that was in force is the one being deducted, and it may well have been
    // rewritten by the time anyone reads this back.
    const breakdown = componentBreakdown(items, recipes);

    const result: OrderStockResult = {
      consumed: spent.rowCount > 0,
      rawRows: spent.rawLines.length,
      productionRows: spent.productionLines.length,
      shortfallRows: spent.shortfallRows,
      unmapped,
    };

    // Written after the stock, so a failed write is never recorded as history.
    const trail = await db.collection(ORDER_CONSUMPTIONS_COLLECTION).insertOne({
      orderId,
      orderNumber: order.orderNumber ? String(order.orderNumber) : undefined,
      consumedAt: claimedAt,
      rawLines: spent.rawLines,
      productionLines: spent.productionLines,
      breakdown,
      unmapped,
      rowCount: spent.rowCount,
      shortfallRows: spent.shortfallRows,
      netCost: spent.netCost,
    });

    await orders.updateOne(
      { _id: orderId },
      {
        $set: {
          stockConsumptionId: trail.insertedId,
          stockConsumptionRows: result.rawRows + result.productionRows,
          ...(unmapped.length > 0 ? { stockConsumptionUnmapped: unmapped } : {}),
        },
        $unset: { stockConsumptionError: "" },
      },
    );

    return result;
  } catch (error) {
    // Keep the claim (see the doc comment) but leave a mark on the order, so
    // the shortfall is findable rather than invisible.
    await orders.updateOne(
      { _id: orderId },
      {
        $set: {
          stockConsumptionError:
            error instanceof Error ? error.message : "Stock deduction failed",
        },
      },
    );
    throw error;
  }
}
