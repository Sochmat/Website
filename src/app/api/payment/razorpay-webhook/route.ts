import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import { logPayment } from "@/lib/paymentLog";
import { reconcilePayment } from "@/lib/reconcilePayment";

/**
 * Razorpay webhook — the server-side safety net for payment reconciliation.
 *
 * The client `verify-order` call is the happy path, but it does not always run:
 * a UPI-intent payment hands off to an external app and the returning browser
 * tab is often evicted, so the success callback never fires and a captured
 * payment leaves the order stuck `pending`. Razorpay always delivers this
 * webhook regardless, so it authoritatively marks the order paid.
 *
 * Configure in the Razorpay dashboard: point a webhook at this URL, subscribe to
 * `payment.captured` (and optionally `order.paid`), and set the same secret in
 * `RAZORPAY_WEBHOOK_SECRET`.
 */
const ROUTE = "/api/payment/razorpay-webhook";

/** Constant-time hex compare (avoids signature timing leaks). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  // Raw body is required — the signature is computed over the exact bytes, so we
  // must not let JSON.parse re-serialize and change them.
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  const { db } = await connectToDatabase();

  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set — cannot verify webhook");
    await logPayment(db, {
      flow: "unknown",
      route: ROUTE,
      stage: "webhook-misconfigured",
      outcome: "failure",
      message: "RAZORPAY_WEBHOOK_SECRET is not configured",
    });
    // 500 so Razorpay retries once the secret is configured.
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex");
  if (!safeEqualHex(expected, signature)) {
    await logPayment(db, {
      flow: "unknown",
      route: ROUTE,
      stage: "webhook-bad-signature",
      outcome: "failure",
      message: "Webhook signature did not match RAZORPAY_WEBHOOK_SECRET",
    });
    return NextResponse.json({ success: false }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: RzpEntity };
      order?: { entity?: RzpEntity };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const type = event.event ?? "";
  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;

  // We only act on a captured payment (money is actually settled). Other events
  // (authorized, failed, refunded, etc.) are acknowledged but not reconciled here.
  const capturedPayment =
    type === "payment.captured" || type === "order.paid";
  if (!capturedPayment || !paymentEntity) {
    await logPayment(db, {
      flow: "unknown",
      route: ROUTE,
      stage: `webhook-ignored:${type || "unknown"}`,
      outcome: "info",
      message: "Webhook event not actionable for reconciliation",
      razorpayOrderId: paymentEntity?.order_id ?? orderEntity?.id,
      razorpayPaymentId: paymentEntity?.id,
    });
    return NextResponse.json({ success: true, ignored: true });
  }

  const razorpayOrderId = paymentEntity.order_id ?? orderEntity?.id;
  const razorpayPaymentId = paymentEntity.id;
  // Notes are set on the Razorpay order at create time; fall back to the payment
  // entity's own notes if present.
  const notes = orderEntity?.notes ?? paymentEntity.notes ?? {};
  const notesOrderId =
    typeof notes.orderId === "string" && notes.orderId ? notes.orderId : undefined;
  const notesFlow =
    notes.flow === "subscription" ? "subscription" : "order";

  if (!razorpayOrderId || !razorpayPaymentId) {
    await logPayment(db, {
      flow: notesFlow,
      route: ROUTE,
      stage: "webhook-missing-ids",
      outcome: "failure",
      message: "Webhook payload had no order/payment id",
    });
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const result = await reconcilePayment(db, {
    route: ROUTE,
    source: "webhook",
    razorpayOrderId: String(razorpayOrderId),
    razorpayPaymentId: String(razorpayPaymentId),
    orderId: notesOrderId,
    flowHint: notesFlow,
  });

  // Retryable (transient) failures → 5xx so Razorpay redelivers. Everything else
  // (verified, already-paid, terminal mismatch, no match) → 2xx to stop retries.
  return NextResponse.json(
    { success: result.success, stage: result.stage },
    { status: result.retryable ? 500 : 200 },
  );
}

interface RzpEntity {
  id?: string;
  order_id?: string;
  notes?: Record<string, string>;
}
