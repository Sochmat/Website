import { NextRequest, NextResponse } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, createSession } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/mongodb";
import { authenticate } from "./authenticate";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.auth);
  if (limited) return limited;
  try {
    const body = await request.json();
    // Accept both new `email` field and legacy `user` field from the existing login page.
    const email = body.email ?? body.user;
    const { password } = body;

    const scopeKind = request.headers.get("x-tenant-scope");
    const slug = request.headers.get("x-tenant-slug");
    const scope =
      scopeKind === "super"
        ? { kind: "super" as const }
        : scopeKind === "tenant"
          ? { kind: "tenant" as const, slug: slug ?? "" }
          : { kind: scopeKind ?? "unknown" };

    const { db } = await connectToDatabase();
    const payload = await authenticate(db, scope, email, password);

    if (payload) {
      const token = createSession(payload);
      const res = NextResponse.json({ success: true, role: payload.role });
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
