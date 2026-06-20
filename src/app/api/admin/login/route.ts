import { NextRequest, NextResponse } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";

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
      const token = Buffer.from(`${user}:${role}:${Date.now()}`).toString(
        "base64",
      );
      return NextResponse.json({ success: true, token, role });
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
