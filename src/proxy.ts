import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "safelinkhub_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(COOKIE_NAME);

  if (pathname.startsWith("/admin") && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callback", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    (pathname === "/auth/login" || pathname === "/auth/register") &&
    hasSession
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/auth/login", "/auth/register"],
};
