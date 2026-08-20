import { ObjectId, type Db } from "mongodb";
import { resolveFoodType, type FoodType } from "./foodType";

export interface ItemSale {
  productId: string;
  name: string;
  /** Absent on rows built before the marker existed — resolve with
   *  resolveFoodType(), which falls back to `isVeg`. */
  foodType?: FoodType;
  isVeg: boolean;
  quantity: number;
  revenue: number;
}

/**
 * What one order line's add-ons cost for ONE unit of that line.
 *
 * `orderItems[].price` is the per-unit BUNDLE price — base (or variant) plus
 * the add-ons chosen on it, see addToCart in CartContext. Subtracting this
 * leaves the dish's own price, which is the only figure that belongs on the
 * dish's sales row; the add-ons are billed on their own rows below.
 *
 * Referenced inside a `$map` over orderItems, so `$$it` is the current line.
 */
const ADD_ONS_UNIT_COST = {
  $reduce: {
    input: { $ifNull: ["$$it.addOns", []] },
    initialValue: 0,
    in: {
      $add: [
        "$$value",
        {
          $multiply: [
            { $ifNull: ["$$this.price", 0] },
            { $ifNull: ["$$this.quantity", 0] },
          ],
        },
      ],
    },
  },
};

/**
 * Every sold line in an order, flattened: the ordered items themselves plus the
 * add-ons attached to them.
 *
 * An add-on *is* a menu item — checkout prices it by looking `a.id` up in the
 * menu — so an add-on sale is a sale of that item, and counting it anywhere
 * else would both undercount the add-on and inflate its parent.
 *
 * Two things about how an order stores an add-on decide the arithmetic here,
 * and both are per-unit-of-the-line (the cart bills a line as bundle × qty):
 *
 *   - `addOns[].quantity` is per unit, so two bowls each with one papad sold
 *     TWO papads. Same rule orderedProducts applies before deducting stock,
 *     and the same one the KOT prints — they must agree or the report can
 *     never be reconciled against the kitchen.
 *   - `price` on the parent line already contains those add-ons, so the dish's
 *     own revenue is the bundle less ADD_ONS_UNIT_COST. Without that the
 *     add-on's money is counted twice: once inside its parent, once on its own
 *     row, and the report totals more than the order ever took.
 *
 * Getting both right is what lets a category report reconcile against the
 * order subtotals it came from.
 */
export const SOLD_LINES = {
  $concatArrays: [
    {
      $map: {
        input: { $ifNull: ["$orderItems", []] },
        as: "it",
        in: {
          productId: "$$it.productId",
          quantity: { $ifNull: ["$$it.quantity", 0] },
          // Floored at zero: a line whose stored price somehow undershoots its
          // own add-ons is malformed, and negative revenue would spread that
          // one bad document across its whole category.
          price: {
            $max: [
              0,
              { $subtract: [{ $ifNull: ["$$it.price", 0] }, ADD_ONS_UNIT_COST] },
            ],
          },
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
                  quantity: {
                    $multiply: [
                      { $ifNull: ["$$a.quantity", 0] },
                      { $ifNull: ["$$it.quantity", 0] },
                    ],
                  },
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
        .project({ name: 1, isVeg: 1, foodType: 1 })
        .toArray()
    : [];
  const productMap = new Map<
    string,
    { name: string; foodType: FoodType; isVeg: boolean }
  >();
  for (const p of products) {
    productMap.set(String(p._id), {
      name: String(p.name ?? ""),
      foodType: resolveFoodType({
        foodType: p.foodType,
        isVeg: Boolean(p.isVeg),
      }),
      isVeg: Boolean(p.isVeg),
    });
  }

  return grouped.map((g) => {
    const id = String(g._id ?? "");
    const meta = productMap.get(id);
    return {
      productId: id,
      name: meta?.name || "Unknown item",
      foodType: meta?.foodType ?? "nonveg",
      isVeg: meta?.isVeg ?? false,
      quantity: g.quantity,
      revenue: g.revenue,
    };
  });
}
