import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_PATHS = ["/", "/menu", "/admin", "/api"];

function isAllowed(pathname: string): boolean {
  return true;
  return ALLOWED_PATHS.some(
    (allowedPath) =>
      pathname === allowedPath || pathname.startsWith(allowedPath + "/"),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAllowed(pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
