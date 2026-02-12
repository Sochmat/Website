import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/lib/types";

function generateSubscriptionNumber() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUB-${t}-${r}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = String(body.receiver?.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "user.phone is required" },
        { status: 400 },
      );
    }
    if (!body.productId) {
      return NextResponse.json(
        { success: false, message: "productId is required" },
        { status: 400 },
      );
    }
    const totalAmount = Number(body.totalAmount);
    if (Number.isNaN(totalAmount) || totalAmount < 0) {
      return NextResponse.json(
        {
          success: false,
          message: "totalAmount is required and must be a number",
        },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    let user = (await db.collection("users").findOne({ phone })) as {
      _id: ObjectId;
      phone: string;
      name?: string;
    } | null;
    if (!user) {
      const newUser = {
        phone,
        name: body.receiver?.name ?? "",
        address: body.receiver?.address ?? "",
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const insertResult = await db.collection("users").insertOne(newUser);
      user = {
        _id: insertResult.insertedId as ObjectId,
        phone,
        name: newUser.name,
      };
    }
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Failed to resolve user" },
        { status: 500 },
      );
    }

    const tax = Number(body.tax) ?? 0;
    const subscriptionNumber = generateSubscriptionNumber();

    const subscriptionDoc = {
      subscriptionNumber,
      productId: body.productId,
      quantityOption: body.quantityOption,
      deliveryDate: body.deliveryDate,
      deliveryTime: body.deliveryTime,
      duration: body.duration,
      frequency: body.frequency,
      receiver: body.receiver
        ? {
            name: body.receiver.name ?? "",
            phone: String(body.receiver.phone ?? "").trim(),
            address: body.receiver.address ?? "",
          }
        : undefined,
      totalAmount,
      tax,
      paymentStatus: "pending" as const,
      status: "active" as const,
      paymentMethod: body.paymentMethod ?? "cash",
      paymentId: body.paymentId ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("subscriptions").insertOne(subscriptionDoc);
    const subscription = await db
      .collection("subscriptions")
      .findOne({ _id: result.insertedId });

    return NextResponse.json({ success: true, subscription });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create subscription" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { _id, paymentId, paymentStatus } = body;

    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid subscription ID is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (paymentId !== undefined) {
      updateData.paymentId = paymentId;
    }
    if (paymentStatus !== undefined) {
      updateData.paymentStatus = paymentStatus;
    }

    const result = await db.collection("subscriptions").updateOne(
      { _id: new ObjectId(_id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Subscription not found" },
        { status: 404 },
      );
    }

    const subscription = await db
      .collection("subscriptions")
      .findOne({ _id: new ObjectId(_id) });

    return NextResponse.json({ success: true, subscription });
  } catch (error) {
    console.error("Error updating subscription:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update subscription" },
      { status: 500 },
    );
  }
}
