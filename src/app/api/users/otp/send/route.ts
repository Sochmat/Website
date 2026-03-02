import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sendOTPSMS, isKaleyraConfigured } from "@/lib/kaleyra";
import { sendOTPEmail, isEmailConfigured } from "@/lib/email";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = String(body.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const isEmailFlow = Boolean(email);

    if (!phone && !email) {
      return NextResponse.json(
        { success: false, message: "Phone number or email is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne(isEmailFlow ? { email } : { phone });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found. Please register first." },
        { status: 404 }
      );
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const otpSet: Record<string, unknown> = {
      otp,
      channel: isEmailFlow ? "email" : "sms",
      expiresAt,
      createdAt: new Date(),
    };
    if (isEmailFlow) otpSet.email = email;
    else otpSet.phone = phone;

    await db.collection("otps").updateOne(
      isEmailFlow ? { email } : { phone },
      { $set: otpSet },
      { upsert: true }
    );

    if (isEmailFlow) {
      if (isEmailConfigured()) {
        const result = await sendOTPEmail(email, otp);
        if (!result.success) {
          return NextResponse.json(
            { success: false, message: result.error || "Failed to send OTP email" },
            { status: 502 }
          );
        }
      } else {
        console.log(`Email OTP for ${email}: ${otp}`);
      }
    } else {
      if (isKaleyraConfigured()) {
        const result = await sendOTPSMS(phone, otp);
        if (!result.success) {
          return NextResponse.json(
            { success: false, message: result.error || "Failed to send OTP" },
            { status: 502 }
          );
        }
      } else {
        console.log(`SMS OTP for ${phone}: ${otp}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send OTP" },
      { status: 500 }
    );
  }
}
