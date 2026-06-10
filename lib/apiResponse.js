import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";

/**
 * Standard success envelope: { success: true, data }.
 */
export function ok(data, init = {}) {
  return NextResponse.json({ success: true, data }, init);
}

/**
 * Standard error envelope: { success: false, error, code }.
 */
export function fail(error, code = "ERROR", status = 400) {
  return NextResponse.json({ success: false, error, code }, { status });
}

/**
 * Verify the session cookie. Returns the decoded JWT payload, or null.
 */
export async function getSession() {
  const store = cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Guard for API routes. Returns { session } when authed, otherwise
 * returns { response } with a 401 envelope to return immediately.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      response: fail("Authentication required", "UNAUTHORIZED", 401),
    };
  }
  return { session, response: null };
}
