import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import { Order } from "@/lib/types";
import { pushOrderToPetpooja, recordPushResult } from "@/lib/petpooja";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

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
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
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
      const r = await resolveTenantId();
      if ("error" in r) return r.error;
      const t = await forTenant(r.tenantId);
      const _id = new ObjectId(orderId);
      const order = await t.findOne("orders", { _id });

      if (order) {
        // Idempotent: an already-paid order short-circuits (no double push).
        if (order.paymentStatus === "paid") {
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
          return NextResponse.json(
            { success: false, message: "Could not verify payment" },
            { status: 502 }
          );
        }

        const expectedAmount = Math.round(
          Number(order.netAmount ?? order.totalAmount) * 100
        );
        if (
          payment.order_id !== razorpay_order_id ||
          payment.status !== "captured" ||
          Number(payment.amount) !== expectedAmount
        ) {
          console.warn("Payment/order mismatch on verify-order", {
            orderId,
            paymentOrderId: payment.order_id,
            status: payment.status,
            paid: payment.amount,
            expectedAmount,
          });
          return NextResponse.json(
            { success: false, message: "Payment does not match order" },
            { status: 400 }
          );
        }

        // Reject payment-id replay: a captured payment can settle exactly one
        // order. (Razorpay also enforces this server-side, but fail fast here.)
        const reused = await t.findOne("orders", { paymentId: razorpay_payment_id, _id: { $ne: _id } });
        if (reused) {
          return NextResponse.json(
            { success: false, message: "Payment already used" },
            { status: 409 }
          );
        }

        await t.updateOne("orders", { _id }, {
          $set: {
            paymentStatus: "paid",
            paymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            // Freeze the promised ready time at 30 minutes from payment.
            expectedReadyAt: new Date(Date.now() + 30 * 60 * 1000),
            updatedAt: new Date(),
          },
        });

        // Order is now paid — push it to Petpooja. The push never blocks
        // verification; its outcome is recorded on the order for admin.
        const paidOrder = await t.findOne("orders", { _id });
        if (paidOrder) {
          const pushResult = await pushOrderToPetpooja(
            paidOrder as unknown as Order,
            r.tenantId
          );
          await recordPushResult(r.tenantId, _id, pushResult);
        }
      } else {
        // Not an order — try subscriptions (signature already validated).
        await t.updateOne("subscriptions", { _id }, {
          $set: {
            paymentStatus: "paid",
            paymentId: razorpay_payment_id,
            updatedAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully!",
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return NextResponse.json(
      { success: false, message: "Payment verification failed" },
      { status: 500 }
    );
  }
}
