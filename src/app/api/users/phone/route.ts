import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { getCustomerUserId } from "@/lib/customerSession";
import { normalizePhone } from "@/lib/phone";
import { claimPhoneForUser, PHONE_TAKEN_MESSAGE } from "@/lib/userPhone";

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
