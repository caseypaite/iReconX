import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

const adminRoutePrefixes = ["/admin", "/api/admin"];
const userRoutePrefixes = ["/dashboard", "/api/explorer", "/api/auth/me"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isAdminRoute = matchesPrefix(pathname, adminRoutePrefixes);
  const isProtectedRoute = isAdminRoute || matchesPrefix(pathname, userRoutePrefixes);

  if (!token) {
    if (isProtectedRoute) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  }

  try {
    const session = await verifySessionToken(token);

    if (pathname === "/login") {
      return NextResponse.redirect(
        new URL(session.role === "ADMIN" ? "/admin" : "/dashboard", request.url)
      );
    }

    if (isAdminRoute && session.role !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.redirect(new URL("/forbidden", request.url));
    }

    return NextResponse.next();
  } catch {
    if (isProtectedRoute) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/admin/:path*", "/api/admin/:path*", "/api/explorer/:path*", "/api/auth/me"]
};
