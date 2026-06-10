import { cookies } from "next/headers";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Admin from "@/models/Admin";
import { ok, fail } from "@/lib/apiResponse";
import {
  hashPin,
  signToken,
  COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const SetupSchema = z.object({
  gymName: z.string().trim().min(2, "Gym name must be at least 2 characters"),
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

// POST /api/auth/setup — public. Creates the single admin. Fails if one exists.
export async function POST(request) {
  try {
    await connectDB();

    const existing = await Admin.findOne().lean();
    if (existing) {
      return fail("Admin already exists", "ADMIN_EXISTS", 409);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = SetupSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }

    const { gymName, pin } = parsed.data;
    const pinHash = await hashPin(pin);
    const admin = await Admin.create({ gymName, pinHash });

    const token = signToken({ adminId: admin._id.toString(), gymName });
    cookies().set(COOKIE_NAME, token, sessionCookieOptions());

    return ok({ gymName });
  } catch (err) {
    return fail("Setup failed", "SETUP_FAILED", 500);
  }
}
