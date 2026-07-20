import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  computeBracketPlanTotals,
  isBracketKey,
  isDiet,
} from "@/lib/subscriptionBrackets";
import {
  applyFirstPlanDiscount,
  computeWalletApplied,
} from "@/lib/subscriptionDiscount";
import { getWalletBalance } from "@/lib/wallet";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import type { SubscriptionBracket } from "@/lib/types";

/** Display-only price preview for the signed-in customer. Never trusted for money. */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { searchParams } = new URL(request.url);
    const bracket = searchParams.get("bracket");
    const diet = searchParams.get("diet");
    if (!isBracketKey(bracket)) {
      return NextResponse.json({ success: false, message: "Unknown bracket" }, { status: 400 });
    }
    if (!isDiet(diet)) {
      return NextResponse.json({ success: false, message: "Unknown diet" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
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

    const priorPaid = await db
      .collection("subscriptionMealPlans")
      .findOne({ userId, paymentStatus: "paid" }, { projection: { _id: 1 } });
    const isFirstPlan = !priorPaid;

    let { subtotal, tax, totalAmount } = totals;
    let firstPlanDiscount = 0;
    if (isFirstPlan) {
      const d = applyFirstPlanDiscount(totals);
      subtotal = d.discountedSubtotal;
      tax = d.tax;
      totalAmount = d.totalAmount;
      firstPlanDiscount = d.firstPlanDiscount;
    }

    const walletBalance = await getWalletBalance(db, userId);
    const { walletApplied, amountPayable } = computeWalletApplied(walletBalance, totalAmount);

    return NextResponse.json({
      success: true,
      quote: {
        subtotal,
        tax,
        totalAmount,
        firstPlanDiscount,
        isFirstPlan,
        walletBalance,
        walletApplied,
        amountPayable,
      },
    });
  } catch (error) {
    console.error("Error building plan quote:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build quote" },
      { status: 500 },
    );
  }
}
