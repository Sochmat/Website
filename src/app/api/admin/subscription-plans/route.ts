import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { accountCredits, isDateLocked } from "@/lib/subscriptionSchedule";
import { PLANS } from "@/lib/subscriptionPlanStore";
import type { SubscriptionMealPlan } from "@/lib/types";

// Admin-only; enforced by the admin session check in src/middleware.ts for /api/admin/*.

const PLAN_STATUSES = ["active", "completed", "cancelled", "expired"] as const;

/**
 * No `?date=` → every plan, with live credit accounting.
 * `?date=yyyy-mm-dd` → that day's deliveries, flattened server-side.
 *
 * `?lockedOnly=1` (the UI default) drops days the customer can still change.
 * The kitchen must not start cooking a meal that is still cancellable.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // yyyy-mm-dd, optional
    const lockedOnly = searchParams.get("lockedOnly") === "1";

    const { db } = await connectToDatabase();
    const now = new Date();

    if (date) {
      const plans = (await db
        .collection(PLANS)
        .find({
          paymentStatus: "paid",
          status: { $in: ["active", "completed"] },
          credits: { $elemMatch: { date, status: { $in: ["scheduled", "delivered"] } } },
        })
        .toArray()) as unknown as SubscriptionMealPlan[];

      // Each plan freezes at its own delivery-time cutoff, so `locked` is
      // computed per delivery rather than once for the whole date.
      const deliveries = plans.flatMap((plan) =>
        plan.credits
          .filter(
            (c) => c.date === date && (c.status === "scheduled" || c.status === "delivered"),
          )
          .map((c) => ({
            planId: String(plan._id),
            creditId: c.id,
            planNumber: plan.planNumber,
            bracket: plan.bracket,
            diet: plan.diet,
            receiver: plan.receiver,
            deliveryTime: plan.deliveryTime,
            itemName: c.itemName,
            protein: c.protein,
            isVeg: c.isVeg,
            status: c.status,
            locked: isDateLocked(date, now, plan.deliveryTime),
          })),
      );

      // Day-level flag = "every delivery is frozen" — drives the admin's
      // "still editable" empty state and the 10 AM auto-reveal.
      const locked = deliveries.length > 0 && deliveries.every((d) => d.locked);

      return NextResponse.json({
        success: true,
        date,
        locked,
        deliveries: lockedOnly ? deliveries.filter((d) => d.locked) : deliveries,
      });
    }

    const plans = (await db
      .collection(PLANS)
      .find({})
      .sort({ createdAt: -1 })
      .toArray()) as unknown as SubscriptionMealPlan[];

    return NextResponse.json({
      success: true,
      plans: plans.map((p) => ({
        ...p,
        // Derived, not stored — expiry is applied lazily on customer reads, so a
        // plan nobody has opened lately would otherwise display stale counts here.
        accounting: accountCredits(p.credits, p.expiresOn, now),
      })),
    });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch plans" },
      { status: 500 },
    );
  }
}

/** Change a plan's lifecycle status. */
export async function PATCH(request: NextRequest) {
  try {
    const { _id, status } = await request.json();
    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }
    if (!PLAN_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection(PLANS)
      .updateOne({ _id: new ObjectId(_id) }, { $set: { status, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update plan" },
      { status: 500 },
    );
  }
}

/** Mark one credit delivered. Guarded on `scheduled`, so it cannot fire twice. */
export async function POST(request: NextRequest) {
  try {
    const { planId, creditId, action } = await request.json();
    if (action !== "deliver") {
      return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
    }
    if (!planId || !ObjectId.isValid(planId) || !creditId) {
      return NextResponse.json(
        { success: false, message: "planId and creditId are required" },
        { status: 400 },
      );
    }

    const now = new Date();
    const { db } = await connectToDatabase();
    const result = await db.collection(PLANS).updateOne(
      {
        _id: new ObjectId(planId),
        credits: { $elemMatch: { id: creditId, status: "scheduled" } },
      },
      {
        $set: {
          "credits.$[c].status": "delivered",
          "credits.$[c].deliveredAt": now,
          updatedAt: now,
        },
      },
      { arrayFilters: [{ "c.id": creditId, "c.status": "scheduled" }] },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Not a scheduled meal" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking delivery:", error);
    return NextResponse.json(
      { success: false, message: "Failed to mark delivered" },
      { status: 500 },
    );
  }
}

/** Hard-delete a plan. `?id=<planId>`. Admin-only (middleware-guarded). */
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid plan ID is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection(PLANS).deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete plan" },
      { status: 500 },
    );
  }
}
