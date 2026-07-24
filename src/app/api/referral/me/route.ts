import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";
import { getOrCreateReferralCode } from "@/lib/referral";

export const dynamic = "force-dynamic";

/**
 * The signed-in customer's referral summary: their code, a share link to the
 * main site, wallet balance, and referral earnings (derived from the ledger).
 */
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
    const referralCount = earnedRows.length;
    const earned = earnedRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

    // Share link points at the main site (origin of this request), not the
    // subscription subdomain.
    const shareUrl = `${request.nextUrl.origin}/?ref=${referralCode}`;

    return NextResponse.json(
      {
        success: true,
        referralCode,
        shareUrl,
        walletBalance: Number(user?.walletBalance ?? 0),
        referralCount,
        earned,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error building referral summary:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load referral info" },
      { status: 500 },
    );
  }
}
