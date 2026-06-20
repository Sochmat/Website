import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";

const ALLOWED_PATHS = ["/", "/menu", "/admin", "/api"];
const ALLOWED_PATHS2 = ["/"];

function isAllowed(pathname: string): boolean {
  return true;
  return ALLOWED_PATHS.some(
    (allowedPath) =>
      pathname === allowedPath || pathname.startsWith(allowedPath + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Lenient blanket per-IP limit on every API request. Sensitive routes apply
  // their own stricter limits inside the handler. Fails open if Redis is down.
  // Internal print endpoints (polled by the in-store print agent) are exempt.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/print/")) {
    const limited = await rateLimit(request, limiters.global);
    if (limited) return limited;
  }

  if (isAllowed(pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
