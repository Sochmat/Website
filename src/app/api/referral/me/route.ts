import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { getOrCreateReferralCode } from "@/lib/referral";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { db } = await connectToDatabase();
    const referralCode = await getOrCreateReferralCode(db, userId);

    const user = await db
      .collection("users")
      .findOne({ _id: userId }, { projection: { walletBalance: 1 } });
    const earnedRows = await db
      .collection("walletTransactions")
      .find({ userId, type: "referral_earned" })
      .toArray();
    const earned = earnedRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

    return NextResponse.json({
      success: true,
      referralCode,
      shareUrl: `https://subscription.sochmat.com/?ref=${referralCode}`,
      walletBalance: Number(user?.walletBalance ?? 0),
      referralCount: earnedRows.length,
      earned,
    });
  } catch (error) {
    console.error("Error building referral summary:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load referral info" },
      { status: 500 },
    );
  }
}
