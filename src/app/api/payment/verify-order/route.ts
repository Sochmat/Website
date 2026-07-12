import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import { connectToDatabase } from "@/lib/mongodb";
import { Order } from "@/lib/types";
import { pushOrderToPetpooja, recordPushResult } from "@/lib/petpooja";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { logPayment } from "@/lib/paymentLog";

const ROUTE = "/api/payment/verify-order";

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
      razorpayPaymentId: razorpay_payment_id ? String(razorpay_payment_id) : undefined,
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
        { status: 400 }
      );
    }

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
        { status: 400 }
      );
    }

    // A valid signature only proves razorpay_order_id↔payment_id are genuine.
    // It does NOT prove they correspond to *this* internal order or amount, so
    // we authoritatively re-check the payment against the order before marking
    // it paid. This blocks reusing a cheap/foreign payment for an expensive
    // order.
    if (orderId && ObjectId.isValid(orderId)) {
      const _id = new ObjectId(orderId);
      const order = await db.collection("orders").findOne({ _id });

      if (order) {
        // Idempotent: an already-paid order short-circuits (no double push).
        if (order.paymentStatus === "paid") {
          await logPayment(db, {
            ...base,
            stage: "already-paid",
            outcome: "success",
            message: "Order was already marked paid (idempotent retry)",
          });
          return NextResponse.json({
            success: true,
            message: "Payment already verified",
          });
        }

        // Fetch the real payment from Razorpay and validate it end-to-end.
        let payment: { order_id?: string; status?: string; amount?: number };
        try {
          payment = (await razorpay.payments.fetch(
            String(razorpay_payment_id)
          )) as typeof payment;
        } catch (err) {
          console.error("Razorpay payment fetch failed:", err);
          const e = err as {
            message?: string;
            statusCode?: number;
            error?: { code?: string };
          };
          await logPayment(db, {
            ...base,
            stage: "payment-fetch-error",
            outcome: "failure",
            message: "Could not fetch the payment from Razorpay",
            error: e?.message,
            errorCode: e?.error?.code ?? (e?.statusCode ? String(e.statusCode) : undefined),
          });
          return NextResponse.json(
            { success: false, message: "Could not verify payment" },
            { status: 502 }
          );
        }

        const expectedAmount = Math.round(
          Number(order.netAmount ?? order.totalAmount) * 100
        );
        const orderIdMatches = payment.order_id === razorpay_order_id;
        const isCaptured = payment.status === "captured";
        const amountMatches = Number(payment.amount) === expectedAmount;
        if (!orderIdMatches || !isCaptured || !amountMatches) {
          // The single most useful log line: which of the three checks failed.
          const reasons = [
            !orderIdMatches && "order-id",
            !isCaptured && "not-captured",
            !amountMatches && "amount",
          ].filter(Boolean) as string[];
          console.warn("Payment/order mismatch on verify-order", {
            orderId,
            paymentOrderId: payment.order_id,
            status: payment.status,
            paid: payment.amount,
            expectedAmount,
          });
          await logPayment(db, {
            ...base,
            stage: `mismatch:${reasons.join("+")}`,
            outcome: "failure",
            message: `Payment does not match order (${reasons.join(", ")})`,
            paymentStatus: payment.status,
            amountPaise: Number(payment.amount),
            expectedAmountPaise: expectedAmount,
            meta: {
              paymentOrderId: payment.order_id,
              // The likely fix when the only failure is "not-captured".
              hint: !isCaptured
                ? "Payment is authorized but not captured — enable auto-capture in Razorpay, or capture on verify."
                : undefined,
            },
          });
          return NextResponse.json(
            { success: false, message: "Payment does not match order" },
            { status: 400 }
          );
        }

        // Reject payment-id replay: a captured payment can settle exactly one
        // order. (Razorpay also enforces this server-side, but fail fast here.)
        const reused = await db
          .collection("orders")
          .findOne({ paymentId: razorpay_payment_id, _id: { $ne: _id } });
        if (reused) {
          await logPayment(db, {
            ...base,
            stage: "replay",
            outcome: "failure",
            message: "This payment was already used on another order",
            meta: { reusedOrderId: String(reused._id) },
          });
          return NextResponse.json(
            { success: false, message: "Payment already used" },
            { status: 409 }
          );
        }

        await db.collection("orders").updateOne(
          { _id },
          {
            $set: {
              paymentStatus: "paid",
              paymentId: razorpay_payment_id,
              razorpayOrderId: razorpay_order_id,
              // Freeze the promised ready time at 30 minutes from payment.
              expectedReadyAt: new Date(Date.now() + 30 * 60 * 1000),
              updatedAt: new Date(),
            },
          }
        );

        await logPayment(db, {
          ...base,
          stage: "verified",
          outcome: "success",
          message: "Payment verified and order marked paid",
          paymentStatus: payment.status,
          amountPaise: Number(payment.amount),
          expectedAmountPaise: expectedAmount,
        });

        // Order is now paid — push it to Petpooja. The push never blocks
        // verification; its outcome is recorded on the order for admin.
        const paidOrder = await db.collection("orders").findOne({ _id });
        if (paidOrder) {
          const pushResult = await pushOrderToPetpooja(
            paidOrder as unknown as Order,
            db
          );
          await recordPushResult(db, _id, pushResult);
        }
      } else {
        // Not an order — try subscriptions (signature already validated).
        const r = await db.collection("subscriptions").updateOne(
          { _id },
          {
            $set: {
              paymentStatus: "paid",
              paymentId: razorpay_payment_id,
              updatedAt: new Date(),
            },
          }
        );
        await logPayment(db, {
          ...base,
          flow: "subscription",
          stage: r.matchedCount ? "subscription-paid" : "no-matching-record",
          outcome: r.matchedCount ? "success" : "failure",
          message: r.matchedCount
            ? "Legacy subscription marked paid"
            : "No order or subscription matched this id",
        });
      }
    } else {
      await logPayment(db, {
        ...base,
        stage: "no-order-id",
        outcome: "info",
        message: "Signature valid but no internal orderId supplied to reconcile",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully!",
    });
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
      { status: 500 }
    );
  }
}
