import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { logPayment } from "@/lib/paymentLog";

/**
 * Client-side payment events (gateway declined, user cancelled, SDK load fail,
 * verification rejected) — the checkout posts here so failures that never reach
 * verify-order still land in the same `paymentLogs` trail.
 *
 * Public + rate-limited. It only writes diagnostic rows to a bounded, TTL'd
 * collection, and every field is whitelisted + truncated by logPayment.
 */
const ALLOWED_STAGES = new Set([
  "checkout-opened",
  "sdk-load-failed",
  "payment-failed",
  "cancelled",
  "verify-failed",
]);

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;
  try {
    const body = await request.json();
    const stage = ALLOWED_STAGES.has(body.stage) ? body.stage : "unknown";

    const { db } = await connectToDatabase();
    await logPayment(db, {
      flow: body.flow === "subscription" ? "subscription" : "order",
      route: "client",
      stage: `client:${stage}`,
      outcome: stage === "checkout-opened" ? "info" : "failure",
      message: typeof body.message === "string" ? body.message : undefined,
      orderId: body.orderId ? String(body.orderId) : undefined,
      razorpayOrderId: body.razorpayOrderId ? String(body.razorpayOrderId) : undefined,
      razorpayPaymentId: body.razorpayPaymentId ? String(body.razorpayPaymentId) : undefined,
      error: body.error,
      errorCode: body.errorCode,
    });

    return NextResponse.json({ success: true });
  } catch {
    // Diagnostic logging must never surface an error to the checkout.
    return NextResponse.json({ success: true });
  }
}
