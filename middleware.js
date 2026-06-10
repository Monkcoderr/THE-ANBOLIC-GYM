import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "gym_session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/members",
  "/leads",
  "/analytics",
  "/api/members",
  "/api/leads",
  "/api/analytics",
];

function isProtected(pathname) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

async function verify(token) {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = await verify(token);

  if (!session) {
    // API routes get a JSON 401; pages get redirected to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/members/:path*",
    "/leads/:path*",
    "/analytics/:path*",
    "/api/members/:path*",
    "/api/leads/:path*",
    "/api/analytics/:path*",
  ],
};
