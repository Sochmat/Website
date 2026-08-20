import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { isSubscriptionHost } from "@/lib/subscription";
import {
  SHOP_HOME,
  shopMayCallApi,
  shopMayOpenPage,
} from "@/lib/shopAccess";

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

  // Temporarily blocked: the /subscribe flow is disabled for now. Send any
  // visitor (on any host) back to the home page. Remove this to re-enable.
  if (pathname === "/subscribe" || pathname.startsWith("/subscribe/")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Subscription subdomain: render the /subscription route group for this host.
  // API routes and Next internals are shared and must NOT be rewritten.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (isSubscriptionHost(host)) {
    // The admin surface is never available on the subscription host.
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/admin") ||
      pathname.startsWith("/inventory-management") ||
      pathname.startsWith("/api/inventory")
    ) {
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
  // Internal print endpoints (polled by the in-store print agent) are exempt.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/print/")) {
    const limited = await rateLimit(request, limiters.global);
    if (limited) return limited;
  }

  // Gate the admin surface (dashboard pages + admin APIs) behind a valid,
  // signed session cookie. Auth is enforced here on the server — client-side
  // localStorage role flags are UI sugar only and are not trusted.
  //
  // Inventory management is a separate route group but shares the same admin
  // session: you sign in at /admin/login and that cookie unlocks both.
  const needsAuth =
    (pathname.startsWith("/api/admin") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/inventory-management") ||
      pathname.startsWith("/api/inventory")) &&
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

    // A valid session is not the same as a session for this. The shop role is
    // scoped to Menu, Orders and Add Stock; everything else on the admin
    // surface is refused here, on the server, rather than merely hidden by the
    // sidebar. See src/lib/shopAccess.ts.
    //
    // One deliberate looseness: /api/admin/menu is allowed as PUT so the
    // kitchen can mark an item sold out, which is more than the shop UI
    // exposes. Narrowing it to the `hidden` field means reading the body, and
    // that belongs in the route handler, not in Edge middleware that would
    // have to buffer every request to do it.
    if (session.role === "shop") {
      if (pathname.startsWith("/api/")) {
        if (!shopMayCallApi(pathname, request.method)) {
          return NextResponse.json(
            { success: false, message: "Forbidden" },
            { status: 403 },
          );
        }
      } else if (!shopMayOpenPage(pathname)) {
        // /admin itself is left alone: it is a bare redirector that already
        // sends the shop role to its own landing page.
        if (pathname !== "/admin") {
          return NextResponse.redirect(new URL(SHOP_HOME, request.url));
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
