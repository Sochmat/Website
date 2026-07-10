import { NextRequest, NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { isItemAllowed } from "@/lib/subscriptionBrackets";
import {
  validateReschedule,
  validateSchedule,
  validateUnschedule,
  type ScheduleRejection,
} from "@/lib/subscriptionSchedule";
import { istWeekday } from "@/lib/ist";
import {
  PLANS,
  loadOwnedPlan,
  settlePlanStatus,
  takenDates,
} from "@/lib/subscriptionPlanStore";
import type { SubscriptionMenuItem } from "@/lib/types";

/**
 * Spend, move, and return meal credits.
 *
 * Every mutation is ONE conditional `updateOne` with `arrayFilters` plus an
 * `$elemMatch` precondition. The server evaluates both together, so "one credit,
 * one claim" and "one meal per date" hold without a transaction: a losing racer
 * gets `matchedCount: 0` and a 409. Do not refactor this into read-then-write.
 */

const REJECTION_MESSAGES: Record<ScheduleRejection, string> = {
  "plan-not-active": "This plan is no longer active",
  "date-in-past": "That day has already passed",
  "date-locked": "That day is locked — meals are fixed at 12:00 PM",
  "date-after-expiry": "That day is past your plan's expiry",
  "date-taken": "You already have a meal booked that day",
  "no-credit-available": "No meal credits left",
  "item-not-allowed": "That meal is not in your plan's bracket",
};

function reject(reason: ScheduleRejection) {
  return NextResponse.json(
    { success: false, reason, message: REJECTION_MESSAGES[reason] },
    { status: 400 },
  );
}

const conflict = () =>
  NextResponse.json(
    { success: false, reason: "conflict", message: "Please try again" },
    { status: 409 },
  );

const notFound = () =>
  NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });

async function loadItem(db: Db, productId: unknown): Promise<SubscriptionMenuItem | null> {
  const id = String(productId ?? "");
  if (!ObjectId.isValid(id)) return null;
  return (await db
    .collection("subscriptionMenuItems")
    .findOne({ _id: new ObjectId(id) })) as unknown as SubscriptionMenuItem | null;
}

/** Snapshot the item onto the credit, so a later admin rename can't rewrite a locked delivery. */
function itemSnapshot(item: SubscriptionMenuItem, date: string) {
  return {
    date,
    weekday: istWeekday(date),
    productId: String(item._id),
    itemName: item.name,
    protein: item.protein,
    kcal: item.kcal,
    isVeg: item.isVeg,
  };
}

function reload(db: Db, planId: string) {
  return db.collection(PLANS).findOne({ _id: new ObjectId(planId) });
}

/** Assign an available credit to a date + item. */
export async function POST(
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
    if (!owned) return notFound();
    const { plan, accounting } = owned;

    const body = await request.json();
    const date = String(body.date ?? "");
    const item = await loadItem(db, body.productId);

    const rejection = validateSchedule({
      now,
      date,
      expiresOn: plan.expiresOn,
      planStatus: plan.status,
      takenDates: takenDates(plan),
      availableCredits: accounting.available,
      itemAllowed: !!item && isItemAllowed(item, plan.bracket, plan.diet),
    });
    if (rejection) return reject(rejection);

    const creditId =
      String(body.creditId ?? "") ||
      plan.credits.find((c) => c.status === "available")!.id;

    const result = await db.collection(PLANS).updateOne(
      {
        _id: new ObjectId(planId),
        userId,
        paymentStatus: "paid",
        status: "active",
        credits: { $elemMatch: { id: creditId, status: "available" } },
        // No sibling credit may already hold this date.
        "credits.date": { $ne: date },
      },
      {
        $set: {
          "credits.$[c].status": "scheduled",
          ...Object.fromEntries(
            Object.entries(itemSnapshot(item!, date)).map(([k, v]) => [`credits.$[c].${k}`, v]),
          ),
          "credits.$[c].scheduledAt": now,
          updatedAt: now,
        },
      },
      { arrayFilters: [{ "c.id": creditId, "c.status": "available" }] },
    );
    if (result.matchedCount === 0) return conflict();

    await settlePlanStatus(db, planId, now);
    return NextResponse.json({ success: true, plan: await reload(db, planId) });
  } catch (error) {
    console.error("Error scheduling meal:", error);
    return NextResponse.json({ success: false, message: "Failed to schedule" }, { status: 500 });
  }
}

