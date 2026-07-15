import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { isSubscriptionHost } from "@/lib/subscription";

// Public admin paths that must NOT require a session (otherwise you could never
// log in). Everything else under /admin and /api/admin requires a valid cookie.
const PUBLIC_ADMIN_PATHS = [
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
];

function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Subscription subdomain: render the /subscription route group for this host.
  // API routes and Next internals are shared and must NOT be rewritten.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (isSubscriptionHost(host)) {
    // The admin surface is never available on the subscription host.
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/subscription") &&
      !pathname.startsWith("/_next")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/subscription${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Lenient blanket per-IP limit on every API request. Sensitive routes apply
  // their own stricter limits inside the handler. Fails open if Redis is down.
  if (pathname.startsWith("/api/")) {
    const limited = await rateLimit(request, limiters.global);
    if (limited) return limited;
  }

  // Gate the admin surface (dashboard pages + admin APIs) behind a valid,
  // signed session cookie. Auth is enforced here on the server — client-side
  // localStorage role flags are UI sugar only and are not trusted.
  const needsAuth =
    (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) &&
    !isPublicAdminPath(pathname);

  if (needsAuth) {
    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, message: "Unauthorized" },
          { status: 401 },
        );
      }
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
