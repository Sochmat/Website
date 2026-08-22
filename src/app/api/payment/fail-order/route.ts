import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { logPayment } from "@/lib/paymentLog";
import { refundOrderRedemptions } from "@/lib/orderRedemption";

/**
 * Marks an order's payment as failed after a Razorpay failure. Only a
 * still-"pending" order is flipped to "failed" so a successful retry (which
 * sets "paid" via verify-order) is never clobbered.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;
  try {
    const { orderId } = await request.json();
    if (!orderId || !ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "A valid orderId is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection("orders").updateOne(
      { _id: new ObjectId(orderId), paymentStatus: "pending" },
      { $set: { paymentStatus: "failed", updatedAt: new Date() } },
    );

    // Hand the wallet credit and reward points straight back. A customer whose
    // payment just failed must not watch their balance sit locked up in a dead
    // checkout — the retry is a NEW order, so a reservation left on this one is
    // simply gone from their next attempt.
    //
    // This rewrites netAmount back up to the full bill, which used to be the
    // reason not to refund here: the Razorpay order was raised for the REDUCED
    // amount, and reconcile verified payments against netAmount, so a payment
    // that captured late would have been rejected as an amount mismatch. It no
    // longer is — `razorpayAmountPaise`, frozen at create-order time, is what
    // reconcile checks (see `expectedChargePaise`), and it does not move. If
    // that late payment does land, `reapplyOrderRedemptions` retakes exactly
    // what was returned here.
    const returned = await refundOrderRedemptions(db, new ObjectId(orderId));

    await logPayment(db, {
      flow: "order",
      route: "/api/payment/fail-order",
      stage: "marked-failed",
      outcome: "failure",
      message: "Order payment marked failed",
      orderId: String(orderId),
      meta: {
        updated: result.modifiedCount,
        walletReturned: returned.wallet,
        pointsReturned: returned.points,
      },
    });

    return NextResponse.json({
      success: true,
      updated: result.modifiedCount,
      returned,
    });
  } catch (error) {
    console.error("Error marking order payment failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 },
    );
  }
}
