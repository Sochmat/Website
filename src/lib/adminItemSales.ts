import { ObjectId, type Db } from "mongodb";

export interface ItemSale {
  productId: string;
  name: string;
  isVeg: boolean;
  /** The menu item's category id (Category.id, a slug). "" when unknown. */
  category: string;
  quantity: number;
  revenue: number;
}

/**
 * Every sold line in an order, flattened: the ordered items themselves plus the
 * add-ons attached to them.
 *
 * An add-on *is* a menu item — checkout prices it by looking `a.id` up in the
 * menu, and its quantity is absolute rather than per parent unit (see the
 * lineTotal loop in /api/orders). So an add-on sale is a sale of that item, and
 * counting it anywhere else would both undercount the add-on and inflate its
 * parent. Flattening here is what lets a category report reconcile against the
 * order subtotals it came from.
 */
const SOLD_LINES = {
  $concatArrays: [
    {
      $map: {
        input: { $ifNull: ["$orderItems", []] },
        as: "it",
        in: {
          productId: "$$it.productId",
          quantity: { $ifNull: ["$$it.quantity", 0] },
          price: { $ifNull: ["$$it.price", 0] },
        },
      },
    },
    // addOns is an array *per item*, so mapping it yields an array of arrays;
    // $reduce concatenates them back down into one flat list of lines.
    {
      $reduce: {
        input: {
          $map: {
            input: { $ifNull: ["$orderItems", []] },
            as: "it",
            in: {
              $map: {
                input: { $ifNull: ["$$it.addOns", []] },
                as: "a",
                in: {
                  productId: "$$a.id",
                  quantity: { $ifNull: ["$$a.quantity", 0] },
                  price: { $ifNull: ["$$a.price", 0] },
                },
              },
            },
          },
        },
        initialValue: [],
        in: { $concatArrays: ["$$value", "$$this"] },
      },
    },
  ],
};

/**
 * Units and revenue per menu item across paid orders in a range, busiest first.
 * Add-ons count as sales of the item they are (see SOLD_LINES).
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
      { $project: { lines: SOLD_LINES } },
      { $unwind: "$lines" },
      {
        $group: {
          _id: "$lines.productId",
          quantity: { $sum: "$lines.quantity" },
          revenue: {
            $sum: { $multiply: ["$lines.price", "$lines.quantity"] },
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
        .project({ name: 1, isVeg: 1, category: 1 })
        .toArray()
    : [];
  const productMap = new Map<
    string,
    { name: string; isVeg: boolean; category: string }
  >();
  for (const p of products) {
    productMap.set(String(p._id), {
      name: String(p.name ?? ""),
      isVeg: Boolean(p.isVeg),
      category: String(p.category ?? ""),
    });
  }

  return grouped.map((g) => {
    const id = String(g._id ?? "");
    const meta = productMap.get(id);
    return {
      productId: id,
      name: meta?.name || "Unknown item",
      isVeg: meta?.isVeg ?? false,
      category: meta?.category ?? "",
      quantity: g.quantity,
      revenue: g.revenue,
    };
  });
}
