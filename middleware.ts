import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/request", "/api/auth/verify", "/api/health", "/api/fb/webhook"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/reject" ||
    pathname.startsWith("/reject/")
  ) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
