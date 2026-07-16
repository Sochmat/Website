import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

// IST is a fixed +5:30 with no DST (see src/lib/ist.ts).
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** The UTC instant of 00:00 IST on the given yyyy-mm-dd IST calendar date. */
function istDateStartUtc(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d) - IST_OFFSET_MS;
}

/** Today's IST calendar date as yyyy-mm-dd. */
function istToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-mm-dd shifted by `days`, staying on the IST calendar. */
function shiftIstDate(date: string, days: number): string {
  const shifted = new Date(istDateStartUtc(date) + days * DAY_MS + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

interface StatusBucket {
  paidAmount: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
}

const EMPTY_BUCKET: StatusBucket = {
  paidAmount: 0,
  paidCount: 0,
  pendingCount: 0,
  failedCount: 0,
  refundedCount: 0,
};

/** Group a collection's in-range docs by paymentStatus: paid amount + per-status counts. */
async function salesBucket(
  db: Db,
  collection: string,
  gte: Date,
  lt: Date,
): Promise<StatusBucket> {
  const rows = await db
    .collection(collection)
    .aggregate<{ _id: string; count: number; amount: number }>([
      { $match: { createdAt: { $gte: gte, $lt: lt } } },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
    ])
    .toArray();

  const bucket: StatusBucket = { ...EMPTY_BUCKET };
  for (const r of rows) {
    if (r._id === "paid") {
      bucket.paidAmount = r.amount;
      bucket.paidCount = r.count;
    } else if (r._id === "pending") bucket.pendingCount = r.count;
    else if (r._id === "failed") bucket.failedCount = r.count;
    else if (r._id === "refunded") bucket.refundedCount = r.count;
  }
  return bucket;
}

/** New vs repeat buyers among users who placed a paid order in range. */
async function buyerBreakdown(db: Db, gte: Date, lt: Date) {
  const rows = await db
    .collection("orders")
    .aggregate<{ buyers: number; newBuyers: number }>([
      { $match: { paymentStatus: "paid", userId: { $ne: null } } },
      {
        $group: {
          _id: "$userId",
          firstPaid: { $min: "$createdAt" },
          boughtInRange: {
            $max: {
              $cond: [
                { $and: [{ $gte: ["$createdAt", gte] }, { $lt: ["$createdAt", lt] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $match: { boughtInRange: 1 } },
      {
        $group: {
          _id: null,
          buyers: { $sum: 1 },
          newBuyers: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$firstPaid", gte] }, { $lt: ["$firstPaid", lt] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();

  const buyers = rows[0]?.buyers ?? 0;
  const newBuyers = rows[0]?.newBuyers ?? 0;
  return { buyersInRange: buyers, newBuyers, repeatBuyers: buyers - newBuyers };
}

interface TopItem {
  productId: string;
  name: string;
  isVeg: boolean;
  quantity: number;
  revenue: number;
}

/** Top 10 items by quantity across paid orders in range, name-resolved from menuItems. */
async function topItems(db: Db, gte: Date, lt: Date): Promise<TopItem[]> {
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
      { $limit: 10 },
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
    productMap.set(String(p._id), { name: String(p.name ?? ""), isVeg: Boolean(p.isVeg) });
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

/**
 * Dashboard stats for an IST date range (inclusive). `?from=YYYY-MM-DD&to=YYYY-MM-DD`;
 * defaults to the last 7 days. Admin-only (middleware-guarded).
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const now = new Date();
    const today = istToday(now);

    let from = params.get("from") ?? "";
    let to = params.get("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      to = today;
      from = shiftIstDate(today, -6); // last 7 days inclusive
    }
    if (from > to) [from, to] = [to, from];

    const gte = new Date(istDateStartUtc(from));
    const lt = new Date(istDateStartUtc(shiftIstDate(to, 1))); // exclusive upper bound

    const { db } = await connectToDatabase();

    const [orders, subscriptions, totalUsers, newUsers, buyers, items] = await Promise.all([
      salesBucket(db, "orders", gte, lt),
      salesBucket(db, "subscriptions", gte, lt),
      db.collection("users").countDocuments({}),
      db.collection("users").countDocuments({ createdAt: { $gte: gte, $lt: lt } }),
      buyerBreakdown(db, gte, lt),
      topItems(db, gte, lt),
    ]);

    return NextResponse.json({
      success: true,
      range: { from, to },
      sales: {
        orders,
        subscriptions,
        totalPaidAmount: orders.paidAmount + subscriptions.paidAmount,
      },
      users: {
        total: totalUsers,
        newInRange: newUsers,
        buyersInRange: buyers.buyersInRange,
        newBuyers: buyers.newBuyers,
        repeatBuyers: buyers.repeatBuyers,
      },
      topItems: items,
    });
  } catch (error) {
    console.error("Error building dashboard stats:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build dashboard stats" },
      { status: 500 },
    );
  }
}
