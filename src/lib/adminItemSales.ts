import { ObjectId, type Db } from "mongodb";

export interface ItemSale {
  productId: string;
  name: string;
  isVeg: boolean;
  quantity: number;
  revenue: number;
}

/**
 * Units and revenue per menu item across paid orders in a range, busiest first.
 *
 * `limit` caps the result for the dashboard's top-N panel; omit it for the full
 * list. The cap is applied in the aggregation, so the uncapped call is the only
 * one that pays for the whole set.
 */
export async function itemSalesInRange(
  db: Db,
  gte: Date,
  lt: Date,
  limit?: number,
): Promise<ItemSale[]> {
  const grouped = await db
    .collection("orders")
    .aggregate<{ _id: string; quantity: number; revenue: number }>([
      { $match: { paymentStatus: "paid", createdAt: { $gte: gte, $lt: lt } } },
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.productId",
          quantity: { $sum: { $ifNull: ["$orderItems.quantity", 0] } },
          revenue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$orderItems.price", 0] },
                { $ifNull: ["$orderItems.quantity", 0] },
              ],
            },
          },
        },
      },
      { $sort: { quantity: -1 } },
      ...(limit && limit > 0 ? [{ $limit: limit }] : []),
    ])
    .toArray();

  if (grouped.length === 0) return [];

  // productId may be an ObjectId string or a raw string; match menuItems both ways.
  const objectIds: ObjectId[] = [];
  const rawIds: string[] = [];
  for (const g of grouped) {
    const id = String(g._id ?? "");
    if (!id) continue;
    if (ObjectId.isValid(id)) objectIds.push(new ObjectId(id));
    else rawIds.push(id);
  }
  const orQuery: Record<string, unknown>[] = [];
  if (objectIds.length) orQuery.push({ _id: { $in: objectIds } });
  if (rawIds.length) orQuery.push({ _id: { $in: rawIds } });

  const products = orQuery.length
    ? await db
        .collection("menuItems")
        .find({ $or: orQuery })
        .project({ name: 1, isVeg: 1 })
        .toArray()
    : [];
  const productMap = new Map<string, { name: string; isVeg: boolean }>();
  for (const p of products) {
    productMap.set(String(p._id), {
      name: String(p.name ?? ""),
      isVeg: Boolean(p.isVeg),
    });
  }

  return grouped.map((g) => {
    const id = String(g._id ?? "");
    const meta = productMap.get(id);
    return {
      productId: id,
      name: meta?.name || "Unknown item",
      isVeg: meta?.isVeg ?? false,
      quantity: g.quantity,
      revenue: g.revenue,
    };
  });
}
