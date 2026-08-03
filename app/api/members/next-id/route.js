import { connectDB } from "@/lib/mongodb";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { computeNextMemberId } from "@/lib/memberId";

export const dynamic = "force-dynamic";

// GET /api/members/next-id — suggest the next sequential Custom Member ID for a
// NEW member. Used to prefill the form; the value is only a suggestion and is
// re-validated (and safely retried on collision) when the member is created.
export async function GET() {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const nextId = await computeNextMemberId();
    return ok({ nextId });
  } catch (err) {
    return fail("Unable to generate a member ID", "MEMBER_ID_FAILED", 500);
  }
}
