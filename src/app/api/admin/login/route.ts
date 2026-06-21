import { NextRequest, NextResponse } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, signSession } from "@/lib/adminAuth";

type Role = "admin" | "shop";

function matchRole(user: string, password: string): Role | null {
  if (
    process.env.ADMIN_USER &&
    process.env.ADMIN_PASSWORD &&
    user === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return "admin";
  }
  if (
    process.env.SHOP_USER &&
    process.env.SHOP_PASSWORD &&
    user === process.env.SHOP_USER &&
    password === process.env.SHOP_PASSWORD
  ) {
    return "shop";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.auth);
  if (limited) return limited;
  try {
    const { user, password } = await request.json();

    const role = matchRole(user, password);
    if (role) {
      // The real credential is a signed, httpOnly session cookie. The returned
      // role is only used client-side to pick which UI to render.
      const token = await signSession(role);
      const res = NextResponse.json({ success: true, role });
      res.cookies.set(ADMIN_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return res;
    }

    return NextResponse.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 },
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
