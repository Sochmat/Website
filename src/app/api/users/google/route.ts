import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

interface GoogleTokenInfo {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: string;
  aud?: string;
}

export async function POST(request: NextRequest) {
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
      const newUser = {
        phone: "",
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

    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");

    return NextResponse.json({
      success: true,
      token,
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
  } catch (error) {
    console.error("Error with Google login:", error);
    return NextResponse.json(
      { success: false, message: "Failed to login with Google" },
      { status: 500 }
    );
  }
}
