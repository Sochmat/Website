import { ObjectId, type Db } from "mongodb";
import { SOLD_LINES } from "@/lib/adminItemSales";
import type { ReportOrder } from "@/lib/categorySales";

/**
 * Everything that came off an order's bill.
 *
 * The report's Total Discount column is Location + Coupon + Reward, taken to
 * mean every reduction the order carries: the society's cut, the coupon, the
 * first-order offer, and the wallet credit and reward points spent against it.
 * Summed here rather than in the rollup so the SAME definition serves both the
 * per-order split and the totals.
 */
const ORDER_DISCOUNT = {
  $add: [
    { $ifNull: ["$societyDiscount", 0] },
    { $ifNull: ["$discountAmount", 0] },
    { $ifNull: ["$firstOrderDiscount", 0] },
    { $ifNull: ["$walletApplied", 0] },
    { $ifNull: ["$pointsApplied", 0] },
  ],
} as const;

interface RawOrder {
  _id: ObjectId;
  discount: number;
  tax: number;
  lines: Array<{ productId?: unknown; quantity?: unknown; price?: unknown }>;
}

/**
 * Paid orders in a range, reduced to what the category report needs: the lines
 * that were sold, and the order-level discount and tax that have to be split
 * across them.
 *
 * Deliberately per-order rather than pre-grouped by product. Apportioning needs
 * to know what else was on the same bill — a category's share of a discount is
 * only meaningful relative to the order it came off.
 *
 * Returns the product ids as they are stored; resolving them to categories is
 * the caller's job, because productId may be an ObjectId string or a raw one
 * and menuItems has to be matched both ways.
 */
export async function reportOrdersInRange(
  db: Db,
  gte: Date,
  lt: Date,
): Promise<{ orders: ReportOrder[]; productIds: Set<string> }> {
  const raw = await db
    .collection("orders")
    .aggregate<RawOrder>([
      { $match: { paymentStatus: "paid", createdAt: { $gte: gte, $lt: lt } } },
      {
        $project: {
          lines: SOLD_LINES,
          discount: ORDER_DISCOUNT,
          tax: { $ifNull: ["$tax", 0] },
        },
      },
    ])
    .toArray();

  const productIds = new Set<string>();
  const orders: ReportOrder[] = raw.map((o) => {
    const lines = (o.lines ?? []).map((l) => {
      const productId = String(l.productId ?? "");
      if (productId) productIds.add(productId);
      const quantity = Number(l.quantity) || 0;
      const price = Number(l.price) || 0;
      return { productId, quantity, revenue: price * quantity };
    });
    return {
      discount: Math.max(0, Number(o.discount) || 0),
      tax: Math.max(0, Number(o.tax) || 0),
      lines,
    };
  });

  return { orders, productIds };
}

/** productId -> category id, matching menuItems by ObjectId or raw string. */
export async function categoryByProductId(
  db: Db,
  productIds: Set<string>,
): Promise<Map<string, string>> {
  const objectIds: ObjectId[] = [];
  const rawIds: string[] = [];
  for (const id of productIds) {
    if (!id) continue;
    if (ObjectId.isValid(id)) objectIds.push(new ObjectId(id));
    else rawIds.push(id);
  }

  const or: Record<string, unknown>[] = [];
  if (objectIds.length) or.push({ _id: { $in: objectIds } });
  if (rawIds.length) or.push({ _id: { $in: rawIds } });
  if (!or.length) return new Map();

  const products = await db
    .collection("menuItems")
    .find({ $or: or })
    .project({ category: 1 })
    .toArray();

  const map = new Map<string, string>();
  for (const p of products) {
    const category = String(p.category ?? "");
    if (category) map.set(String(p._id), category);
  }
  return map;
}
