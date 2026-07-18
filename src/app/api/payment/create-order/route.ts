import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { connectToDatabase } from "@/lib/mongodb";
import { logPayment } from "@/lib/paymentLog";

const ROUTE = "/api/payment/create-order";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;
  const { db } = await connectToDatabase();
  try {
    const body = await request.json();
    const { amount, currency = "INR" } = body;
    const flow = body.flow === "subscription" ? "subscription" : "order";
    const orderId = body.orderId ? String(body.orderId) : undefined;

    if (!amount || amount <= 0) {
      await logPayment(db, {
        flow,
        route: ROUTE,
        stage: "invalid-amount",
        outcome: "failure",
        message: "Amount is required",
        orderId,
        meta: { amount },
      });
      return NextResponse.json(
        { success: false, message: "Amount is required" },
        { status: 400 }
      );
    }

    const options = {
      amount: amount * 100,
      currency,
      receipt: `receipt_${Date.now()}`,
      // Carry the internal id on the Razorpay order so the webhook can map the
      // captured payment back to our record even if the DB write below lagged.
      notes: { orderId: orderId ?? "", flow },
    };

    const order = await razorpay.orders.create(options);

    // Persist the Razorpay↔internal-order link NOW, at create time. This is what
    // lets the webhook reconcile a payment when the client verify call never
    // fires (UPI-intent redirect, tab eviction) — without it a captured payment
    // has no way back to a still-pending order.
    if (orderId && ObjectId.isValid(orderId)) {
      const collection = flow === "subscription" ? "subscriptions" : "orders";
      await db
        .collection(collection)
        .updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { razorpayOrderId: order.id, updatedAt: new Date() } },
        );
    }

    await logPayment(db, {
      flow,
      route: ROUTE,
      stage: "created",
      outcome: "success",
      message: `Razorpay order created for ₹${amount}`,
      orderId,
      razorpayOrderId: order.id,
      amountPaise: options.amount,
    });
    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Error creating Razorpay order:", error);
    await logPayment(db, {
      flow: "unknown",
      route: ROUTE,
      stage: "create-error",
      outcome: "failure",
      message: "Failed to create Razorpay order",
      error: error?.message,
      errorCode: error?.error?.code ?? error?.statusCode,
    });
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
