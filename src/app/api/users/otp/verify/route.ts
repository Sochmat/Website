import { NextRequest, NextResponse } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.auth);
  if (limited) return limited;
  try {
    const body = await request.json();
    const phone = String(body.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const otp = String(body.otp ?? "").trim();
    const isEmailFlow = Boolean(email);

    if (!phone && !email) {
      return NextResponse.json(
        { success: false, message: "Phone number or email is required" },
        { status: 400 }
      );
    }

    if (!otp) {
      return NextResponse.json(
        { success: false, message: "OTP is required" },
        { status: 400 }
      );
    }

    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const query = isEmailFlow ? { email } : { phone };
    const otpRecord = await t.findOne("otps", query);

    if (!otpRecord) {
      return NextResponse.json(
        { success: false, message: "OTP not found. Please request a new OTP." },
        { status: 404 }
      );
    }

    if (new Date() > otpRecord.expiresAt) {
      await t.deleteOne("otps", query);
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

    const user = await t.findOne("users", query);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    await t.deleteOne("otps", query);

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
    console.error("Error verifying OTP:", error);
    return NextResponse.json(
      { success: false, message: "Failed to verify OTP" },
      { status: 500 }
    );
  }
}
