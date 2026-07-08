import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  computePlanTotals,
  generatePlanNumber,
  toPlanItem,
  type PlanDayInput,
  type PlanItem,
} from "@/lib/subscription";

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const storeDoc = await db.collection("settings").findOne({ key: "store" });
    if (storeDoc?.open === false) {
      return NextResponse.json(
        { success: false, message: "Store is currently closed" },
        { status: 503 },
      );
    }

    const body = await request.json();

    const phone = String(body.receiver?.phone ?? "").trim().replace(/\D/g, "");
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "receiver.phone is required" },
        { status: 400 },
      );
    }
    if (!body.weekStartDate) {
      return NextResponse.json(
        { success: false, message: "weekStartDate is required" },
        { status: 400 },
      );
    }
    const rawDays = Array.isArray(body.days) ? body.days : [];
    if (rawDays.length === 0) {
      return NextResponse.json(
        { success: false, message: "Pick at least one day" },
        { status: 400 },
      );
    }

    const days: PlanDayInput[] = rawDays.map((d: PlanDayInput) => ({
      date: String(d.date),
      weekday: String(d.weekday),
      productId: String(d.productId),
    }));

    // Authoritative item data straight from the DB, keyed by string id.
    const ids = days
      .map((d) => d.productId)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const dbItems = await db
      .collection("menuItems")
      .find({ _id: { $in: ids } })
      .toArray();
    const itemsById = new Map<string, PlanItem>();
    for (const it of dbItems) {
      itemsById.set(it._id.toString(), toPlanItem(it as never));
    }

    let totals;
    try {
      totals = computePlanTotals(days, itemsById);
    } catch (e) {
      return NextResponse.json(
        { success: false, message: (e as Error).message },
        { status: 400 },
      );
    }

    // Resolve or create the user by phone (mirrors legacy subscriptions POST).
    let user = (await db.collection("users").findOne({ phone })) as {
      _id: ObjectId;
    } | null;
    if (!user) {
      const insert = await db.collection("users").insertOne({
        phone,
        name: body.receiver?.name ?? "",
        address: body.receiver?.address ?? "",
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      user = { _id: insert.insertedId as ObjectId };
    }

    const planDoc = {
      planNumber: generatePlanNumber(),
      userId: user._id,
      weekStartDate: String(body.weekStartDate),
      days: totals.days,
      totalProtein: totals.totalProtein,
      totalKcal: totals.totalKcal,
      itemCount: totals.itemCount,
      subtotal: totals.subtotal,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
      receiver: {
        name: body.receiver?.name ?? "",
        phone,
        address: body.receiver?.address ?? "",
        lat: body.receiver?.lat,
        long: body.receiver?.long,
      },
      deliveryTime: String(body.deliveryTime ?? ""),
      paymentMethod: "razorpay" as const,
      paymentStatus: "pending" as const,
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("subscriptionPlans").insertOne(planDoc);
    const plan = await db
      .collection("subscriptionPlans")
      .findOne({ _id: result.insertedId });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create subscription plan" },
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
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (paymentId !== undefined) update.paymentId = paymentId;
    if (paymentStatus !== undefined) update.paymentStatus = paymentStatus;

    const { db } = await connectToDatabase();
    const result = await db
      .collection("subscriptionPlans")
      .updateOne({ _id: new ObjectId(_id) }, { $set: update });
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Plan not found" },
        { status: 404 },
      );
    }
    const plan = await db
      .collection("subscriptionPlans")
      .findOne({ _id: new ObjectId(_id) });
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update subscription plan" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("_id");
    const userId = searchParams.get("userId");

    const { db } = await connectToDatabase();

    if (id && ObjectId.isValid(id)) {
      const plan = await db
        .collection("subscriptionPlans")
        .findOne({ _id: new ObjectId(id) });
      return NextResponse.json({ success: true, plan });
    }

    const filter: Record<string, unknown> = {};
    if (userId && ObjectId.isValid(userId)) {
      filter.userId = new ObjectId(userId);
    } else {
      // Never return the whole collection to an unauthenticated customer call.
      return NextResponse.json({ success: true, plans: [] });
    }

    const plans = await db
      .collection("subscriptionPlans")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscription plans" },
      { status: 500 },
    );
  }
}
