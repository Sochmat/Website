import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/lib/types";
import { getEffectiveStoreOpen, type StoreSettingsDoc } from "@/lib/storeState";
import { normalizePhone } from "@/lib/phone";

function generateSubscriptionNumber() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUB-${t}-${r}`;
}

export async function POST(request: NextRequest) {
  try {
    const { db: settingsDb } = await connectToDatabase();
    const storeDoc = await settingsDb.collection("settings").findOne({ key: "store" });
    if (!getEffectiveStoreOpen(storeDoc as StoreSettingsDoc | null, new Date()).open) {
      return NextResponse.json(
        { success: false, message: "Store is currently closed" },
        { status: 503 },
      );
    }

    const body = await request.json();
    // The delivery contact, not the account holder.
    const receiverPhone = normalizePhone(body.receiver?.phone);
    if (!receiverPhone) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid 10-digit receiver.phone is required",
        },
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

    // A lookup-or-create keyed on the receiver's phone used to sit here. It
    // minted a shadow account under someone else's number on every subscription
    // and was otherwise dead — this route never stored a userId at all.

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
            phone: receiverPhone,
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
