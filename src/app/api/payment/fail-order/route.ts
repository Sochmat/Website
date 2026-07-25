import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { logPayment } from "@/lib/paymentLog";

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

    // Deliberately NOT refunding the wallet/points reservation here — do not
    // "restore" a refund call to this route. Refunding rewrites netAmount back
    // to the full total, but the Razorpay order was created for the reduced
    // amount and a retry of the same checkout pays that reduced amount; verify
    // would then compare the payment against the restored netAmount and reject
    // it as an amount mismatch, stranding a payment the customer really made.
    // Leaving the reservation in place keeps netAmount matching the Razorpay
    // order so a retry reconciles cleanly. A genuinely abandoned checkout is
    // handled by sweepStaleOrderRedemptions, which returns both balances at the
    // top of the customer's next order; its filter is
    // `paymentStatus: { $ne: "paid" }`, so it matches "failed" orders too.
    await logPayment(db, {
      flow: "order",
      route: "/api/payment/fail-order",
      stage: "marked-failed",
      outcome: "failure",
      message: "Order payment marked failed",
      orderId: String(orderId),
      meta: { updated: result.modifiedCount },
    });

    return NextResponse.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    console.error("Error marking order payment failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order" },
      { status: 500 },
    );
  }
}
