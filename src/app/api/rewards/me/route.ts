import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId } from "@/lib/customerSession";
import { getRewardSummary } from "@/lib/rewardPoints";
import { DEFAULT_LADDER } from "@/lib/streakLadder";

export const dynamic = "force-dynamic";

/**
 * What a signed-out visitor (or an error) sees: nothing banked, first-rung rate.
 * Uses the seed ladder rather than a configured one — resolving a location's
 * ladder needs a session, and this payload exists only so the UI has a coherent
 * shape to render before sign-in.
 */
const EMPTY = {
  points: 0,
  streak: 0,
  nextStreak: 1,
  nextRate: DEFAULT_LADDER[0],
  rates: DEFAULT_LADDER,
  enabled: true,
};

/**
 * The signed-in customer's reward balance and day count, plus what an order
 * placed right now would earn and the ladder behind it. Preview only —
 * awardRewardPoints recomputes all of this server-side when the payment settles,
 * from the order's own location.
 *
 * `?societyId=` is the location being ordered to; it selects the ladder. An
 * unknown or missing id resolves to the default ladder rather than failing.
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
    const societyId = new URL(request.url).searchParams.get("societyId");
    const { db } = await connectToDatabase();
    const summary = await getRewardSummary(db, userId, new Date(), societyId);
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
