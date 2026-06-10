import { cookies, headers } from "next/headers";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Admin from "@/models/Admin";
import { ok, fail } from "@/lib/apiResponse";
import {
  comparePin,
  signToken,
  COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

function getClientIp() {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

// POST /api/auth/login — public. Verifies PIN, sets session cookie.
export async function POST(request) {
  try {
    const ip = getClientIp();
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      const retryAfterSec = Math.ceil(limit.retryAfterMs / 1000);
      return fail(
        "Too many failed attempts. Please try again later.",
        "RATE_LIMITED",
        429
      );
    }

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid PIN",
        "VALIDATION_ERROR",
        422
      );
    }

    const admin = await Admin.findOne();
    if (!admin) {
      return fail("No admin configured", "NO_ADMIN", 404);
    }

    const match = await comparePin(parsed.data.pin, admin.pinHash);
    if (!match) {
      recordFailure(ip);
      const after = checkRateLimit(ip);
      return fail("Wrong PIN", "WRONG_PIN", 401);
    }

    resetRateLimit(ip);
    const token = signToken({
      adminId: admin._id.toString(),
      gymName: admin.gymName,
    });
    cookies().set(COOKIE_NAME, token, sessionCookieOptions());

    return ok({ gymName: admin.gymName });
  } catch (err) {
    return fail("Login failed", "LOGIN_FAILED", 500);
  }
}
