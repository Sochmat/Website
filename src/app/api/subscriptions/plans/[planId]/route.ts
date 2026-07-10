import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { loadOwnedPlan } from "@/lib/subscriptionPlanStore";
import { schedulableDates } from "@/lib/subscriptionSchedule";

/**
 * One plan, with its credit accounting and the day cards the scheduler renders.
 *
 * `days` is computed here rather than in the browser: the lock rule is IST noon,
 * and a client whose clock (or timezone) is off must not be able to decide that a
 * frozen day is still editable.
 */
export async function GET(
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
    // 404, not 403 — a stranger's plan id must not be distinguishable from a typo.
    if (!owned) {
      return NextResponse.json({ success: false, message: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      plan: owned.plan,
      accounting: owned.accounting,
      days: owned.plan.expiresOn ? schedulableDates(now, owned.plan.expiresOn) : [],
    });
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch plan" },
      { status: 500 },
    );
  }
}
