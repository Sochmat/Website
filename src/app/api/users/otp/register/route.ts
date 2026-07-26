import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sendOTPSMS, isKaleyraConfigured } from "@/lib/kaleyra";
import { sendOTPEmail, isEmailConfigured } from "@/lib/email";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { findUserIdByReferralCode } from "@/lib/referral";
import { normalizePhone, hasPhone } from "@/lib/phone";
import { isPhoneAvailableFor, PHONE_TAKEN_MESSAGE } from "@/lib/userPhone";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.auth);
  if (limited) return limited;
  try {
    const body = await request.json();
    const phone = String(body.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : "";
    const isEmailFlow = Boolean(email);

    if (!phone && !email) {
      return NextResponse.json(
        { success: false, message: "Phone number or email is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const query = isEmailFlow ? { email } : { phone };

    let user = await db.collection("users").findOne(query);

    // In the email flow `body.phone` is the account's profile phone, required at
    // registration so one-time offers can be rationed per number rather than per
    // address. (In the legacy SMS flow it is the identity instead, and is
    // already handled by `query` above.)
    let pendingPhone: string | null = null;
    if (isEmailFlow && !hasPhone(user)) {
      pendingPhone = normalizePhone(body.phone);
      if (!pendingPhone) {
        return NextResponse.json(
          { success: false, message: "A valid 10-digit phone number is required" },
          { status: 400 }
        );
      }
      if (!(await isPhoneAvailableFor(db, pendingPhone, email))) {
        return NextResponse.json(
          { success: false, message: PHONE_TAKEN_MESSAGE },
          { status: 409 }
        );
      }
    }

    if (user && name) {
      await db.collection("users").updateOne(
        query,
        { $set: { name, updatedAt: new Date() } }
      );
    } else if (!user) {
      const newUser: Record<string, unknown> = {
        name: name || "",
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (isEmailFlow) newUser.email = email;
      else newUser.phone = phone;
      // Referral attribution: set `referredBy` once, only for a brand-new user.
      const ref = String(body.ref ?? "").trim().toUpperCase();
      if (ref) {
        const referrerId = await findUserIdByReferralCode(db, ref);
        if (referrerId) newUser.referredBy = referrerId;
      }
      const result = await db.collection("users").insertOne(newUser);
      user = { _id: result.insertedId, ...newUser };
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

    // The profile phone rides along with the pending OTP instead of going onto
    // the user document now. Writing it here would let anyone permanently burn
    // any number by starting a registration they never finish.
    const otpUnset: Record<string, string> = isEmailFlow
      ? { phone: "" }
      : { email: "" };
    if (pendingPhone) otpSet.pendingPhone = pendingPhone;
    else otpUnset.pendingPhone = "";

    await db.collection("otps").updateOne(
      query,
      { $set: otpSet, $unset: otpUnset },
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
    console.error("Error sending registration OTP:", error);
    const message =
      error instanceof Error && error.message ? error.message : "Failed to send OTP";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
