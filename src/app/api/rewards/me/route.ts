import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId } from "@/lib/customerSession";
import { getRewardSummary } from "@/lib/rewardPoints";
import { POINT_RATES } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/** What a signed-out visitor (or an error) sees: nothing banked, day-1 rate. */
const EMPTY = {
  points: 0,
  streak: 0,
  nextStreak: 1,
  nextRate: POINT_RATES[0],
};

/**
 * The signed-in customer's reward balance and streak, plus what an order placed
 * right now would earn. Preview only — awardRewardPoints recomputes all of this
 * server-side when the payment settles.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: true, ...EMPTY },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { db } = await connectToDatabase();
    const summary = await getRewardSummary(db, userId, new Date());
    return NextResponse.json(
      { success: true, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error reading reward summary:", error);
    return NextResponse.json(
      { success: false, ...EMPTY },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
