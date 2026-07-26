import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { limiters, rateLimit } from "@/lib/rateLimit";
import {
  CUSTOMER_COOKIE,
  customerCookieOptions,
  signCustomerSession,
} from "@/lib/customerAuth";
import { hasPhone } from "@/lib/phone";

interface GoogleTokenInfo {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: string;
  aud?: string;
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.auth);
  if (limited) return limited;
  try {
    const body = await request.json();
    const credential = String(body.credential ?? "").trim();

    if (!credential) {
      return NextResponse.json(
        { success: false, message: "Google credential is required" },
        { status: 400 }
      );
    }

    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!tokenInfoRes.ok) {
      return NextResponse.json(
        { success: false, message: "Invalid Google credential" },
        { status: 401 }
      );
    }

    const tokenInfo = (await tokenInfoRes.json()) as GoogleTokenInfo;
    const email = String(tokenInfo.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(tokenInfo.name ?? "").trim();
    const googleId = String(tokenInfo.sub ?? "").trim();
    const audience = String(tokenInfo.aud ?? "").trim();
    const configuredClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!email || !googleId || tokenInfo.email_verified !== "true") {
      return NextResponse.json(
        { success: false, message: "Google account email is not verified" },
        { status: 401 }
      );
    }

    if (configuredClientId && audience && configuredClientId !== audience) {
      return NextResponse.json(
        { success: false, message: "Google credential audience mismatch" },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();
    let user = await db.collection("users").findOne({ email });

    if (user) {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
        googleId,
      };
      if (name && !user.name) updates.name = name;

      await db.collection("users").updateOne({ email }, { $set: updates });
      user = { ...user, ...updates };
    } else {
      // No `phone: ""` — an empty string would sit inside the unique index's
      // partial filter and collide with every other phoneless signup. Absent
      // means absent; the client collects the number via POST /api/users/phone.
      const newUser = {
        email,
        name,
        googleId,
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await db.collection("users").insertOne(newUser);
      user = { _id: result.insertedId, ...newUser };
    }

    // Legacy opaque token, still read by UserContext for its localStorage state.
    // It authenticates nothing; the httpOnly cookie below is the real credential.
    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");

    const response = NextResponse.json({
      success: true,
      token,
      // Google never gives us a phone number. Until the account has one it is
      // exempt from the unique-phone rule and from the one-time offers, so the
      // client must collect it before letting the user continue.
      needsPhone: !hasPhone(user),
      user: {
        _id: user._id,
        phone: user.phone ?? "",
        name: user.name,
        email: user.email,
        address: user.address,
        addresses: user.addresses ?? [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });

    response.cookies.set(
      CUSTOMER_COOKIE,
      await signCustomerSession(String(user._id)),
      customerCookieOptions(),
    );
    return response;
  } catch (error) {
    console.error("Error with Google login:", error);
    return NextResponse.json(
      { success: false, message: "Failed to login with Google" },
      { status: 500 }
    );
  }
}
