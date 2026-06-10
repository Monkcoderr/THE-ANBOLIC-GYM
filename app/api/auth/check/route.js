import { connectDB } from "@/lib/mongodb";
import Admin from "@/models/Admin";
import { ok, fail } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

// GET /api/auth/check — public. Reports whether an admin exists + gym name.
export async function GET() {
  try {
    await connectDB();
    const admin = await Admin.findOne().lean();
    return ok({
      adminExists: !!admin,
      gymName: admin?.gymName || null,
    });
  } catch (err) {
    return fail("Unable to check setup status", "CHECK_FAILED", 500);
  }
}
