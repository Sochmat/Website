import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
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

    if (expectedSignature === razorpay_signature) {
      if (orderId && ObjectId.isValid(orderId)) {
        const { db } = await connectToDatabase();
        const orderUpdate = await db.collection("orders").updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              paymentStatus: "paid",
              paymentId: razorpay_payment_id,
              updatedAt: new Date(),
            },
          }
        );
        if (orderUpdate.matchedCount === 0) {
          await db.collection("subscriptions").updateOne(
            { _id: new ObjectId(orderId) },
            {
              $set: {
                paymentStatus: "paid",
                paymentId: razorpay_payment_id,
                updatedAt: new Date(),
              },
            }
          );
        }
      }
      return NextResponse.json({
        success: true,
        message: "Payment verified successfully!",
      });
    } else {
      return NextResponse.json(
        { success: false, message: "Payment verification failed!" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Payment verification failed" },
      { status: 500 }
    );
  }
}
