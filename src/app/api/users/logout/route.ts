import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, customerCookieOptions } from "@/lib/customerAuth";

/** Clears the httpOnly customer session. The client separately drops its localStorage copy. */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(CUSTOMER_COOKIE, "", { ...customerCookieOptions(), maxAge: 0 });
  return response;
}
