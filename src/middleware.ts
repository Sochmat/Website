import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { parseHost } from "@/lib/subdomain";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login", "/api/admin/logout"];
const isPublicAdminPath = (p: string) =>
  PUBLIC_ADMIN_PATHS.some((x) => p === x || p.startsWith(x + "/"));

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const scope = parseHost(request.headers.get("host"), process.env.ROOT_DOMAIN || "localhost");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-scope", scope.kind);
  if (scope.kind === "tenant") requestHeaders.set("x-tenant-slug", scope.slug);
  else requestHeaders.delete("x-tenant-slug");
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/print/")) {
    const limited = await rateLimit(request, limiters.global);
    if (limited) return limited;
  }

  const needsAuth =
    (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) &&
    !isPublicAdminPath(pathname);

  if (needsAuth) {
    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    const ok =
      !!session &&
      (scope.kind === "super"
        ? session.role === "superadmin"
        : scope.kind === "tenant" &&
          session.role !== "superadmin" &&
          session.tenantSlug === scope.slug);
    if (!ok) {
      if (pathname.startsWith("/api/"))
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }
  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
