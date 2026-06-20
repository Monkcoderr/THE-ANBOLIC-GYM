import { cookies } from "next/headers";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import Admin from "@/models/Admin";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import {
  comparePin,
  hashPin,
  signToken,
  COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const ChangePinSchema = z
  .object({
    currentPin: z.string().regex(/^\d{6}$/, "Current PIN must be 6 digits"),
    newPin: z.string().regex(/^\d{6}$/, "New PIN must be 6 digits"),
  })
  .refine((d) => d.currentPin !== d.newPin, {
    message: "New PIN must be different from current PIN",
    path: ["newPin"],
  });

// POST /api/auth/change-pin — auth required.
// Verifies the current PIN, then replaces it with a new hashed PIN.
export async function POST(request) {
  try {
    const { session, response } = await requireAuth();
    if (!session) return response;

    await connectDB();

    const body = await request.json().catch(() => ({}));
    const parsed = ChangePinSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message || "Invalid input",
        "VALIDATION_ERROR",
        422
      );
    }

    const { currentPin, newPin } = parsed.data;

    const admin = await Admin.findById(session.adminId);
    if (!admin) {
      return fail("No admin configured", "NO_ADMIN", 404);
    }

    const match = await comparePin(currentPin, admin.pinHash);
    if (!match) {
      return fail("Current PIN is incorrect", "WRONG_PIN", 401);
    }

    admin.pinHash = await hashPin(newPin);
    await admin.save();

    // Refresh the session cookie so the 30-day window restarts.
    const token = signToken({
      adminId: admin._id.toString(),
      gymName: admin.gymName,
    });
    cookies().set(COOKIE_NAME, token, sessionCookieOptions());

    return ok({ gymName: admin.gymName });
  } catch (err) {
    return fail("Could not change PIN", "CHANGE_PIN_FAILED", 500);
  }
}
