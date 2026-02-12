import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { paymentStatus, paymentId } = await request.json();
    const orderId = params.id;

    if (!ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const updateData: any = {
      paymentStatus,
      updatedAt: new Date(),
    };

    if (paymentId) {
      updateData.paymentId = paymentId;
    }

    const result = await db.collection("orders").updateOne(
      { _id: new ObjectId(orderId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 }
      );
    }

    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(orderId) });

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("Error updating order payment:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update order payment" },
      { status: 500 }
    );
  }
}
