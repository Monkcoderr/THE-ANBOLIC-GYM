import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { ok, fail, requireAuth } from "@/lib/apiResponse";
import { decorateMember } from "@/lib/memberUtils";

export const dynamic = "force-dynamic";

// GET /api/members/deleted — soft-deleted members, most recently deleted
// first. Powers the "Recently deleted" restore view so an accidental delete
// can be undone with all original details, ID, and payment history intact.
export async function GET() {
  const { response } = await requireAuth();
  if (response) return response;

  try {
    await connectDB();
    const raw = await Member.find({ isDeleted: true })
      .select("-address -notes -__v")
      .sort({ updatedAt: -1 })
      .lean();
    const members = raw.map((m) => decorateMember(m));
    return ok({ members, totalCount: members.length });
  } catch (err) {
    return fail("Unable to load deleted members", "DELETED_FETCH_FAILED", 500);
  }
}
