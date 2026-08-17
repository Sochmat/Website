import { NextRequest, NextResponse } from "next/server";
import type { Db, ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { findUserIdByReferralCode } from "@/lib/referral";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { getCustomerUserId } from "@/lib/customerSession";
import { normalizePhone } from "@/lib/phone";
import { claimPhoneForUser, PHONE_TAKEN_MESSAGE } from "@/lib/userPhone";

/**
 * Attribute the caller to a referrer, for a code typed during Google signup.
 *
 * Best-effort and heavily guarded, because this endpoint is callable directly:
 * `referredBy` is set once and never rewritten, a self-referral is refused, and
 * an account that has already paid for an order can no longer be attributed —
 * without that last one a dormant account could claim a referral long after the
 * fact. An unrecognised code is ignored rather than erroring, matching
 * otp/register, so a typo never blocks the signup it rides along with.
 */
async function applyReferralIfEligible(
  db: Db,
  userId: ObjectId,
  rawRef: unknown,
): Promise<void> {
  const ref = String(rawRef ?? "").trim().toUpperCase();
  if (!ref) return;

  const user = await db
    .collection("users")
    .findOne({ _id: userId }, { projection: { referredBy: 1 } });
  if (!user || user.referredBy) return;

  const paid = await db
    .collection("orders")
    .findOne({ userId, paymentStatus: "paid" }, { projection: { _id: 1 } });
  if (paid) return;

  const referrerId = await findUserIdByReferralCode(db, ref);
  if (!referrerId || referrerId.equals(userId)) return;

  await db
    .collection("users")
    .updateOne(
      { _id: userId, referredBy: { $exists: false } },
      { $set: { referredBy: referrerId, updatedAt: new Date() } },
    );
}

/**
 * Set the phone number on the signed-in account.
 *
 * Deliberately separate from `PATCH /api/users`, which has no collision
 * handling and keeps `phone` off its allow-list. Rate-limited so it cannot be
 * used to enumerate which numbers are already registered.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.auth);
  if (limited) return limited;
  try {
    // Never a body `userId` — the cookie is the only identity we trust.
    const userId = await getCustomerUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Not signed in" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const phone = normalizePhone(body.phone);
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "A valid 10-digit phone number is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const outcome = await claimPhoneForUser(db, userId, phone);
    if (outcome === "taken") {
      return NextResponse.json(
        { success: false, message: PHONE_TAKEN_MESSAGE },
        { status: 409 },
      );
    }

    await applyReferralIfEligible(db, userId, body.ref);

    const user = await db.collection("users").findOne({ _id: userId });
    return NextResponse.json({
      success: true,
      user: {
        _id: user?._id,
        phone: user?.phone ?? "",
        name: user?.name,
        email: user?.email,
        address: user?.address,
        addresses: user?.addresses ?? [],
        // The header pill totals these; without them here it would read ₹0
        // from sign-in until the next /api/users/me fetch on a fresh mount.
        walletBalance: Number(user?.walletBalance ?? 0),
        rewardPoints: Number(user?.rewardPoints ?? 0),
        createdAt: user?.createdAt,
        updatedAt: user?.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error setting user phone:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save phone number" },
      { status: 500 },
    );
  }
}
