import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { validateUnschedule } from "@/lib/subscriptionSchedule";
import { PLANS, loadOwnedPlan } from "@/lib/subscriptionPlanStore";

/**
 * Set a per-meal delivery address on one scheduled credit. Editable on the same
 * terms as removing a meal — while its day is still unlocked (before IST noon).
 * The address is snapshotted onto the credit so a later profile edit can't
 * silently reroute a locked delivery.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { planId } = await params;
    const { db } = await connectToDatabase();
    const now = new Date();

    const owned = await loadOwnedPlan(db, planId, userId, now);
    if (!owned) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }
    const { plan } = owned;

    const body = await request.json();
    const creditId = String(body.creditId ?? "");
    const r = body.receiver ?? {};
    const receiver = {
      name: String(r.name ?? "").trim(),
      phone: String(r.phone ?? "").trim(),
      address: String(r.address ?? "").trim(),
      lat: typeof r.lat === "number" ? r.lat : undefined,
      long: typeof r.long === "number" ? r.long : undefined,
    };
    if (!receiver.name || !receiver.phone || !receiver.address) {
      return NextResponse.json(
        { success: false, message: "Incomplete delivery address" },
        { status: 400 },
      );
    }

    const credit = plan.credits.find((c) => c.id === creditId);
    if (!credit || credit.status !== "scheduled" || !credit.date) {
      return NextResponse.json(
        { success: false, message: "That meal is not scheduled" },
        { status: 400 },
      );
    }

    const rejection = validateUnschedule({
      now,
      date: credit.date,
      planStatus: plan.status,
      deliveryTime: plan.deliveryTime,
    });
    if (rejection) {
      return NextResponse.json(
        { success: false, reason: rejection, message: "That day is locked" },
        { status: 400 },
      );
    }

    const result = await db.collection(PLANS).updateOne(
      {
        _id: new ObjectId(planId),
        userId,
        paymentStatus: "paid",
        status: "active",
        credits: { $elemMatch: { id: creditId, status: "scheduled" } },
      },
      {
        $set: {
          "credits.$[c].receiver": receiver,
          updatedAt: now,
        },
      },
      { arrayFilters: [{ "c.id": creditId, "c.status": "scheduled" }] },
    );
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, reason: "conflict", message: "Please try again" },
        { status: 409 },
      );
    }

    const plan2 = await db.collection(PLANS).findOne({ _id: new ObjectId(planId) });
    return NextResponse.json({ success: true, plan: plan2 });
  } catch (error) {
    console.error("Error setting delivery address:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update address" },
      { status: 500 },
    );
  }
}
