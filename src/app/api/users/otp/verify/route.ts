import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = String(body.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    const otp = String(body.otp ?? "").trim();
    
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "Phone number is required" },
        { status: 400 }
      );
    }

    if (!otp) {
      return NextResponse.json(
        { success: false, message: "OTP is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const otpRecord = await db.collection("otps").findOne({ phone });
    
    if (!otpRecord) {
      return NextResponse.json(
        { success: false, message: "OTP not found. Please request a new OTP." },
        { status: 404 }
      );
    }

    if (new Date() > otpRecord.expiresAt) {
      await db.collection("otps").deleteOne({ phone });
      return NextResponse.json(
        { success: false, message: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    if (otpRecord.otp !== otp) {
      return NextResponse.json(
        { success: false, message: "Invalid OTP" },
        { status: 400 }
      );
    }

    const user = await db.collection("users").findOne({ phone });
    
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    await db.collection("otps").deleteOne({ phone });

    const token = Buffer.from(`${user._id}:${Date.now()}`).toString("base64");
    
    return NextResponse.json({
      success: true,
      token,
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        address: user.address,
        addresses: user.addresses ?? [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return NextResponse.json(
      { success: false, message: "Failed to verify OTP" },
      { status: 500 }
    );
  }
}
