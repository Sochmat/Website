import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { generatePlanNumber } from "@/lib/subscription";
import {
  MEALS_PER_PLAN,
  computeBracketPlanTotals,
  isBracketKey,
  isDiet,
} from "@/lib/subscriptionBrackets";
import { accountCredits, expireCredits } from "@/lib/subscriptionSchedule";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import {
  applyFirstPlanDiscount,
  computeWalletApplied,
} from "@/lib/subscriptionDiscount";
import {
  getWalletBalance,
  reserveWallet,
  sweepStalePlanReservations,
} from "@/lib/wallet";
import { isEligibleForFirstPlanDiscount } from "@/lib/subscriptionEligibility";
import type { SubscriptionBracket, SubscriptionCredit, SubscriptionMealPlan } from "@/lib/types";

// NOTE: there is deliberately no PATCH handler here.
//
// The old one accepted `{ _id, paymentStatus: "paid" }` from anyone, with no auth
// and no payment check — a free plan for the price of one curl. The only path to
// `paid` is now POST /api/subscriptions/plans/verify, which checks the Razorpay
// signature, the captured amount, and replay.

/**
 * Buy MEALS_PER_PLAN credits in one bracket + diet.
 *
 * The request carries no prices and no item ids. The bracket is read from Mongo
 * and priced server-side; the customer picks their meals afterwards, from the
 * scheduler, by spending credits.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { db } = await connectToDatabase();

    // Subscriptions are sold and scheduled independently of the à-la-carte
    // store hours — a closed store must not block buying a plan.
    const body = await request.json();
    const { bracket, diet } = body;

    if (!isBracketKey(bracket)) {
      return NextResponse.json({ success: false, message: "Unknown bracket" }, { status: 400 });
    }
    if (!isDiet(diet)) {
      return NextResponse.json({ success: false, message: "Unknown diet" }, { status: 400 });
    }

    const phone = String(body.receiver?.phone ?? "").trim().replace(/\D/g, "");
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "receiver.phone is required" },
        { status: 400 },
      );
    }
    const address = String(body.receiver?.address ?? "").trim();
    if (!address) {
      return NextResponse.json(
        { success: false, message: "A delivery address is required" },
        { status: 400 },
      );
    }

    const bracketDoc = (await db
      .collection("subscriptionBrackets")
      .findOne({ key: bracket, active: { $ne: false } })) as unknown as SubscriptionBracket | null;
    if (!bracketDoc) {
      return NextResponse.json(
        { success: false, message: "That plan is not available right now" },
        { status: 400 },
      );
    }

    let totals;
    try {
      totals = computeBracketPlanTotals(bracketDoc, diet);
    } catch (e) {
      return NextResponse.json({ success: false, message: (e as Error).message }, { status: 400 });
    }

    const credits: SubscriptionCredit[] = Array.from(
      { length: MEALS_PER_PLAN },
      (_, i) => ({ id: `c${i + 1}`, status: "available" as const }),
    );

    // First-plan 20% discount: only when this user is still eligible (no paid plan,
    // and no fresh pending plan already holding the discount — see the helper).
    const eligibleForFirstPlanDiscount = await isEligibleForFirstPlanDiscount(db, userId);

    let subtotal = totals.subtotal;
    let tax = totals.tax;
    let totalAmount = totals.totalAmount;
    let firstPlanDiscount = 0;
    if (eligibleForFirstPlanDiscount) {
      const discounted = applyFirstPlanDiscount(totals);
      subtotal = discounted.discountedSubtotal;
      tax = discounted.tax;
      totalAmount = discounted.totalAmount;
      firstPlanDiscount = discounted.firstPlanDiscount;
    }

    const now = new Date();
    const planDoc: Omit<SubscriptionMealPlan, "_id"> = {
      planNumber: generatePlanNumber(),
      userId,
      bracket,
      diet,
      pricePerMeal: totals.pricePerMeal,
      mealCount: totals.mealCount,
      subtotal,
      tax,
      totalAmount,
      firstPlanDiscount,
      // Wallet is reserved after insert (needs the plan _id); provisional here.
      walletApplied: 0,
      amountPayable: totalAmount,
      credits,
      // Expiry is anchored at payment, not at creation — an abandoned checkout
      // must not silently burn a customer's 30-day window.
      expiresOn: "",
      receiver: {
        name: String(body.receiver?.name ?? ""),
        phone,
        address,
        lat: body.receiver?.lat,
        long: body.receiver?.long,
      },
      deliveryTime: String(body.deliveryTime ?? ""),
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("subscriptionMealPlans").insertOne(planDoc);
    const planId = result.insertedId;

    // Reserve wallet against the just-created plan. Capped to leave >= MIN_PAYABLE.
    const balance = await getWalletBalance(db, userId);
    const { walletApplied, amountPayable } = computeWalletApplied(
      balance,
      totalAmount,
    );
    let reservedApplied = 0;
    let reservedPayable = totalAmount;
    if (walletApplied > 0 && (await reserveWallet(db, userId, planId, walletApplied))) {
      reservedApplied = walletApplied;
      reservedPayable = amountPayable;
      await db
        .collection("subscriptionMealPlans")
        .updateOne(
          { _id: planId },
          { $set: { walletApplied: reservedApplied, amountPayable: reservedPayable } },
        );
    }

    return NextResponse.json({
      success: true,
      plan: {
        ...planDoc,
        _id: planId,
        walletApplied: reservedApplied,
        amountPayable: reservedPayable,
      },
    });
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create subscription plan" },
      { status: 500 },
    );
  }
}

/** The signed-in customer's plans. Any `?userId=` in the query is ignored. */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { db } = await connectToDatabase();

    // Return wallet held by checkouts abandoned before the fail-call fired.
    await sweepStalePlanReservations(db, userId, 30 * 60 * 1000);

    const plans = (await db
      .collection("subscriptionMealPlans")
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray()) as unknown as SubscriptionMealPlan[];

    const now = new Date();
    const withAccounting = [];
    for (const plan of plans) {
      // Expiry is lazy: sweep on read so the list never shows spendable credits
      // that the schedule endpoint would reject.
      const expired = expireCredits(plan.credits, plan.expiresOn, now);
      if (expired) {
        plan.credits = expired;
        const accounting = accountCredits(expired, plan.expiresOn, now);
        const status = accounting.exhausted ? "expired" : plan.status;
        await db
          .collection("subscriptionMealPlans")
          .updateOne({ _id: new ObjectId(plan._id) }, { $set: { credits: expired, status, updatedAt: now } });
        plan.status = status as SubscriptionMealPlan["status"];
      }
      withAccounting.push({
        ...plan,
        accounting: accountCredits(plan.credits, plan.expiresOn, now),
      });
    }

    return NextResponse.json({ success: true, plans: withAccounting });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch subscription plans" },
      { status: 500 },
    );
  }
}
