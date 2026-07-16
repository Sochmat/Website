import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { logPayment } from "@/lib/paymentLog";
import { reconcilePayment } from "@/lib/reconcilePayment";

const ROUTE = "/api/payment/verify-order";

/** Constant-time hex-string compare (avoids signature timing leaks). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;

  const { db } = await connectToDatabase();
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = await request.json();

    const base = {
      flow: "order" as const,
      route: ROUTE,
      orderId: orderId ? String(orderId) : undefined,
      razorpayOrderId: razorpay_order_id ? String(razorpay_order_id) : undefined,
      razorpayPaymentId: razorpay_payment_id
        ? String(razorpay_payment_id)
        : undefined,
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      await logPayment(db, {
        ...base,
        stage: "missing-details",
        outcome: "failure",
        message: "Missing razorpay ids or signature in the verify request",
      });
      return NextResponse.json(
        { success: false, message: "Missing payment details" },
        { status: 400 },
      );
    }

    // Authenticate the checkout callback: prove razorpay_order_id↔payment_id are
    // genuine before we trust them. (Amount/order matching happens in reconcile.)
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (!safeEqualHex(expectedSignature, String(razorpay_signature))) {
      // Almost always a KEY_SECRET mismatch (test vs live, or the deployed
      // secret not matching the key_id used at checkout).
      await logPayment(db, {
        ...base,
        stage: "signature-mismatch",
        outcome: "failure",
        message: "HMAC signature did not match — check RAZORPAY_KEY_SECRET",
      });
      return NextResponse.json(
        { success: false, message: "Payment verification failed!" },
        { status: 400 },
      );
    }

    // Signature valid → reconcile the payment against the order (shared with the
    // Razorpay webhook, so the two paths can never diverge).
    const result = await reconcilePayment(db, {
      route: ROUTE,
      source: "verify",
      razorpayOrderId: String(razorpay_order_id),
      razorpayPaymentId: String(razorpay_payment_id),
      orderId: orderId ? String(orderId) : undefined,
    });

    return NextResponse.json(
      { success: result.success, message: result.message },
      { status: result.status },
    );
  } catch (error) {
    console.error("Error verifying payment:", error);
    await logPayment(db, {
      flow: "order",
      route: ROUTE,
      stage: "exception",
      outcome: "failure",
      message: "Unhandled error while verifying payment",
      error: (error as Error)?.message,
    });
    return NextResponse.json(
      { success: false, message: "Payment verification failed" },
      { status: 500 },
    );
  }
}
