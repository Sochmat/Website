import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { parseIstRange } from "@/lib/adminRange";
import { itemSalesInRange } from "@/lib/adminItemSales";
import { istToday, addIstDays } from "@/lib/ist";

/** How many items the dashboard's top-sellers panel shows. */
const TOP_ITEMS_LIMIT = 10;

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

/**
 * How the referral programme is doing.
 *
 * `signups` and `converted` are one cohort — accounts created in range that
 * carry a referrer — so their ratio is a real conversion rate. `creditPaidOut`
 * is deliberately NOT that cohort: credit lands when the referred friend first
 * pays, which can be weeks after they signed up, so it is the credit actually
 * disbursed during the range whoever it was earned for. The UI labels it that
 * way rather than implying the three numbers describe the same people.
 */
async function referralStats(db: Db, gte: Date, lt: Date) {
  const referredInRange = { referredBy: { $exists: true }, createdAt: { $gte: gte, $lt: lt } };

  const [signups, converted, payout] = await Promise.all([
    db.collection("users").countDocuments(referredInRange),
    db
      .collection("users")
      .countDocuments({ ...referredInRange, referralCredited: true }),
    db
      .collection("walletTransactions")
      .aggregate<{ total: number }>([
        {
          $match: {
            type: "referral_earned",
            createdAt: { $gte: gte, $lt: lt },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
      ])
      .toArray(),
  ]);

  return { signups, converted, creditPaidOut: payout[0]?.total ?? 0 };
}

/**
 * A snapshot of live order streaks, bucketed by day count.
 *
 * Deliberately not range-scoped: a streak is a right-now fact, and the stored
 * `streakCount` carries no history to slice by date. "Live" means the last
 * streak-advancing order was today or yesterday — the same window `nextStreak`
 * uses to decide whether a new order continues a run or starts one. Without
 * that filter every streak ever abandoned would still be counted, which would
 * badly overstate the number.
 */
async function streakStats(db: Db, now: Date) {
  const today = istToday(now);
  const live = {
    streakCount: { $gt: 0 },
    streakLastDate: { $in: [today, addIstDays(today, -1)] },
  };

  const rows = await db
    .collection("users")
    .aggregate<{ _id: number; count: number }>([
      { $match: live },
      { $group: { _id: "$streakCount", count: { $sum: 1 } } },
    ])
    .toArray();

  const buckets = { day1: 0, day2: 0, day3: 0, day4plus: 0 };
  let total = 0;
  let longest = 0;
  for (const r of rows) {
    const day = Number(r._id) || 0;
    total += r.count;
    if (day > longest) longest = day;
    if (day === 1) buckets.day1 += r.count;
    else if (day === 2) buckets.day2 += r.count;
    else if (day === 3) buckets.day3 += r.count;
    else buckets.day4plus += r.count;
  }

  return { total, longest, ...buckets };
}

/**
 * Dashboard stats for an IST date range (inclusive). `?from=YYYY-MM-DD&to=YYYY-MM-DD`;
 * defaults to the last 7 days. Admin-only (middleware-guarded).
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const now = new Date();
    const { from, to, gte, lt } = parseIstRange(
      params.get("from"),
      params.get("to"),
      now,
    );

    const { db } = await connectToDatabase();

    const [orders, subscriptions, totalUsers, newUsers, buyers, items, referrals, streaks] =
      await Promise.all([
        salesBucket(db, "orders", gte, lt),
        salesBucket(db, "subscriptions", gte, lt),
        db.collection("users").countDocuments({}),
        db.collection("users").countDocuments({ createdAt: { $gte: gte, $lt: lt } }),
        buyerBreakdown(db, gte, lt),
        itemSalesInRange(db, gte, lt, TOP_ITEMS_LIMIT),
        referralStats(db, gte, lt),
        streakStats(db, now),
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
      referrals,
      streaks,
    });
  } catch (error) {
    console.error("Error building dashboard stats:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build dashboard stats" },
      { status: 500 },
    );
  }
}