/** Move a scheduled credit to another date, and/or swap its item. */
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
    if (!owned) return notFound();
    const { plan } = owned;

    const body = await request.json();
    const creditId = String(body.creditId ?? "");
    const credit = plan.credits.find((c) => c.id === creditId);
    if (!credit || credit.status !== "scheduled" || !credit.date) {
      return NextResponse.json(
        { success: false, message: "That meal is not scheduled" },
        { status: 400 },
      );
    }

    const fromDate = credit.date;
    const toDate = body.date ? String(body.date) : fromDate;
    const item = body.productId
      ? await loadItem(db, body.productId)
      : await loadItem(db, credit.productId);

    const rejection = validateReschedule({
      now,
      fromDate,
      toDate,
      expiresOn: plan.expiresOn,
      planStatus: plan.status,
      takenDates: takenDates(plan),
      itemAllowed: !!item && isItemAllowed(item, plan.bracket, plan.diet),
    });
    if (rejection) return reject(rejection);

    const result = await db.collection(PLANS).updateOne(
      {
        _id: new ObjectId(planId),
        userId,
        paymentStatus: "paid",
        status: "active",
        credits: { $elemMatch: { id: creditId, status: "scheduled", date: fromDate } },
        // A genuine move must not land on a date some other credit grabbed meanwhile.
        // (Skipped for an in-place item swap, where the credit already owns the date.)
        ...(toDate !== fromDate ? { "credits.date": { $ne: toDate } } : {}),
      },
      {
        $set: {
          ...Object.fromEntries(
            Object.entries(itemSnapshot(item!, toDate)).map(([k, v]) => [`credits.$[c].${k}`, v]),
          ),
          "credits.$[c].scheduledAt": now,
          updatedAt: now,
        },
      },
      // Pinned on the source date, so a concurrent noon-lock or a stale client can't win.
      { arrayFilters: [{ "c.id": creditId, "c.status": "scheduled", "c.date": fromDate }] },
    );
    if (result.matchedCount === 0) return conflict();

    return NextResponse.json({ success: true, plan: await reload(db, planId) });
  } catch (error) {
    console.error("Error rescheduling meal:", error);
    return NextResponse.json({ success: false, message: "Failed to reschedule" }, { status: 500 });
  }
}

/** Return a scheduled credit to the pool. Never refunds money. */
export async function DELETE(
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
    if (!owned) return notFound();
    const { plan } = owned;

    const creditId = new URL(request.url).searchParams.get("creditId") ?? "";
    const credit = plan.credits.find((c) => c.id === creditId);
    if (!credit || credit.status !== "scheduled" || !credit.date) {
      return NextResponse.json(
        { success: false, message: "That meal is not scheduled" },
        { status: 400 },
      );
    }

    const rejection = validateUnschedule({ now, date: credit.date, planStatus: plan.status });
    if (rejection) return reject(rejection);

    const result = await db.collection(PLANS).updateOne(
      {
        _id: new ObjectId(planId),
        userId,
        paymentStatus: "paid",
        status: "active",
        credits: { $elemMatch: { id: creditId, status: "scheduled" } },
      },
      {
        $set: { "credits.$[c].status": "available", updatedAt: now },
        $unset: {
          "credits.$[c].date": "",
          "credits.$[c].weekday": "",
          "credits.$[c].productId": "",
          "credits.$[c].itemName": "",
          "credits.$[c].protein": "",
          "credits.$[c].kcal": "",
          "credits.$[c].isVeg": "",
          "credits.$[c].scheduledAt": "",
        },
      },
      { arrayFilters: [{ "c.id": creditId, "c.status": "scheduled" }] },
    );
    if (result.matchedCount === 0) return conflict();

    return NextResponse.json({ success: true, plan: await reload(db, planId) });
  } catch (error) {
    console.error("Error unscheduling meal:", error);
    return NextResponse.json({ success: false, message: "Failed to unschedule" }, { status: 500 });
  }
}
