import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sweepAllStaleOrderRedemptions } from "@/lib/orderRedemption";

/** Anything unpaid and older than this has stopped being a live checkout. */
const STALE_MS = 30 * 60 * 1000;

/**
 * Return the wallet credit and reward points held by abandoned checkouts.
 *
 * `/api/payment/fail-order` already releases a checkout the moment it fails or
 * is dismissed, and `sweepStaleOrderRedemptions` catches the rest at the top of
 * the customer's NEXT order. This is the case neither reaches: the customer
 * whose page died before the fail call fired and who never comes back. Without
 * it their balance stays locked up indefinitely.
 *
 * Guarded by `CRON_SECRET` (Vercel Cron sends it as a bearer token). Safe to
 * run at any cadence — `refundOrderRedemptions` is idempotent per order.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (
    secret &&
    request.headers.get("authorization") !== `Bearer ${secret}`
  ) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { db } = await connectToDatabase();
    const swept = await sweepAllStaleOrderRedemptions(db, STALE_MS);
    return NextResponse.json({ success: true, ...swept });
  } catch (error) {
    console.error("Error releasing stale order redemptions:", error);
    return NextResponse.json(
      { success: false, message: "Sweep failed" },
      { status: 500 },
    );
  }
}
