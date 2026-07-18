import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { PLANS } from "@/lib/subscriptionPlanStore";
import { CREDIT_VALIDITY_DAYS } from "@/lib/subscriptionBrackets";
import { addIstDays, istInstant, toIstDate } from "@/lib/ist";
import type { SubscriptionMealPlan } from "@/lib/types";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Constant-time hex-string compare (avoids signature timing leaks). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * The ONLY path from `pending` to `paid` for a meal plan.
 *
 * The general /api/payment/verify-order route looks a plan id up in `orders`,
 * misses, and falls through to a no-op — it never checks the amount for plans.
 * So plans get their own endpoint, with the same end-to-end checks `orders` gets:
 * signature, then the real payment fetched from Razorpay and matched against this
 * plan's own total, then a replay guard.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;

  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { planId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, message: "Missing payment details" },
        { status: 400 },
      );
    }
    if (!planId || !ObjectId.isValid(planId)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }

    // 1. The signature proves razorpay_order_id ↔ payment_id are genuine.
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!safeEqualHex(expectedSignature, String(razorpay_signature))) {
      return NextResponse.json(
        { success: false, message: "Payment verification failed!" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const _id = new ObjectId(String(planId));

    // 2. Ownership. 404 (not 403) so a plan id can't be probed.
    const plan = (await db
      .collection(PLANS)
      .findOne({ _id, userId })) as unknown as SubscriptionMealPlan | null;
    if (!plan) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }
    if (plan.paymentStatus === "paid") {
      // Idempotent: a retried verify must not re-anchor the 30-day window.
      return NextResponse.json({ success: true, message: "Payment already verified" });
    }

    // 3. The signature does NOT prove the payment was for *this* plan's amount.
    //    Fetch the real payment and check it end-to-end.
    let payment: { order_id?: string; status?: string; amount?: number };
    try {
      payment = (await razorpay.payments.fetch(String(razorpay_payment_id))) as typeof payment;
    } catch (err) {
      console.error("Razorpay payment fetch failed:", err);
      return NextResponse.json(
        { success: false, message: "Could not verify payment" },
        { status: 502 },
      );
    }

    const expectedAmount = Math.round(Number(plan.totalAmount) * 100);
    if (
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      Number(payment.amount) !== expectedAmount
    ) {
      console.warn("Payment/plan mismatch on plans/verify", {
        planId,
        paymentOrderId: payment.order_id,
        status: payment.status,
        paid: payment.amount,
        expectedAmount,
      });
      return NextResponse.json(
        { success: false, message: "Payment does not match plan" },
        { status: 400 },
      );
    }

    // 4. Replay: a captured payment settles exactly one plan.
    const reused = await db
      .collection(PLANS)
      .findOne({ paymentId: razorpay_payment_id, _id: { $ne: _id } });
    if (reused) {
      return NextResponse.json({ success: false, message: "Payment already used" }, { status: 409 });
    }

    // 5. Activate. Guarded on the pending state, so a double-submit that races
    //    past step 2 still can't move `expiresOn`.
    const activatedAt = new Date();
    const expiresOn = addIstDays(toIstDate(activatedAt), CREDIT_VALIDITY_DAYS);

    const result = await db.collection(PLANS).updateOne(
      { _id, paymentStatus: "pending" },
      {
        $set: {
          paymentStatus: "paid",
          status: "active",
          paymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          activatedAt,
          expiresOn,
          expiresAt: istInstant(expiresOn, 23, 59),
          updatedAt: activatedAt,
        },
      },
    );
    if (result.matchedCount === 0) {
      // Someone else activated it between step 2 and here. Still a success.
      return NextResponse.json({ success: true, message: "Payment already verified" });
    }

    return NextResponse.json({ success: true, message: "Payment verified successfully!" });
  } catch (error) {
    console.error("Error verifying subscription payment:", error);
    return NextResponse.json(
      { success: false, message: "Payment verification failed" },
      { status: 500 },
    );
  }
}
