import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerUserId, unauthorized } from "@/lib/customerSession";

/**
 * The signed-in customer, derived solely from the httpOnly session cookie.
 *
 * This is the client's only source of identity. It replaces the `user` blob
 * that used to live in `localStorage`, where the browser could claim to be
 * signed in long after the real session had expired — the UI rendered an
 * account while every API call 401'd.
 *
 * Takes no parameters on purpose: anything the caller could supply would be
 * something an attacker could supply too.
 */

// Per-request and cookie-dependent — must never be prerendered or cached.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCustomerUserId(request);
    if (!userId) return unauthorized();

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne({ _id: userId });

    // A valid signature for a user who no longer exists (deleted account) is
    // still not a session. Answering 401 keeps the client from rendering a
    // signed-in shell around nothing.
    if (!user) return unauthorized();

    return NextResponse.json(
      {
        success: true,
        user: {
          _id: user._id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          address: user.address,
          addresses: user.addresses ?? [],
          // Served here rather than from /api/referral/me because the header
          // pill needs it on every load: this document is already in hand, so
          // it costs no extra query, whereas referral/me aggregates the whole
          // wallet ledger and lazily *writes* a referral code as a side effect.
          walletBalance: Number(user.walletBalance ?? 0),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error loading current user:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load current user" },
      { status: 500 },
    );
  }
}
