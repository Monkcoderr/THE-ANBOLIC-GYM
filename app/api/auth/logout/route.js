import { cookies } from "next/headers";
import { ok } from "@/lib/apiResponse";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — clears the session cookie.
export async function POST() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return ok({ success: true });
}
