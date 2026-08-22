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
    const { currency = "INR" } = body;
    const flow = body.flow === "subscription" ? "subscription" : "order";
    const orderId = body.orderId ? String(body.orderId) : undefined;

    // What to charge is the SERVER's call. The client sends what it believes
    // the payable is, but the figure raised with Razorpay is frozen onto the
    // order below and is what reconcile later verifies the payment against —
    // so trusting the client here would let a tampered checkout settle a ₹500
    // order with a ₹1 payment. Read it back off the order instead; the client
    // number only stands in for flows with no order document (subscriptions).
    let amount = Number(body.amount);
    if (flow === "order" && orderId && ObjectId.isValid(orderId)) {
      const order = await db
        .collection("orders")
        .findOne(
          { _id: new ObjectId(orderId) },
          { projection: { netAmount: 1, totalAmount: 1 } },
        );
      if (order) amount = Number(order.netAmount ?? order.totalAmount);
    }

    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
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
      amount: Math.round(amount * 100),
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
    //
    // `razorpayAmountPaise` is frozen in the same write: it records what this
    // Razorpay order was raised for, so a failed checkout can hand the wallet
    // credit and reward points straight back (which moves `netAmount`) without
    // stranding a payment that captures afterwards. See `expectedChargePaise`.
    if (orderId && ObjectId.isValid(orderId)) {
      const collection = flow === "subscription" ? "subscriptions" : "orders";
      await db.collection(collection).updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            razorpayOrderId: order.id,
            razorpayAmountPaise: options.amount,
            updatedAt: new Date(),
          },
        },
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
