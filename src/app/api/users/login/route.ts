import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { success: false, message: "Login is only allowed via phone number and OTP. Use /api/users/otp/send and /api/users/otp/verify." },
    { status: 400 }
  );
}
